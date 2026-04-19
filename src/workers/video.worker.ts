import { Worker } from 'bullmq';
import fs from 'fs';
import { runffmpeg } from '../utils/ffmpeg.js';
import { StorageFactory } from '../storage/storage-factory.js';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaService } from '../prisma.service.js';
import { FFPROBE } from '../constants.js';

dotenv.config();

const storageFactory = new StorageFactory();
const storage = storageFactory.createStorageService();
const prisma = new PrismaService();
console.log('WORKER: Script starting...');
const worker = new Worker(
  'video-processing',
  async (job) => {
    console.log('=== WORKER: Job received ===');
    const { videoId, path: objectKey } = job.data;
    const objectName = objectKey.replace(new RegExp(`netflix-videos/`), '');
    // const objectName = objectKey.replace(new RegExp(`videos/`), '');
    console.log('Video ID:', videoId);
    console.log('Object Key:', objectKey);
    const localPath = `./tmp/${path.basename(objectKey)}`;
    const outputPath = `./tmp/hls/${videoId}`;
    const thumbnailPath = `./tmp/${videoId}-thumbnail.jpg`;
    try {
      fs.mkdirSync(outputPath, { recursive: true });
      console.log('=== WORKER: Starting download ===');
      await storage.downloadFile(
        `${process.env.R2_BUCKET}`,
        objectName,
        localPath,
      );
      const {
        width: w360,
        height: h360,
        bitrate: b360,
      } = FFPROBE.QUALITIES[360];
      const {
        width: w480,
        height: h480,
        bitrate: b480,
      } = FFPROBE.QUALITIES[480];
      const {
        width: w720,
        height: h720,
        bitrate: b720,
      } = FFPROBE.QUALITIES[720];

      await runffmpeg(
        `ffmpeg -i "${localPath}" -filter_complex "[0:v]split=3[v1][v2][v3];[v1]scale=w=${w360}:h=${h360}[v360];[v2]scale=w=${w480}:h=${h480}[v480];[v3]scale=w=${w720}:h=${h720}[v720]" -map "[v360]" -map a:0 -b:v:0 ${b360}k -map "[v480]" -map a:0 -b:v:1 ${b480}k -map "[v720]" -map a:0 -b:v:2 ${b720}k -preset veryfast -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" -master_pl_name master.m3u8 -f hls -hls_time ${FFPROBE.HLS_TIME} -hls_playlist_type vod -hls_segment_filename "${outputPath}/v%v/segment_%03d.ts" "${outputPath}/v%v/index.m3u8"`,
      );

      await runffmpeg(
        `ffmpeg -ss 00:00:03 -i "${localPath}" -vf "select='gt(scene,0.4)',scale=640:360" -frames:v 1 "${thumbnailPath}"`,
      );

      await storage.uploadFile(
        `${process.env.R2_BUCKET}`,
        `thumbnails/${videoId}.jpg`,
        `./tmp/${videoId}-thumbnail.jpg`,
      );

      await prisma.video.update({
        where: { id: videoId },
        data: {
          thumbnailUrl: `thumbnails/${videoId}.jpg`,
        },
      });

      const getAllFiles = (
        dir: string,
        prefix = '',
      ): { fullPath: string; key: string }[] => {
        let results: { fullPath: string; key: string }[] = [];
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const full = path.join(dir, file);
          if (fs.statSync(full).isDirectory()) {
            results = results.concat(getAllFiles(full, `${prefix}${file}/`));
          } else {
            results.push({ fullPath: full, key: `${prefix}${file}` });
          }
        }
        return results;
      };

      const allFilesToUpload = getAllFiles(outputPath);
     
      const BATCH_SIZE = 20;

      console.log(
        `**** WORKER: Starting concurrent uploads of ${allFilesToUpload.length} files ****`,
      );
      for (let i = 0; i < allFilesToUpload.length; i += BATCH_SIZE) {
        const batch = allFilesToUpload.slice(i, i + BATCH_SIZE);

        const uploadPromises = batch.map(async ({ fullPath, key }) => {
          console.log(
            `[BATCH ${Math.ceil((i + 1) / BATCH_SIZE)}] Starting: ${key}`,
          );
          const retry = 3;
          let attempts = 0;
          while (attempts < retry) {
            try {
              await storage.uploadFile(
                `${process.env.R2_BUCKET}`,
                `streams/${videoId}/${key}`,
                fullPath,
              );
              break;
            } catch (error) {
              attempts++;
              if (attempts < retry) {
                await new Promise((res) => setTimeout(res, 1000));
              } else {
                throw new Error(
                  `Failed to upload ${key} after ${retry} attempts`,
                );
              }
            }
          }
        });
        await Promise.allSettled(uploadPromises);
        console.log(
          `Uploaded batch ${Math.ceil(i / BATCH_SIZE) + 1} of ${Math.ceil(allFilesToUpload.length / BATCH_SIZE)}`,
        );
      }
      console.log(`**** Worker: all files are uploaded sucessfully ****`);

      await prisma.video.update({
        where: { id: videoId },
        data: {
          status: 'READY',
          streamUrl: `streams/${videoId}/master.m3u8`,
        },
      });
    } catch (error) {
      console.error(`=== WORKER: Error processing video ${videoId} ===`, error);

      try {
        await prisma.video.update({
          where: { id: videoId },
          data: { status: 'FAILED' },
        });
      } catch (dbError) {
        console.error('Failed to update status to FAILED in DB:', dbError);
      }

      throw error;
    } finally {
      console.log(`=== WORKER: Cleaning up temporary files for ${videoId} ===`);
      fs.rmSync(localPath, { force: true });
      fs.rmSync(thumbnailPath, { force: true });
      fs.rmSync(outputPath, { recursive: true, force: true });
    }
  },
  {
    connection: {
      host: process.env.UPSTASH_REDIS_REST_URL,
      port: Number(process.env.UPSTASH_REDIS_REST_PORT),
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
      tls: {
        rejectUnauthorized: false,
      },
    },
  },
);

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

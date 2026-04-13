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

const worker = new Worker(
  'video-processing',
  async (job) => {
    const { videoId, path: objectKey } = job.data;
    const objectName = objectKey.replace(new RegExp(`netflix-videos/`), '');
    // const objectName = objectKey.replace(new RegExp(`videos/`), '');

    const localPath = `./tmp/${path.basename(objectKey)}`;
    const outputPath = `./tmp/hls/${videoId}`;

    fs.mkdirSync(outputPath, { recursive: true });

    await storage.downloadFile(`${process.env.R2_BUCKET}`, objectName, localPath);
    const { width: w360, height: h360, bitrate: b360 } = FFPROBE.QUALITIES[360];
    const { width: w480, height: h480, bitrate: b480 } = FFPROBE.QUALITIES[480];
    const { width: w720, height: h720, bitrate: b720 } = FFPROBE.QUALITIES[720];

    await runffmpeg(
      `ffmpeg -i "${localPath}" -filter_complex "[0:v]split=3[v1][v2][v3];[v1]scale=w=${w360}:h=${h360}[v360];[v2]scale=w=${w480}:h=${h480}[v480];[v3]scale=w=${w720}:h=${h720}[v720]" -map "[v360]" -map a:0 -b:v:0 ${b360}k -map "[v480]" -map a:0 -b:v:1 ${b480}k -map "[v720]" -map a:0 -b:v:2 ${b720}k -preset veryfast -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" -master_pl_name master.m3u8 -f hls -hls_time ${FFPROBE.HLS_TIME} -hls_playlist_type vod -hls_segment_filename "${outputPath}/v%v/segment_%03d.ts" "${outputPath}/v%v/index.m3u8"`,
    );

    await runffmpeg(
      `ffmpeg -i "${localPath}" -vf "select=eq(n\\,0),scale=640:360" -frames:v 1 "./tmp/${videoId}-thumbnail.jpg"`,
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

    const uploadFolder = async (dir: string, prefix = '') => {
      const files = fs.readdirSync(dir);
      let uploadFailed = false;
      for (const file of files) {
        const full = path.join(dir, file);

        if (fs.statSync(full).isDirectory()) {
          await uploadFolder(full, `${prefix}${file}/`);
        } else {
          const retry = 3; // doing retries because faced some issue when uploading to r2
          let attempts = 0;
          while (attempts < retry) {
            try {
              await storage.uploadFile(
                `${process.env.R2_BUCKET}`,
                `streams/${videoId}/${prefix}${file}`,
                full,
              );
              break;
            } catch (error) {
              attempts++;
              if (attempts < retry) {
                await new Promise((res) => setTimeout(res, 1000));
              }
            }
          }
          if(attempts >=retry) {
            uploadFailed = true;
          }
        }
      }
      if(uploadFailed) {
        throw new Error('Failed to upload all files after multiple attempts');
      }
    };
    await uploadFolder(outputPath);

    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'READY',
        streamUrl: `streams/${videoId}/master.m3u8`,
      },
    });

    fs.rmSync(localPath);
    fs.rmSync(outputPath, { recursive: true, force: true });

  },
  {
    connection: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
    },
  },
);

process.on('SIGINT', async () => {
      await prisma.$disconnect();
      process.exit(0);
    });

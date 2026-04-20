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
const now = () => Number(process.hrtime.bigint()) / 1e6; // ms
console.log('WORKER: Script starting...');

const worker = new Worker(
  'video-processing',
  async (job) => {
    

    // 🔽 Download
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

      // 🔽 Transcoding

      const useGPU = process.env.USE_GPU === 'true';
      console.log(`⚙️ Mode: ${useGPU ? 'GPU (NVENC)' : 'CPU'}`);

      await runffmpeg(
        localPath,outputPath,useGPU,'TRANSCODE'
      );

      //🔽 Thumbnail generation

      await runffmpeg(
        localPath,thumbnailPath,useGPU,'THUMBNAIL'
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

      // 🔽 Upload
      const uploadStart = now();
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

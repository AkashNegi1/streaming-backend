import { Worker } from 'bullmq';
import fs from 'fs';
import { runffmpeg } from '../utils/ffmpeg.js';
import { StorageFactory } from '../storage/storage-factory.js';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaService } from '../prisma.service.js';
import chokidar from 'chokidar';

dotenv.config();

const storageFactory = new StorageFactory();
const storage = storageFactory.createStorageService();
const prisma = new PrismaService();
const now = () => Number(process.hrtime.bigint()) / 1e6; // ms
console.log('WORKER: Script starting...');

const worker = new Worker(
  'video-processing',
  async (job) => {
    //  Download
    const { videoId, path: objectKey } = job.data;
    const objectName = objectKey.replace(new RegExp(`netflix-videos/`), '');
    const localPath = `./tmp/${path.basename(objectKey)}`;
    const outputPath = `./tmp/hls/${videoId}`;
    const thumbnailPath = `./tmp/${videoId}-thumbnail.jpg`;
    try {
      fs.mkdirSync(outputPath, { recursive: true });
      console.log('=== WORKER: Starting download ===');
      await job.updateProgress(0);
      await storage.downloadFile(
        `${process.env.R2_BUCKET}`,
        objectName,
        localPath,
      );
      await job.updateProgress(10);

      const activeUploads: Promise<any>[] = [];
      let filesUploaded = 0;
      let failedUploads = 0;
      const processedFiles = new Set<string>();
      console.log('👀 Starting Chokidar Watcher...');
      const watcher = chokidar.watch(outputPath, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
      });
      watcher.on('add', (filePath) => {
        if (processedFiles.has(filePath)) {
           // Silently ignore the duplicate event
           return; 
        }
        if (filePath.endsWith('.ts')) {
          const relativePath = path
            .relative(outputPath, filePath)
            .replace(/\\/g, '/');
          const r2Key = `streams/${videoId}/${relativePath}`;

          console.log(`🚀 Instant Upload triggered: ${relativePath}`);
          // Wrap your existing retry logic in an async IIFE (Immediately Invoked Function Expression)
            const uploadTask = (async () => {
              const retry = 3;
              let attempts = 0;
              while (attempts < retry) {
                try {
                  await storage.uploadFile(
                    `${process.env.R2_BUCKET}`,
                    r2Key,
                    filePath,
                  );
                  filesUploaded++;
                  break; // Success! Exit the retry loop.
                } catch (error) {
                  attempts++;
                  if (attempts >= retry) {
                    failedUploads++;
                    console.error(
                      `Failed to upload ${r2Key} after 3 attempts.`,
                    );
                    throw error; // This ensures Promise.allSettled catches the rejection
                  }
                  await new Promise((res) => setTimeout(res, 1000));
                }
              }
            })();

            activeUploads.push(uploadTask);
          
        }
      });
      //  Transcoding

      const useGPU = process.env.USE_GPU === 'true';
      console.log(`⚙️ Mode: ${useGPU ? 'GPU (NVENC)' : 'CPU'}`);

      let lastBroadcastedPercent = -1;
      await runffmpeg(localPath, outputPath, useGPU, 'TRANSCODE', async (percent) => {
        // Math: Base (10) + (FFmpeg Percent * 0.8 weight)
        const absoluteProgress = Math.floor(10 + (percent * 0.8)); 
        if(absoluteProgress > lastBroadcastedPercent){
          lastBroadcastedPercent = absoluteProgress;
          await job.updateProgress(absoluteProgress);
        }
      });

      //Thumbnail generation

      await runffmpeg(localPath, thumbnailPath, useGPU, 'THUMBNAIL');

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

      
 
      // Cleanup & Final Playlists 90% -> 100%
      console.log(`⏳ Waiting for ${activeUploads.length - filesUploaded} trailing chunk uploads to finish...`);
      await watcher.close(); // Stop listening for new files
      
      const uploadResults = await Promise.allSettled(activeUploads);

      if (failedUploads > 0) {
        throw new Error(`Critical Failure: ${failedUploads} video chunks failed to upload to R2.`);
      }
      console.log('Uploading final master.m3u8 playlists...');
      const getAllFiles = (dir: string, prefix = ''): { fullPath: string; key: string }[] => {
        let results: { fullPath: string; key: string }[] = [];
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const full = path.join(dir, file);
          if (fs.statSync(full).isDirectory()) {
            results = results.concat(getAllFiles(full, `${prefix}${file}/`));
          } else {
            results.push({ fullPath: full, key: `${prefix}${file}`.replace(/\\/g, '/') });
          }
        }
        return results;
      };

      const allFiles = getAllFiles(outputPath);
      const playlists = allFiles.filter(f => f.key.endsWith('.m3u8'));

      for (const playlist of playlists) {
        await storage.uploadFile(
          `${process.env.R2_BUCKET}`,
          `streams/${videoId}/${playlist.key}`,
          playlist.fullPath
        );
      }

      console.log(`**** Worker: All files uploaded successfully ****`);

      
      await prisma.video.update({
        where: { id: videoId },
        data: {
          status: 'READY',
          streamUrl: `streams/${videoId}/master.m3u8`,
        },
      });
      await job.updateProgress(100);
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

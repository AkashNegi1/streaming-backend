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
const now = () => Number(process.hrtime.bigint()) / 1e6;

const worker = new Worker(
  'video-processing',
  async (job) => {
    /*
     * Extract job data: videoId identifies the DB record,
     * path is the R2 object key for the uploaded source video.
     */
    const { videoId, path: objectKey } = job.data;
    const objectName = objectKey.replace(new RegExp(`netflix-videos/`), '');
    const localPath = `./tmp/${path.basename(objectKey)}`;
    const outputPath = `./tmp/hls/${videoId}`;
    const thumbnailPath = `./tmp/${videoId}-thumbnail.jpg`;
    try {
      /*
       * Step 1: Download the source video from R2 to local disk.
       * Progress goes from 0% to 10%.
       */
      fs.mkdirSync(outputPath, { recursive: true });
      await job.updateProgress(0);
      await storage.downloadFile(
        `${process.env.R2_BUCKET}`,
        objectName,
        localPath,
      );
      await job.updateProgress(10);

      /*
       * Step 2: Watch the HLS output directory for new .ts segments.
       * Each segment is uploaded to R2 immediately as FFmpeg produces it,
       * so uploads overlap with transcoding instead of waiting until the end.
       */
      const activeUploads: Promise<any>[] = [];
      let filesUploaded = 0;
      let failedUploads = 0;
      const processedFiles = new Set<string>();
      const watcher = chokidar.watch(outputPath, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
      });
      watcher.on('add', (filePath) => {
        if (processedFiles.has(filePath)) {
          return;
        }
        if (filePath.endsWith('.ts')) {
          const relativePath = path
            .relative(outputPath, filePath)
            .replace(/\\/g, '/');
          const r2Key = `streams/${videoId}/${relativePath}`;

          const uploadTask = (async () => {
            /*
             * Retry up to 3 times with 1s delay between attempts.
             * This handles transient R2 failures without failing the whole job.
             */
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
                break;
              } catch (error) {
                attempts++;
                if (attempts >= retry) {
                  failedUploads++;
                  console.error(
                    `Failed to upload ${r2Key} after 3 attempts.`,
                  );
                  throw error;
                }
                await new Promise((res) => setTimeout(res, 1000));
              }
            }
          })();

          activeUploads.push(uploadTask);
        }
      });

      /*
       * Step 3: Transcode the source video into HLS chunks using FFmpeg.
       * Progress goes from 10% to 90% (maps FFmpeg's 0-100% to 10-90 window).
       * GPU (NVENC) is used when USE_GPU=true, otherwise falls back to CPU.
       */
      const useGPU = process.env.USE_GPU === 'true';

      let lastBroadcastedPercent = -1;
      await runffmpeg(localPath, outputPath, useGPU, 'TRANSCODE', async (percent) => {
        const absoluteProgress = Math.floor(10 + (percent * 0.8));
        if(absoluteProgress > lastBroadcastedPercent){
          lastBroadcastedPercent = absoluteProgress;
          await job.updateProgress(absoluteProgress);
        }
      });

      /*
       * Step 4: Generate a thumbnail from the source video.
       * Uses FFmpeg to extract a single frame.
       */
      await runffmpeg(localPath, thumbnailPath, useGPU, 'THUMBNAIL');

      /*
       * Step 5: Upload the thumbnail to R2 and save its URL in the database.
       */
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

      /*
       * Step 6: Wait for any in-flight chunk uploads to finish,
       * then upload the .m3u8 playlist files (master + variant playlists).
       */
      await watcher.close();

      await Promise.allSettled(activeUploads);

      if (failedUploads > 0) {
        throw new Error(`Critical Failure: ${failedUploads} video chunks failed to upload to R2.`);
      }

      /*
       * Recursively collect all files in the HLS output directory.
       */
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

      /*
       * Step 7: Mark the video as READY in the database with its stream URL.
       * Progress reaches 100%.
       */
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

      /*
       * On failure, mark the video as FAILED in the database so the frontend
       * can show an appropriate status to the user.
       */
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
      /*
       * Always clean up temporary files, even on failure.
       * Prevents disk from filling up with orphaned transcodes.
       */
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

/*
 * Gracefully disconnect from Prisma and exit on SIGINT
 * so the worker can be shut down cleanly in containerized environments.
 */
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

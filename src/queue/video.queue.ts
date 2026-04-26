import { Queue } from 'bullmq';
import dotenv from 'dotenv'
dotenv.config();
export const videoQueue = new Queue('video-processing', {
  connection: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    tls: {
      rejectUnauthorized: false,
    },
  },
});

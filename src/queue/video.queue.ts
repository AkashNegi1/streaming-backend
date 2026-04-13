import { Queue } from "bullmq"

export const videoQueue = new Queue("video-processing", {
  connection:{
    host: process.env.REDIS_HOST ,
    port: Number(process.env.REDIS_PORT),
  },
})
import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service.js';
import { videoQueue } from '../queue/video.queue.js';
import { StorageFactory } from '../storage/storage-factory.js';
import { VIDEO } from '../constants.js';
import { stat } from 'fs';

interface VideoFile {
  originalname: string;
  buffer: Buffer;
}

@Injectable()
export class VideosService {
  private storage;
  constructor(
    private storageFactory: StorageFactory,
    private prisma: PrismaService,
  ) {
    this.storage = this.storageFactory.createStorageService();
  }

  async uploadVideo(file: VideoFile, userId: string) {
    if (!file || !file.originalname) {
      throw new BadRequestException('Invalid file');
    }

    if (file.buffer.length > VIDEO.MAX_FILE_SIZE) {
      throw new BadRequestException('File too large');
    }

    const allowedMimeTypes = VIDEO.ALLOWED_MIME_TYPES;
    if (
      !allowedMimeTypes.some((type) =>
        file.originalname.toLowerCase().endsWith(type.split('/')[1]),
      )
    ) {
      throw new BadRequestException('Invalid file type');
    }

    const filename = `${randomUUID()}-${file.originalname}`;
    const path = await this.storage.uploadFile(
      'netflix-videos',
      filename,
      file.buffer,
    );

    const video = await this.prisma.video.create({
      data: {
        title: file.originalname,
        originalUrl: path,
        status: 'PROCESSING',
        createdById: userId,
      },
    });

    await videoQueue.add(
      'video-processing',
      {
        videoId: video.id,
        path: path,
        removeOnComplete: true,
      },
      {
        jobId: video.id, // 🚨 THE FIX: Force the BullMQ Job ID to equal your Video ID
      },
    );

    return video;
  }

  async getProgress(userId: string, videoId: string) {
    const watchHistory = await this.prisma.watchHistory.findUnique({
      where: {
        userId_videoId: {
          userId,
          videoId,
        },
      },
    });

    return {
      progress: watchHistory?.progress ?? 0,
    };
  }

  async saveProgress(userId: string, videoId: string, progress: number) {
    if (progress < 0 || progress > 86400) {
      throw new BadRequestException('Invalid progress value');
    }

    const watchHistory = await this.prisma.watchHistory.upsert({
      where: {
        userId_videoId: {
          userId,
          videoId,
        },
      },
      update: {
        progress,
      },
      create: {
        userId,
        videoId,
        progress,
      },
    });

    return {
      progress: watchHistory.progress,
    };
  }

  async getAllVideos() {
    const videos = await this.prisma.video.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const videoData = videos.map((video) => ({
      id: video.id,
      title: video.title,
      thumbnailUrl: video.thumbnailUrl,
      status: video.status,
      duration: video.duration,
    }));

    return videoData;
  }

  async getFeaturedVideo() {
    const video = await this.prisma.video.findFirst({
      where: { status: 'READY' },
      orderBy: { createdAt: 'desc' },
    });

    if (!video) {
      return null;
    }

    return {
      id: video.id,
      title: video.title,
      description: video.description,
      duration: video.duration,
      streamUrl: video.streamUrl,
    };
  }
}

import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller.js';
import { VideosService } from './videos.service.js';
import { PrismaService } from '../prisma.service.js';
import { StreamController } from './stream.controller.js';
import { AuthService } from '../auth/auth.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersService } from '../users/users.service.js';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { StorageFactory } from '../storage/storage-factory.js';
import { ThumbnailController } from './thumbnail.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [VideosController, StreamController, ThumbnailController],
  providers: [VideosService,PrismaService,AuthService,UsersService,JwtAuthGuard,StorageFactory]
})
export class VideosModule {}

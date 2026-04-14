import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { PrismaService } from './prisma.service.js'
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { VideosModule } from './videos/videos.module.js';
@Module({
  imports: [AuthModule, UsersModule, VideosModule],
  controllers: [AppController],
  providers: [AppService, PrismaService, JwtAuthGuard],
})
export class AppModule {}

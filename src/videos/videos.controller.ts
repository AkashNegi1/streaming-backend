import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Req,
  Param,
  Get,
  Body,
  Patch,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { VideosService } from './videos.service.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from '../auth/auth.service.js';
@Controller('videos')
export class VideosController {
  constructor(
    private videoService: VideosService,
    private authService: AuthService,
  ) {}
  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('video'))
  async uploadVideo(@UploadedFile() file: Express.Multer.File, @Req() req) {
    const userId = req.user.userId;
    return this.videoService.uploadVideo(file, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/play')
  async getPlayUrl(@Param('id') videoId: string, @Req() req) {
    const token = await this.authService.getSignedToken(
      videoId,
      req.user.userId,
    );
    
    return {
      streamUrl: `/stream/${videoId}/master.m3u8?token=${token}`,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/progress')
  async getProgress(@Param('id') videoId: string, @Req() req) {
    const userId = req.user.userId;
    return this.videoService.getProgress(userId, videoId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/progress')
  async saveProgress(
    @Param('id') videoId: string,
    @Body() body: { progress: number },
    @Req() req,
  ) {
    const userId = req.user.userId;
    return this.videoService.saveProgress(userId, videoId, body.progress);
  }

  @Get()
  async getAllVideos() {
    return this.videoService.getAllVideos();
  }

  @Get('featured')
  async getFeaturedVideo() {
    return this.videoService.getFeaturedVideo();
  }

  
}

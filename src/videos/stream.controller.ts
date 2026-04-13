import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { StorageFactory } from '../storage/storage-factory.js';
import { HTTP_STATUS, VIDEO } from '../constants.js';

@Controller('stream')
export class StreamController {
  private storage;
  constructor(
    private storageFactory: StorageFactory,
    private authService: AuthService,
  ) {
    this.storage = this.storageFactory.createStorageService();
  }

  @Get(':videoId/*filePath')
  async stream(
    @Param('videoId') videoId: string,
    @Param('filePath') filePath: string,
    @Query('token') token: string,
    @Req() req,
    @Res() res,
  ) {
    if (!token) throw new UnauthorizedException();
    
    let payload;
    try {
      payload = await this.authService.validate(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid orExpired Token');
    }

    if (payload.videoId !== videoId) {
      throw new ForbiddenException();
    }
    const cleanPath = Array.isArray(filePath) ? filePath.join('/') : filePath;


    const objectName = 'streams/'+`${videoId}/${cleanPath}`;


    try {
      if (cleanPath.endsWith('.m3u8')) {
        const stream = await this.storage.getObject('netflix-videos', objectName);

        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }

        let content = Buffer.concat(chunks).toString('utf-8');

        content = content.replace(/(.*\.ts)/g, `$1?token=${token}`);
        content = content.replace(/(.*\.m3u8)/g, `$1?token=${token}`);

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        return res.send(content);
      }

      const stat = await this.storage.getObjectStat('netflix-videos', objectName);
      const fileSize = stat.size;
      const range = req.headers.range;

      const contentType = this.getContentType(cleanPath);

      if (!range) {
        const stream = await this.storage.getObject('netflix-videos', objectName);

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', fileSize);
        res.setHeader('Accept-Ranges', 'bytes');

        return stream.pipe(res);
      }

      //parse range(handling range request)
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      const chunkSize = end - start + 1;

      const stream = await this.storage.getObject(
        'netflix-videos',
        objectName,
        start,
        chunkSize,
      );

      res.status(HTTP_STATUS.PARTIAL_CONTENT);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', chunkSize);
      res.setHeader('Content-Type', contentType);

      stream.pipe(res);
    } catch {
      res.status(HTTP_STATUS.NOT_FOUND).send('File Not Found');
    }
  }

  private getContentType(file: string) {
    if (file.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';

    if (file.endsWith('.ts')) return 'video/mp2t';

    return 'application/octet-stream';
  }
}

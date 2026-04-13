import { Injectable } from '@nestjs/common';
import { MinioService } from './minio.service.js';
import { R2Service } from './r2.service.js';

@Injectable()
export class StorageFactory {
  createStorageService(): MinioService | R2Service {
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      return new R2Service();
    }

    return new MinioService();
  }
}
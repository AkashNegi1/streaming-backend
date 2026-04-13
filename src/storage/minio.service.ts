import { Injectable } from '@nestjs/common';
import * as Minio from 'minio';
import fs from 'fs';
@Injectable()
export class MinioService {
  private client: Minio.Client;
  constructor() {
    this.client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT!,
      port: Number(process.env.MINIO_PORT) || 9000,
      useSSL: false,
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
    });
  }

  async uploadFile(bucket: string, filename: string, file: Buffer | string) {
    let stream;

    if (typeof file === 'string') {
      // file path
      stream = fs.createReadStream(file);
    } else {
      // multer buffer
      stream = file;
    }
    await this.client.putObject(bucket, filename, stream);
    return `${bucket}/${filename}`;
  }

  async downloadFile(bucket: string, objectName: string, filePath: string) {

    return await this.client.fGetObject(bucket, objectName, filePath);
  }

  async getObject(bucket: string, objectName: string,offset?: number,length?: number) {
      if(offset !== undefined || length !== undefined)  return this.client.getPartialObject(bucket, objectName, offset!, length);
      return this.client.getObject(bucket, objectName);
}
 


  async getObjectStat(bucket: string, objectName: string){
    return this.client.statObject(bucket,objectName);
  }
}

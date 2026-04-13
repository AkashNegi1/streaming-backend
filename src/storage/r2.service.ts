import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import * as fs from 'fs';

@Injectable()
export class R2Service {
  private client: S3Client;
  private bucket: string;

  constructor() {    
    this.client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY!,
        secretAccessKey: process.env.R2_SECRET_KEY!,
      },
    });
    this.bucket = process.env.R2_BUCKET || 'netflix-videos';
  }

  async uploadFile(bucket: string, filename: string, file: Buffer | string): Promise<string> {
    let body: Buffer | Readable;

    if (typeof file === 'string') {
      body = fs.createReadStream(file);
    } else {
      body = file;
    }

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: filename,
      Body: body,
    });

    await this.client.send(command);
    return `${bucket}/${filename}`;
  }

  async downloadFile(bucket: string, objectName: string, filePath: string): Promise<void> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: objectName,
    });

    const response = await this.client.send(command);
    const stream = response.Body as Readable;
    const writeStream = fs.createWriteStream(filePath);

    return new Promise((resolve, reject) => {
      stream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  }

  async getObject(bucket: string, objectName: string, offset?: number, length?: number): Promise<Readable> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: objectName,
      ...(offset !== undefined && length !== undefined && {
        Range: `bytes=${offset}-${offset + length - 1}`,
      }),
    });

    const response = await this.client.send(command);
    return response.Body as Readable;
  }

  async getObjectStat(bucket: string, objectName: string): Promise<{ size: number }> {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: objectName,
    });

    const response = await this.client.send(command);
    return {
      size: response.ContentLength || 0,
    };
  }
}
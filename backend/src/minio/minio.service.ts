import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client;
  private bucket: string;

  constructor(private configService: ConfigService) {
    this.client = new Minio.Client({
      endPoint: this.configService.get('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.configService.get('MINIO_PORT', '9000')),
      useSSL: this.configService.get('MINIO_USE_SSL') === 'true',
      accessKey: this.configService.get('MINIO_ROOT_USER', 'minioadmin'),
      secretKey: this.configService.get('MINIO_ROOT_PASSWORD', 'minioadmin_secret'),
    });
    this.bucket = this.configService.get('MINIO_BUCKET', 'proctolearn-evidence');
  }

  async onModuleInit() {
    await this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket, 'us-east-1');
        this.logger.log(`MinIO: Bucket "${this.bucket}" created`);
      } else {
        this.logger.log(`MinIO: Bucket "${this.bucket}" already exists`);
      }
    } catch (err) {
      this.logger.error('MinIO bucket init error', err);
    }
  }

  async uploadBase64(base64: string, objectName: string, contentType: string): Promise<string> {
    const buffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    await this.client.putObject(this.bucket, objectName, buffer, buffer.length, {
      'Content-Type': contentType,
    });
    return this.getUrl(objectName);
  }

  async uploadBuffer(buffer: Buffer, objectName: string, contentType: string): Promise<string> {
    await this.client.putObject(this.bucket, objectName, buffer, buffer.length, {
      'Content-Type': contentType,
    });
    return this.getUrl(objectName);
  }

  getUrl(objectName: string): string {
    const endpoint = this.configService.get('MINIO_ENDPOINT', 'localhost');
    const port = this.configService.get('MINIO_PORT', '9000');
    const ssl = this.configService.get('MINIO_USE_SSL') === 'true';
    const proto = ssl ? 'https' : 'http';
    return `${proto}://${endpoint}:${port}/${this.bucket}/${objectName}`;
  }

  async getPresignedUrl(objectName: string, expiry = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucket, objectName, expiry);
  }
}

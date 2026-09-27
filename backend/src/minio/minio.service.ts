import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { Readable } from 'stream';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client;
  private publicClient: Minio.Client;
  private bucket: string;

  constructor(private configService: ConfigService) {
    this.client = new Minio.Client({
      endPoint: this.configService.get('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.configService.get('MINIO_PORT', '9000')),
      useSSL: this.configService.get('MINIO_USE_SSL') === 'true',
      accessKey: this.configService.getOrThrow('MINIO_ROOT_USER'),
      secretKey: this.configService.getOrThrow('MINIO_ROOT_PASSWORD'),
      region: this.configService.get('MINIO_REGION', 'us-east-1'),
    });
    this.bucket = this.configService.get('MINIO_BUCKET', 'proctolearn-evidence');
    const publicUrl = this.configService.get<string>('MINIO_PUBLIC_URL');
    this.publicClient = this.client;
    if (publicUrl) {
      const url = new URL(publicUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('MINIO_PUBLIC_URL must be an HTTP(S) origin without a path or credentials');
      }
      this.publicClient = new Minio.Client({
        endPoint: url.hostname,
        port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
        useSSL: url.protocol === 'https:',
        accessKey: this.configService.getOrThrow('MINIO_ROOT_USER'),
        secretKey: this.configService.getOrThrow('MINIO_ROOT_PASSWORD'),
        region: this.configService.get('MINIO_REGION', 'us-east-1'),
      });
    } else if (this.configService.get('NODE_ENV') === 'production') {
      throw new Error('MINIO_PUBLIC_URL is required in production for browser playback');
    }
  }

  async onModuleInit() {
    await this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket, this.configService.get('MINIO_REGION', 'us-east-1'));
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

  async uploadFile(filePath: string, objectName: string, contentType: string): Promise<void> {
    await this.client.fPutObject(this.bucket, objectName, filePath, {
      'Content-Type': contentType,
    });
  }

  async removeObject(objectName: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectName);
  }

  async getObject(objectName: string): Promise<Readable> {
    return this.client.getObject(this.bucket, objectName);
  }

  async listObjects(prefix: string, limit = 200, startAfter = ''): Promise<{ name: string; lastModified: Date; size: number }[]> {
    const stream = this.client.listObjectsV2(this.bucket, prefix, true, startAfter);
    const objects: { name: string; lastModified: Date; size: number }[] = [];
    try {
      for await (const object of stream) {
        if (object.name) objects.push({ name: object.name, lastModified: object.lastModified, size: object.size });
        if (objects.length >= limit) break;
      }
    } finally {
      stream.destroy();
    }
    return objects;
  }

  getUrl(objectName: string): string {
    const endpoint = this.configService.get('MINIO_ENDPOINT', 'localhost');
    const port = this.configService.get('MINIO_PORT', '9000');
    const ssl = this.configService.get('MINIO_USE_SSL') === 'true';
    const proto = ssl ? 'https' : 'http';
    return `${proto}://${endpoint}:${port}/${this.bucket}/${objectName}`;
  }

  async getPresignedUrl(objectName: string, expiry = 3600): Promise<string> {
    return this.publicClient.presignedGetObject(this.bucket, objectName, expiry);
  }
}

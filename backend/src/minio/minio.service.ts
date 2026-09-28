import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, BucketLocationConstraint } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';

/** S3-compatible adapter; the public service name remains stable for existing callers. */
@Injectable()
export class MinioService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MinioService.name);
  private readonly client: S3Client;
  private readonly publicClient: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly endpoint: string;

  constructor(private configService: ConfigService) {
    const credentials = {
      accessKeyId: this.configService.getOrThrow<string>('MINIO_ROOT_USER'),
      secretAccessKey: this.configService.getOrThrow<string>('MINIO_ROOT_PASSWORD'),
    };
    this.region = this.configService.get('MINIO_REGION', 'us-east-1');
    const host = this.configService.get('MINIO_ENDPOINT', 'localhost');
    const port = Number(this.configService.get('MINIO_PORT', '9000'));
    if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])$/i.test(host)) {
      throw new Error('MINIO_ENDPOINT and MINIO_PORT must specify a storage host and port');
    }
    this.endpoint = `${this.configService.get('MINIO_USE_SSL') === 'true' ? 'https' : 'http'}://${host}:${port}`;
    this.bucket = this.configService.get('MINIO_BUCKET', 'proctolearn-evidence');
    const options = {
      region: this.region, credentials, forcePathStyle: true,
      // Callers implement idempotent retries; streaming request bodies cannot be rewound by the SDK.
      maxAttempts: 1,
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
      requestHandler: { connectionTimeout: 2_000, socketTimeout: 120_000 },
    };
    this.client = new S3Client({ ...options, endpoint: this.endpoint });
    const publicUrl = this.configService.get<string>('MINIO_PUBLIC_URL');
    if (publicUrl) {
      const url = new URL(publicUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('MINIO_PUBLIC_URL must be an HTTP(S) origin without a path or credentials');
      }
      this.publicClient = new S3Client({ ...options, endpoint: url.origin });
    } else if (this.configService.get('NODE_ENV') === 'production') {
      throw new Error('MINIO_PUBLIC_URL is required in production for browser playback');
    } else this.publicClient = this.client;
  }

  private async bounded<T>(timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error('Invalid storage request timeout');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref();
    try { return await operation(controller.signal); }
    finally { clearTimeout(timer); }
  }

  async storageProbe(timeoutMs = 2_000): Promise<void> {
    await this.bounded(timeoutMs, (abortSignal) => this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), { abortSignal }));
  }

  async onModuleInit() {
    try {
      try { await this.storageProbe(2_000); }
      catch (error: any) {
        if (error?.$metadata?.httpStatusCode !== 404) throw error;
        await this.bounded(2_000, (abortSignal) => this.client.send(new CreateBucketCommand({
          Bucket: this.bucket,
          ...(this.region !== 'us-east-1' ? { CreateBucketConfiguration: { LocationConstraint: this.region as BucketLocationConstraint } } : {}),
        }), { abortSignal }));
      }
    } catch {
      // Liveness remains available; readiness reports the dependency failure and recovery.
      this.logger.warn('Object storage initialization failed; readiness remains unavailable until storage recovers');
    }
  }

  onModuleDestroy() {
    this.client.destroy();
    if (this.publicClient !== this.client) this.publicClient.destroy();
  }

  async uploadBase64(base64: string, objectName: string, contentType: string): Promise<string> {
    const buffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    await this.bounded(120_000, (abortSignal) => this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: objectName, Body: buffer, ContentLength: buffer.length, ContentType: contentType }), { abortSignal }));
    return this.getUrl(objectName);
  }

  async uploadFile(filePath: string, objectName: string, contentType: string): Promise<void> {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('Recording upload requires a regular file');
    const stream = createReadStream(filePath);
    try {
      await this.bounded(120_000, (abortSignal) => this.client.send(new PutObjectCommand({
        Bucket: this.bucket, Key: objectName, Body: stream, ContentLength: info.size, ContentType: contentType,
      }), { abortSignal }));
    } finally { stream.destroy(); }
  }

  async removeObject(objectName: string): Promise<void> {
    await this.bounded(30_000, (abortSignal) => this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectName }), { abortSignal }));
  }

  async getObject(objectName: string, timeoutMs = 120_000): Promise<Readable> {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error('Invalid storage request timeout');
    const response = await this.bounded(Math.min(30_000, timeoutMs), (abortSignal) => this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectName }), { abortSignal }));
    if (!(response.Body instanceof Readable)) throw new Error('Object storage returned an unsupported body');
    // SDK send() resolves at response headers. Keep a separate real deadline until body consumption
    // ends; otherwise a peer can send headers and leave an assembly worker waiting indefinitely.
    const body = response.Body;
    const timer = setTimeout(() => body.destroy(Object.assign(new Error('Object storage body timeout'), { name: 'TimeoutError' })), timeoutMs);
    timer.unref();
    const clear = () => clearTimeout(timer);
    body.once('end', clear);
    body.once('close', clear);
    body.once('error', clear);
    return body;
  }

  async listObjects(prefix: string, limit = 200, startAfter = ''): Promise<{ name: string; lastModified: Date; size: number }[]> {
    const maxKeys = Math.min(1000, Math.max(1, Math.floor(limit)));
    const response = await this.bounded(30_000, (abortSignal) => this.client.send(new ListObjectsV2Command({
      Bucket: this.bucket, Prefix: prefix, MaxKeys: maxKeys, ...(startAfter ? { StartAfter: startAfter } : {}),
    }), { abortSignal }));
    return (response.Contents ?? []).filter((object) => object.Key && object.LastModified).map((object) => ({
      name: object.Key!, lastModified: object.LastModified!, size: object.Size ?? 0,
    }));
  }

  getUrl(objectName: string): string {
    return `${this.endpoint}/${encodeURIComponent(this.bucket)}/${objectName.split('/').map(encodeURIComponent).join('/')}`;
  }

  async getPresignedUrl(objectName: string, expiry = 3600): Promise<string> {
    if (!Number.isInteger(expiry) || expiry < 1 || expiry > 604800) throw new Error('Invalid signed URL lifetime');
    return getSignedUrl(this.publicClient, new GetObjectCommand({ Bucket: this.bucket, Key: objectName }), { expiresIn: expiry });
  }
}

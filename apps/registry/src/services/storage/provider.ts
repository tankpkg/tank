import { createHmac } from 'node:crypto';
import * as fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env } from '~/consts/env';
import { supabaseAdmin } from '~/services/supabase';

export interface SignedUrlResult {
  signedUrl: string;
}

export type SignedUrlTarget = 'internal' | 'public';

export interface StorageProvider {
  createSignedUploadUrl(path: string, expiresInSeconds?: number): Promise<SignedUrlResult>;
  createSignedUrl(path: string, expiresInSeconds?: number, target?: SignedUrlTarget): Promise<SignedUrlResult>;
  putObject?(path: string, body: Uint8Array, contentType?: string): Promise<void>;
  listObjects?(bucket: string, prefix: string, limit: number): Promise<unknown>;
}

class SupabaseStorageProvider implements StorageProvider {
  private readonly bucket: string;

  constructor(bucket: string) {
    this.bucket = bucket;
  }

  async createSignedUploadUrl(path: string): Promise<SignedUrlResult> {
    const { data, error } = await supabaseAdmin.storage.from(this.bucket).createSignedUploadUrl(path);

    if (error || !data?.signedUrl) {
      throw new Error(`Failed to create Supabase signed upload URL: ${error?.message ?? 'Unknown error'}`);
    }

    return { signedUrl: data.signedUrl };
  }

  async createSignedUrl(path: string, expiresInSeconds = 3600): Promise<SignedUrlResult> {
    const { data, error } = await supabaseAdmin.storage.from(this.bucket).createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new Error(`Failed to create Supabase signed download URL: ${error?.message ?? 'Unknown error'}`);
    }

    return { signedUrl: data.signedUrl };
  }
}

class S3StorageProvider implements StorageProvider {
  private readonly bucket: string;
  private readonly internalClient: S3Client;
  private readonly publicClient: S3Client;
  private bucketReady: Promise<void> | null = null;

  constructor(bucket: string) {
    const region = env.S3_REGION;
    const internalEndpoint = env.S3_ENDPOINT;
    const publicEndpoint = env.S3_PUBLIC_ENDPOINT || internalEndpoint;
    const accessKeyId = env.S3_ACCESS_KEY;
    const secretAccessKey = env.S3_SECRET_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('Missing S3_ACCESS_KEY or S3_SECRET_KEY environment variable');
    }

    this.bucket = bucket;
    this.internalClient = this.createClient(region, internalEndpoint, accessKeyId, secretAccessKey);
    this.publicClient = this.createClient(region, publicEndpoint, accessKeyId, secretAccessKey);
  }

  private createClient(region: string, endpoint: string, accessKeyId: string, secretAccessKey: string): S3Client {
    return new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: !!endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    });
  }

  private async ensureBucketExists(): Promise<void> {
    if (!this.bucketReady) {
      this.bucketReady = this.ensureBucketExistsOnce();
    }
    await this.bucketReady;
  }

  private async ensureBucketExistsOnce(): Promise<void> {
    try {
      await this.internalClient.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (error) {
      const statusCode = this.getStatusCode(error);
      const errorName = this.getErrorName(error);

      if (statusCode !== 404 && errorName !== 'NotFound' && errorName !== 'NoSuchBucket') {
        throw error;
      }
    }

    try {
      await this.internalClient.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      const errorName = this.getErrorName(error);
      if (errorName !== 'BucketAlreadyOwnedByYou' && errorName !== 'BucketAlreadyExists') {
        throw error;
      }
    }
  }

  private getErrorName(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null) return undefined;
    return 'name' in error && typeof error.name === 'string' ? error.name : undefined;
  }

  private getStatusCode(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null || !('$metadata' in error)) return undefined;
    const metadata = error.$metadata;
    if (typeof metadata !== 'object' || metadata === null || !('httpStatusCode' in metadata)) return undefined;
    return typeof metadata.httpStatusCode === 'number' ? metadata.httpStatusCode : undefined;
  }

  async createSignedUploadUrl(path: string, expiresInSeconds = 3600): Promise<SignedUrlResult> {
    await this.ensureBucketExists();

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: path,
      ContentType: 'application/octet-stream'
    });

    const signedUrl = await getSignedUrl(this.publicClient, command, {
      expiresIn: expiresInSeconds
    });

    return { signedUrl };
  }

  async createSignedUrl(
    path: string,
    expiresInSeconds = 3600,
    target: SignedUrlTarget = 'public'
  ): Promise<SignedUrlResult> {
    await this.ensureBucketExists();

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: path
    });

    const signedUrl = await getSignedUrl(target === 'internal' ? this.internalClient : this.publicClient, command, {
      expiresIn: expiresInSeconds
    });

    return { signedUrl };
  }

  async putObject(path: string, body: Uint8Array, contentType = 'application/octet-stream'): Promise<void> {
    await this.ensureBucketExists();

    await this.internalClient.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: path,
        Body: body,
        ContentType: contentType
      })
    );
  }

  async listObjects(bucket: string, prefix: string, limit: number): Promise<unknown> {
    await this.ensureBucketExists();

    return this.internalClient.send(
      new ListObjectsV2Command({
        Bucket: bucket || this.bucket,
        Prefix: prefix,
        MaxKeys: limit
      })
    );
  }
}

class FilesystemStorageProvider implements StorageProvider {
  private readonly baseDir: string;
  private readonly publicUrl: string;

  constructor(baseDir: string, publicUrl: string) {
    this.baseDir = baseDir;
    this.publicUrl = publicUrl.replace(/\/$/, '');
  }

  private resolvePath(path: string): string {
    const resolved = resolve(join(this.baseDir, path));
    if (!resolved.startsWith(resolve(this.baseDir))) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  private generateToken(path: string, expiresAt: number): string {
    const secret = process.env.BETTER_AUTH_SECRET || 'tank-fs-secret';
    return createHmac('sha256', secret).update(`${path}:${expiresAt}`).digest('hex');
  }

  async createSignedUploadUrl(path: string, expiresInSeconds = 3600): Promise<SignedUrlResult> {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const token = this.generateToken(path, expiresAt);
    return {
      signedUrl: `${this.publicUrl}/api/storage/upload?path=${encodeURIComponent(path)}&expires=${expiresAt}&token=${token}`
    };
  }

  async createSignedUrl(path: string, expiresInSeconds = 3600): Promise<SignedUrlResult> {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const token = this.generateToken(path, expiresAt);
    return {
      signedUrl: `${this.publicUrl}/api/storage/download?path=${encodeURIComponent(path)}&expires=${expiresAt}&token=${token}`
    };
  }

  async putObject(path: string, body: Uint8Array): Promise<void> {
    const fullPath = this.resolvePath(path);
    fs.mkdirSync(dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, body);
  }

  async listObjects(_bucket: string, prefix: string, limit: number): Promise<unknown> {
    const dir = this.resolvePath(prefix || '');
    if (!fs.existsSync(dir)) return { Contents: [] };
    const files = fs
      .readdirSync(dir)
      .slice(0, limit)
      .map((name: string) => ({
        Key: join(prefix || '', name),
        Size: fs.statSync(join(dir, name)).size
      }));
    return { Contents: files };
  }

  verifyToken(path: string, expires: string, token: string): boolean {
    const expiresAt = Number.parseInt(expires, 10);
    if (isNaN(expiresAt) || Date.now() / 1000 > expiresAt) return false;
    return this.generateToken(path, expiresAt) === token;
  }

  getFilePath(path: string): string {
    return this.resolvePath(path);
  }
}

let providerInstance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (providerInstance) return providerInstance;

  const backend = env.STORAGE_BACKEND;
  const bucket = env.STORAGE_BUCKET || env.S3_BUCKET;

  if (backend === 'filesystem') {
    const baseDir = env.STORAGE_FS_PATH || '/app/data/packages';
    const publicUrl = env.BETTER_AUTH_URL || env.APP_URL || 'http://localhost:3000';
    providerInstance = new FilesystemStorageProvider(baseDir, publicUrl);
    return providerInstance;
  }

  if (backend === 's3') {
    providerInstance = new S3StorageProvider(bucket);
    return providerInstance;
  }

  providerInstance = new SupabaseStorageProvider(bucket);
  return providerInstance;
}

export function getFilesystemProvider(): FilesystemStorageProvider | null {
  const provider = getStorageProvider();
  return provider instanceof FilesystemStorageProvider ? provider : null;
}

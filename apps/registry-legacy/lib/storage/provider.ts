import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { supabaseAdmin } from '@/lib/supabase';

export interface SignedUrlResult {
  signedUrl: string;
}

export interface StorageProvider {
  createSignedUploadUrl(path: string, expiresInSeconds?: number): Promise<SignedUrlResult>;
  createSignedUrl(path: string, expiresInSeconds?: number): Promise<SignedUrlResult>;
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
  private readonly client: S3Client;

  constructor(bucket: string) {
    const region = (process.env.S3_REGION || 'us-east-1').trim();
    const endpoint = (process.env.S3_ENDPOINT || '').trim();
    const accessKeyId = (process.env.S3_ACCESS_KEY || '').trim();
    const secretAccessKey = (process.env.S3_SECRET_KEY || '').trim();

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('Missing S3_ACCESS_KEY or S3_SECRET_KEY environment variable');
    }

    this.bucket = bucket;
    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: !!endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    });
  }

  async createSignedUploadUrl(path: string, expiresInSeconds = 3600): Promise<SignedUrlResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: path,
      ContentType: 'application/octet-stream'
    });

    const signedUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds
    });

    return { signedUrl };
  }

  async createSignedUrl(path: string, expiresInSeconds = 3600): Promise<SignedUrlResult> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: path
    });

    const signedUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds
    });

    return { signedUrl };
  }
}

let providerInstance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (providerInstance) return providerInstance;

  const backend = (process.env.STORAGE_BACKEND || 'supabase').trim().toLowerCase();
  const bucket = (process.env.STORAGE_BUCKET || process.env.S3_BUCKET || 'packages').trim();

  if (backend === 's3') {
    providerInstance = new S3StorageProvider(bucket);
    return providerInstance;
  }

  providerInstance = new SupabaseStorageProvider(bucket);
  return providerInstance;
}

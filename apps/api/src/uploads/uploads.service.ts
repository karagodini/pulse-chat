import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
]);

const MAX_BYTES = 10 * 1024 * 1024;

@Injectable()
export class UploadsService {
  private readonly bucket: string;
  private readonly client: S3Client | null;
  private readonly signer: S3Client | null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.bucket = config.get<string>('S3_BUCKET') || 'pulse';
    const accessKeyId = config.get<string>('S3_ACCESS_KEY') ?? '';
    const secretAccessKey = config.get<string>('S3_SECRET_KEY') ?? '';
    const region = config.get<string>('S3_REGION') || 'us-east-1';
    const endpoint = config.get<string>('S3_ENDPOINT');
    const publicEndpoint = config.get<string>('S3_PUBLIC_ENDPOINT') || endpoint;
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      this.client = null;
      this.signer = null;
      return;
    }
    const credentials = { accessKeyId, secretAccessKey };
    this.client = new S3Client({ region, endpoint, forcePathStyle: true, credentials });
    this.signer = new S3Client({
      region,
      endpoint: publicEndpoint,
      forcePathStyle: true,
      credentials,
    });
  }

  async upload(userId: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Choose a file to upload');
    if (!ALLOWED.has(file.mimetype))
      throw new BadRequestException('That file type is not supported');
    if (file.size > MAX_BYTES) throw new BadRequestException('Files need to be 10 MB or smaller');
    if (!this.client) throw new ServiceUnavailableException('File storage is not configured');

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'file';
    const key = `${userId}/${Date.now()}-${randomBytes(4).toString('hex')}-${safeName}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    const attachment = await this.prisma.attachment.create({
      data: {
        uploadedBy: userId,
        fileName: file.originalname.slice(0, 180),
        mimeType: file.mimetype,
        size: file.size,
        storageKey: key,
      },
    });
    return {
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: await this.presign(key),
    };
  }

  async presign(key: string): Promise<string | null> {
    if (!this.signer) return null;
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: 60 * 60,
    });
  }
}

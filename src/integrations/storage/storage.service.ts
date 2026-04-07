import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly logger = new Logger(StorageService.name);

  constructor(private config: ConfigService) {
    const endpoint = this.config.get<string>('aws.endpoint');
    this.bucket = this.config.get<string>('aws.bucket') || 'perc-suppliers-facturas';

    this.s3 = new S3Client({
      region: this.config.get<string>('aws.region') || 'us-east-1',
      credentials: {
        accessKeyId: this.config.get<string>('aws.accessKeyId') || 'test',
        secretAccessKey: this.config.get<string>('aws.secretAccessKey') || 'test',
      },
      ...(endpoint && { endpoint, forcePathStyle: true }),
    });
  }

  private sanitizeFilename(name: string): string {
    const basename = name.replace(/^.*[\\/]/, '').replace(/\.\./g, '');
    return basename.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  async upload(file: Express.Multer.File): Promise<{ url: string; key: string }> {
    const safeName = this.sanitizeFilename(file.originalname);
    const key = `facturas/${Date.now()}-${safeName}`;
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));

    const endpoint = this.config.get<string>('aws.endpoint');
    const url = endpoint
      ? `${endpoint}/${this.bucket}/${key}`
      : `https://${this.bucket}.s3.amazonaws.com/${key}`;

    this.logger.log(`Archivo subido: ${key}`);
    return { url, key };
  }

  async getSignedDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn: 3600 });
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    this.logger.log(`Archivo eliminado: ${key}`);
  }
}

import 'multer';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  v2 as cloudinary,
  UploadApiErrorResponse,
  UploadApiResponse,
} from 'cloudinary';
import { Readable } from 'stream';

export interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name:
        this.configService.get<string>('cloudinary.cloudName') ||
        this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key:
        this.configService.get<string>('cloudinary.apiKey') ||
        this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret:
        this.configService.get<string>('cloudinary.apiSecret') ||
        this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  /**
   * Securely upload image stream to Cloudinary folder
   */
  async uploadImage(
    file: Express.Multer.File,
    folderPath: string,
  ): Promise<CloudinaryUploadResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folderPath,
          resource_type: 'image',
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error) {
            this.logger.error(
              `Cloudinary image upload failed: ${error.message}`,
            );
            return reject(
              new InternalServerErrorException(
                'Failed to upload profile image to Cloudinary.',
              ),
            );
          }
          if (!result) {
            return reject(
              new InternalServerErrorException(
                'Cloudinary upload returned empty response.',
              ),
            );
          }
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
          });
        },
      );

      const stream = Readable.from(file.buffer);
      stream.pipe(uploadStream);
    });
  }

  /**
   * Delete image from Cloudinary by public_id.
   * Logs failure safely without exposing credentials or crashing application.
   */
  async deleteImage(publicId: string): Promise<boolean> {
    if (!publicId) return false;
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      this.logger.log(
        `Cloudinary image deletion result for public_id=[${publicId}]: ${result.result}`,
      );
      return result.result === 'ok';
    } catch (error: any) {
      this.logger.error(
        `Failed to delete Cloudinary image public_id=[${publicId}]: ${error.message}`,
      );
      return false;
    }
  }
}

import { Injectable, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
    // ==================== UPLOAD FILE ====================
    async uploadFile(file: Express.Multer.File, folder: string): Promise<UploadApiResponse> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: folder,
                    resource_type: 'image',
                },
                (error, result) => {
                    if (error) return reject(new BadRequestException('Cloudinary infrastructure upload failed'));
                    resolve(result!);
                },
            );

            const stream = new Readable();
            stream.push(file.buffer);
            stream.push(null);
            stream.pipe(uploadStream);
        });
    }

    // ==================== DELETE FILE ====================
    async deleteFile(publicId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            cloudinary.uploader.destroy(publicId, (error, result) => {
                if (error) {
                    // Log locally but avoid breaking database consistency completely
                    console.error('Cloudinary asset removal failed:', error);
                    return reject(new BadRequestException('Cloudinary infrastructure deletion failed'));
                }
                resolve(result);
            });
        });
    }
}
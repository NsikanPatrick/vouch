import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileEntity } from './entities/file.entity';
import { CloudinaryService } from './cloudinary/cloudinary.service';

@Injectable()
export class FileUploadService {
    constructor(
        @InjectRepository(FileEntity)
        private fileRepository: Repository<FileEntity>,
        private cloudinaryService: CloudinaryService,
    ) { }

    async uploadSingleFile(file: Express.Multer.File, folder: string): Promise<FileEntity> {
        // 1. Upload straight to Cloudinary via stream
        const cloudinaryResult = await this.cloudinaryService.uploadFile(file, folder);

        // 2. Save file logs into your relational database
        const newFileLog = this.fileRepository.create({
            url: cloudinaryResult.secure_url,
            cloudinaryPublicId: cloudinaryResult.public_id,
            originalName: file.originalname,
            mimeType: file.mimetype,
            folder: folder,
        });

        return await this.fileRepository.save(newFileLog);
    }

    // ==================== DELETE SINGLE FILE BY URL ====================
    async deleteFileByUrl(url: string): Promise<void> {
        if (!url) return;

        // Find the file log matching the user's saved profile URL
        const fileLog = await this.fileRepository.findOne({ where: { url } });

        if (fileLog && fileLog.cloudinaryPublicId) {
            try {
                // 1. Evict asset from Cloudinary storage infrastructure
                await this.cloudinaryService.deleteFile(fileLog.cloudinaryPublicId);
            } catch (err) {
                // Log it so you don't hang execution if asset was already deleted manually on dashboard
                console.error(`Failed to clear asset from Cloudinary: ${fileLog.cloudinaryPublicId}`);
            }

            // 2. Remove log row from database
            await this.fileRepository.remove(fileLog);
        }
    }
}
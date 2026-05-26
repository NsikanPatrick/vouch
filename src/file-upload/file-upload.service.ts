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
}
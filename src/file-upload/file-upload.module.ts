import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileUploadService } from './file-upload.service';
import { FileUploadController } from './file-upload.controller';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { FileEntity } from './entities/file.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([FileEntity]),
        CloudinaryModule,
    ],
    controllers: [FileUploadController],
    providers: [FileUploadService],
    exports: [FileUploadService], // This allows AuthModule to inject the entire file upload service
})
export class FileUploadModule { }
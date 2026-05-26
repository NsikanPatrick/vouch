import { Module } from '@nestjs/common';
import { CloudinaryProvider } from './cloudinary.provider';
import { CloudinaryService } from './cloudinary.service';

@Module({
    providers: [CloudinaryProvider, CloudinaryService],
    exports: [CloudinaryService], // Exported so FileUploadService can use it
})
export class CloudinaryModule { }
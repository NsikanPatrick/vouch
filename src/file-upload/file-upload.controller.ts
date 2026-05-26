import { Controller, Post, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileUploadService } from './file-upload.service';

@Controller('uploads')
export class FileUploadController {
    constructor(private fileUploadService: FileUploadService) { }

    @Post('single')
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(@UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('No file provided');
        return this.fileUploadService.uploadSingleFile(file, 'general_uploads');
    }
}
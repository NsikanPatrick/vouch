import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export const CLOUDINARY_PROVIDER_TOKEN = 'CLOUDINARY_PROVIDER';

export const CloudinaryProvider: Provider = {
    provide: CLOUDINARY_PROVIDER_TOKEN,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) => {
        return cloudinary.config({
            cloud_name: configService.get<string>('appConfig.cloudinary.cloudName') || process.env.CLOUDINARY_CLOUD_NAME,
            api_key: configService.get<string>('appConfig.cloudinary.apiKey') || process.env.CLOUDINARY_API_KEY,
            api_secret: configService.get<string>('appConfig.cloudinary.apiSecret') || process.env.CLOUDINARY_API_SECRET,
        });
    },
};
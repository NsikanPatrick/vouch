import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Global pipes
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Strip properties not in DTO
    forbidNonWhitelisted: true, // Throw error on extra properties
    transform: true, // Transform payload to DTO instances
    transformOptions: {
      enableImplicitConversion: true,
    },
  }));

  // Security
  app.use(helmet());
  app.use(cookieParser());

  // Enable CORS
  app.enableCors({
    origin: configService.get('FRONTEND_URL', 'http://localhost:1000'),
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  const port = configService.get('PORT', 1000);
  await app.listen(port);

  console.log(`🚀 VOUCH is running on: http://localhost:${port}/api/v1`);
  console.log(`📧 Email verification: ${configService.get('FRONTEND_URL')}/api/v1/verify-email`);
  console.log(`🔐 Reset password: ${configService.get('FRONTEND_URL')}/api/v1/reset-password`);
}
bootstrap();

// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);
//   await app.listen(process.env.PORT ?? 1000);
// }
// bootstrap();

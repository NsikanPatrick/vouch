import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import express from 'express';

// Cache the server instance across execution cycles in serverless deployment
let cachedServer: express.Express;

async function bootstrapServer(): Promise<express.Express> {
  if (!cachedServer) {
    const expressApp = express();

    // Retain rawBody securely for cryptographic webhook parsing
    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
      { rawBody: true }
    );

    const configService = app.get(ConfigService);

    // Global Validation Pipes
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      })
    );

    // Middleware Security Suite
    app.use(helmet());
    app.use(cookieParser());

    // Configured Cross-Origin Resource Sharing
    app.enableCors({
      origin: configService.get<string>('appConfig.frontendUrl') || configService.get('FRONTEND_URL', 'http://localhost:1000'),
      credentials: true,
    });

    // Unified API Base Routing Matrix
    app.setGlobalPrefix('api/v1');

    await app.init();
    cachedServer = expressApp;
  }
  return cachedServer;
}

// 🌐 1. Vercel Serverless Function Handler Entry Point
export const handler = async (req: any, res: any) => {
  const server = await bootstrapServer();
  return server(req, res);
};

// 🖥️ 2. Traditional Server/Local Development Fallback Engine
if (process.env.NODE_ENV !== 'production') {
  async function devBootstrap() {
    // Standard long-running boot process for local VSCode work or VPS deployments
    const app = await NestFactory.create(AppModule, { rawBody: true });
    const configService = app.get(ConfigService);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      })
    );

    app.use(helmet());
    app.use(cookieParser());

    app.enableCors({
      origin: configService.get<string>('appConfig.frontendUrl') || configService.get('FRONTEND_URL', 'http://localhost:1000'),
      credentials: true,
    });

    app.setGlobalPrefix('api/v1');

    const port = configService.get('PORT', 1000);
    await app.listen(port);

    console.log(`🚀 VOUCH Engine executing locally at: http://localhost:${port}/api/v1`);
    console.log(`📧 Core Links Interface Base: ${configService.get('FRONTEND_URL') || 'http://localhost:1000'}/api/v1`);
  }

  devBootstrap();
}


// import { NestFactory } from '@nestjs/core';
// import { ValidationPipe } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { AppModule } from './app.module';
// import helmet from 'helmet';
// import cookieParser from 'cookie-parser';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule, {
//     rawBody: true,
//   });
//   const configService = app.get(ConfigService);

//   // Global pipes
//   app.useGlobalPipes(new ValidationPipe({
//     whitelist: true, // Strip properties not in DTO
//     forbidNonWhitelisted: true, // Throw error on extra properties
//     transform: true, // Transform payload to DTO instances
//     transformOptions: {
//       enableImplicitConversion: true,
//     },
//   }));

//   // Security
//   app.use(helmet());
//   app.use(cookieParser());

//   // Enable CORS
//   app.enableCors({
//     origin: configService.get('FRONTEND_URL', 'http://localhost:1000'),
//     credentials: true,
//   });

//   // Global prefix
//   app.setGlobalPrefix('api/v1');

//   const port = configService.get('PORT', 1000);
//   await app.listen(port);

//   console.log(`🚀 VOUCH is running on: http://localhost:${port}/api/v1`);
//   console.log(`📧 Email verification: ${configService.get('FRONTEND_URL')}/api/v1/verify-email`);
//   console.log(`🔐 Reset password: ${configService.get('FRONTEND_URL')}/api/v1/reset-password`);
// }
// bootstrap();



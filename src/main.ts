import { NestFactory } from '@nestjs/core';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import express from 'express';

// Cache the server instance across execution cycles in serverless deployment
let cachedServer: express.Express;

// 🧠 Shared Configuration Engine: Guarantees Local and Prod stay identical
function configureNestApp(app: INestApplication, configService: ConfigService) {
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
}

// 🌐 1. Vercel Serverless Production Bootloader
async function bootstrapServer(): Promise<express.Express> {
  if (!cachedServer) {
    const expressApp = express();
    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
      { rawBody: true }
    );

    const configService = app.get(ConfigService);
    configureNestApp(app, configService); // <-- Apply shared config

    await app.init();
    cachedServer = expressApp;
  }
  return cachedServer;
}

const handler = async (req: any, res: any) => {
  const server = await bootstrapServer();
  return server(req, res);
};

export default handler;

// 🖥️ 2. Traditional Local Development Engine
if (process.env.NODE_ENV !== 'production') {
  async function devBootstrap() {
    const app = await NestFactory.create(AppModule, { rawBody: true });
    const configService = app.get(ConfigService);

    configureNestApp(app, configService); // <-- Apply exact same shared config

    const port = configService.get('PORT', 1000);
    await app.listen(port);

    console.log(`🚀 VOUCH Engine executing locally at: http://localhost:${port}/api/v1`);
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



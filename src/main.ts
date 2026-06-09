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

// Shared Configuration Engine: Guarantees Local and Prod stay identical
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

  // Dynamic CORS configuration
  const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:3000');
  const allowedOrigins = corsOrigins.split(',');

  // Debug logging
  console.log('🚀 CORS Origins:', allowedOrigins);
  console.log('🚀 NODE_ENV:', process.env.NODE_ENV);
  console.log('🚀 FRONTEND_URL:', configService.get('FRONTEND_URL'));

  // Enable cors
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.log('❌ CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Authorization'],
  });

  app.setGlobalPrefix('api/v1');
}

// 🌐 1. Vercel Serverless Production Bootloader
async function bootstrapServer(): Promise<express.Express> {
  if (!cachedServer) {
    const expressApp = express();

    // Add a simple health check endpoint
    expressApp.get('/', (req, res) => {
      res.json({ status: 'ok', message: 'Vouch API is running', timestamp: new Date().toISOString() });
    });

    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
      { rawBody: true, cors: false } // Disable built-in cors, we'll use our own
    );

    const configService = app.get(ConfigService);
    configureNestApp(app, configService);

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
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  async function devBootstrap() {
    const app = await NestFactory.create(AppModule, { rawBody: true });
    const configService = app.get(ConfigService);

    configureNestApp(app, configService);

    const port = configService.get('PORT', 1000);
    await app.listen(port);

    console.log(`🚀 VOUCH Engine executing locally at: http://localhost:${port}/api/v1`);
  }

  devBootstrap();
}


// import { NestFactory } from '@nestjs/core';
// import { ValidationPipe, INestApplication } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { AppModule } from './app.module';
// import { ExpressAdapter } from '@nestjs/platform-express';
// import helmet from 'helmet';
// import cookieParser from 'cookie-parser';
// import express from 'express';

// // Cache the server instance across execution cycles in serverless deployment
// let cachedServer: express.Express;

// // Shared Configuration Engine: Guarantees Local and Prod stay identical
// function configureNestApp(app: INestApplication, configService: ConfigService) {
//   app.useGlobalPipes(
//     new ValidationPipe({
//       whitelist: true,
//       forbidNonWhitelisted: true,
//       transform: true,
//       transformOptions: {
//         enableImplicitConversion: true,
//       },
//     })
//   );

//   app.use(helmet());
//   app.use(cookieParser());

//   // Dynamic CORS configuration
//   const allowedOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:3000').split(',');

//   // Enable cors
//   app.enableCors({
//     // origin: configService.get<string>('appConfig.frontendUrl') || configService.get('FRONTEND_URL', 'http://localhost:1000'),
//     origin: allowedOrigins,
//     credentials: true,
//     methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
//     exposedHeaders: ['Authorization'],
//   });

//   app.setGlobalPrefix('api/v1');
// }

// // 🌐 1. Vercel Serverless Production Bootloader
// async function bootstrapServer(): Promise<express.Express> {
//   if (!cachedServer) {
//     const expressApp = express();
//     const app = await NestFactory.create(
//       AppModule,
//       new ExpressAdapter(expressApp),
//       { rawBody: true }
//     );

//     const configService = app.get(ConfigService);
//     configureNestApp(app, configService); // <-- Apply shared config

//     await app.init();
//     cachedServer = expressApp;
//   }
//   return cachedServer;
// }

// const handler = async (req: any, res: any) => {
//   const server = await bootstrapServer();
//   return server(req, res);
// };

// export default handler;

// // 🖥️ 2. Traditional Local Development Engine
// if (process.env.NODE_ENV !== 'production') {
//   async function devBootstrap() {
//     const app = await NestFactory.create(AppModule, { rawBody: true });
//     const configService = app.get(ConfigService);

//     configureNestApp(app, configService); // <-- Apply exact same shared config

//     const port = configService.get('PORT', 1000);
//     await app.listen(port);

//     console.log(`🚀 VOUCH Engine executing locally at: http://localhost:${port}/api/v1`);
//   }

//   devBootstrap();
// }



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



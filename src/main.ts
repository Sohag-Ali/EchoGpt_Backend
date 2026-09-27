import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 5000);
  const environment = configService.get<string>(
    'app.environment',
    'development',
  );
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api/v1');

  // Middleware for cookies
  app.use(cookieParser());

  // Global Prefix
  app.setGlobalPrefix(apiPrefix);

  // Enable CORS
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global Validation Pipe with Whitelisting & Custom Format
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        const formattedErrors = errors.map((err) => {
          const constraints = err.constraints
            ? Object.values(err.constraints)
            : ['Invalid value'];
          return {
            field: err.property,
            errors: constraints,
          };
        });
        return new BadRequestException({
          statusCode: 400,
          message: 'Validation failed',
          errors: formattedErrors,
        });
      },
    }),
  );

  // Swagger OpenAPI Setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('EchoGPT Backend API')
    .setDescription(
      'Production-ready REST API backend for EchoGPT supporting AI Chat, SSE Streaming, Web Search with Redis Caching, bKash Payments, API Usage Logging, and Admin Analytics.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT Authentication',
        description: 'Enter JWT access token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag(
      'Authentication',
      'User authentication, registration, login, OTP & token management',
    )
    .addTag('Users', 'User profile management and account operations')
    .addTag(
      'Subscriptions',
      'User subscription plans and request limit monitoring',
    )
    .addTag('Payments', 'bKash payment gateway integration and payment history')
    .addTag(
      'AI Providers',
      'AI Provider configuration and active health pings (Admin)',
    )
    .addTag(
      'Chats',
      'Conversational AI chat, streaming chat (SSE), and thread history',
    )
    .addTag(
      'Searches',
      'Web search engine queries, history, recent searches & autocomplete',
    )
    .addTag(
      'Admin Management',
      'System administration, user management, subscriptions, analytics & health',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port);
  logger.log(`==========================================================`);
  logger.log(`EchoGPT Backend is running in [${environment}] mode`);
  logger.log(`Server Base URL   : http://localhost:${port}/${apiPrefix}`);
  logger.log(`Swagger Docs URL  : http://localhost:${port}/api/docs`);
  logger.log(
    `Health Check URL  : http://localhost:${port}/${apiPrefix}/health`,
  );
  logger.log(`==========================================================`);
}

bootstrap();

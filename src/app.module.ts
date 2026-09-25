import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import configuration from './config/configuration';
import { envValidationSchema } from './config/env.schema';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ProvidersModule } from './providers/providers.module';
import { ChatsModule } from './chats/chats.module';
import { SearchesModule } from './searches/searches.module';
import { AdminModule } from './admin/admin.module';
import { PaymentsModule } from './payments/payments.module';

import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: (config: Record<string, unknown>) => {
        const { error, value } = envValidationSchema.validate(config, {
          allowUnknown: true,
          abortEarly: false,
        });
        if (error) {
          throw new Error(`Config validation error: ${error.message}`);
        }
        return value;
      },
    }),
    PrismaModule,
    RedisModule,
    MailModule,
    AuthModule,
    UsersModule,
    SubscriptionsModule,
    PaymentsModule,
    ProvidersModule,
    ChatsModule,
    SearchesModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}

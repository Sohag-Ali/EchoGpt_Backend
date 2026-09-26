import { Module } from '@nestjs/common';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';
import { AiProviderHealthService } from './services/ai-provider-health.service';
import { EncryptionService } from '../common/services/encryption.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProvidersController],
  providers: [ProvidersService, AiProviderHealthService, EncryptionService],
  exports: [ProvidersService, EncryptionService],
})
export class ProvidersModule {}

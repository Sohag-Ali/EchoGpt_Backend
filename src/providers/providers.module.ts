import { Module } from '@nestjs/common';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';
import { AiProviderHealthService } from './services/ai-provider-health.service';
import { EncryptionService } from '../common/services/encryption.service';
import { OpenAIService } from './services/openai.service';
import { AnthropicService } from './services/anthropic.service';
import { GeminiService } from './services/gemini.service';
import { AIProviderFactory } from './factory/ai-provider.factory';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProvidersController],
  providers: [
    ProvidersService,
    AiProviderHealthService,
    EncryptionService,
    OpenAIService,
    AnthropicService,
    GeminiService,
    AIProviderFactory,
  ],
  exports: [
    ProvidersService,
    EncryptionService,
    AIProviderFactory,
    OpenAIService,
    AnthropicService,
    GeminiService,
  ],
})
export class ProvidersModule {}

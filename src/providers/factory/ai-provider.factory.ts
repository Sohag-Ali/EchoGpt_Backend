import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ProviderType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';
import {
  AIProviderClient,
  AIProviderConfig,
  AIRequestOptions,
  AIResponse,
} from '../interfaces/ai-provider.interface';
import { OpenAIService } from '../services/openai.service';
import { AnthropicService } from '../services/anthropic.service';
import { GeminiService } from '../services/gemini.service';

@Injectable()
export class AIProviderFactory {
  private readonly logger = new Logger(AIProviderFactory.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly openAiService: OpenAIService,
    private readonly anthropicService: AnthropicService,
    private readonly geminiService: GeminiService,
  ) {}

  /**
   * Resolves target provider implementation client matching the requested ProviderType.
   */
  getProviderClient(providerType: ProviderType): AIProviderClient {
    switch (providerType) {
      case ProviderType.OPENAI:
        return this.openAiService;
      case ProviderType.ANTHROPIC:
        return this.anthropicService;
      case ProviderType.GEMINI:
        return this.geminiService;
      default:
        throw new NotFoundException(
          `Unsupported AI provider type: [${providerType}]`,
        );
    }
  }

  /**
   * Resolves and decrypts the target provider configuration from PostgreSQL.
   * If no type is passed, automatically resolves the active default provider.
   */
  async getProviderConfig(
    requestedType?: ProviderType,
  ): Promise<AIProviderConfig> {
    let provider: any = null;

    if (requestedType) {
      provider = await this.prisma.aIProvider.findFirst({
        where: { providerType: requestedType, isActive: true },
      });

      if (!provider) {
        // Check if provider exists but is disabled
        const disabledProvider = await this.prisma.aIProvider.findFirst({
          where: { providerType: requestedType },
        });

        if (disabledProvider) {
          throw new BadRequestException(
            `AI Provider [${disabledProvider.name}] (${requestedType}) is currently disabled.`,
          );
        }

        throw new NotFoundException(
          `AI Provider for type [${requestedType}] is not registered in database.`,
        );
      }
    } else {
      // Resolve active default provider
      provider = await this.prisma.aIProvider.findFirst({
        where: { isDefault: true, isActive: true },
      });

      if (!provider) {
        throw new BadRequestException(
          'No enabled default AI provider is configured in the database.',
        );
      }
    }

    if (!provider.encryptedApiKey) {
      throw new BadRequestException(
        `AI Provider [${provider.name}] has no API key configured.`,
      );
    }

    let apiKey = '';
    try {
      apiKey = this.encryptionService.decrypt(provider.encryptedApiKey);
    } catch (error: any) {
      this.logger.error(
        `Failed to decrypt API key for provider [${provider.id}]: ${error.message}`,
      );
      throw new BadRequestException(
        `Failed to decrypt API key for provider [${provider.name}].`,
      );
    }

    return {
      id: provider.id,
      name: provider.name,
      type: provider.providerType,
      apiKey,
      modelName: provider.modelName || 'default',
      baseUrl: provider.baseUrl,
      isActive: provider.isActive,
      isDefault: provider.isDefault,
      costPer1kInput: provider.costPer1kInput,
      costPer1kOutput: provider.costPer1kOutput,
    };
  }

  /**
   * High-level execution entry point used by ChatService.
   * Resolves configuration, selects provider client, and generates response seamlessly.
   */
  async generateResponse(
    prompt: string,
    requestedType?: ProviderType,
    options?: AIRequestOptions,
  ): Promise<AIResponse> {
    const config = await this.getProviderConfig(requestedType);
    const client = this.getProviderClient(config.type);

    this.logger.log(
      `Dispatching AI request to provider [${config.name}] (${config.type})`,
    );

    return client.generateResponse(prompt, config, options);
  }

  /**
   * High-level streaming entry point used by ChatService.
   * Resolves configuration, selects provider client, and yields response chunks seamlessly.
   */
  async *streamResponse(
    prompt: string,
    requestedType?: ProviderType,
    options?: AIRequestOptions,
  ): AsyncGenerator<import('../interfaces/ai-provider.interface').AIStreamChunk> {
    const config = await this.getProviderConfig(requestedType);
    const client = this.getProviderClient(config.type);

    this.logger.log(
      `Dispatching AI streaming request to provider [${config.name}] (${config.type})`,
    );

    yield* client.streamResponse(prompt, config, options);
  }
}

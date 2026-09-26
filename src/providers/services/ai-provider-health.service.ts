import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ProviderType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';

@Injectable()
export class AiProviderHealthService {
  private readonly logger = new Logger(AiProviderHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Performs an active, minimal health check call against the target AI provider API.
   * Decrypts the API key in memory only for the request duration.
   * Never exposes credentials or sensitive response headers in output or logs.
   */
  async checkHealth(providerId: string) {
    const provider = await this.prisma.aIProvider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new NotFoundException('AI Provider not found.');
    }

    if (!provider.isActive) {
      throw new BadRequestException(
        'Provider is currently disabled. Enable it before running health check.',
      );
    }

    if (!provider.encryptedApiKey) {
      throw new BadRequestException('Provider has no encrypted API key stored.');
    }

    let apiKey = '';
    try {
      apiKey = this.encryptionService.decrypt(provider.encryptedApiKey);
    } catch (error: any) {
      this.logger.error(`Failed to decrypt API key for provider [${provider.id}]`);
      throw new BadRequestException('Failed to decrypt provider API key for verification.');
    }

    const startTime = Date.now();
    let isHealthy = false;
    let responseTimeMs = 0;

    try {
      if (provider.providerType === ProviderType.OPENAI) {
        const url = (provider.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/models';
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });
        responseTimeMs = Date.now() - startTime;
        isHealthy = res.ok || res.status === 200;
      } else if (provider.providerType === ProviderType.ANTHROPIC) {
        const url = (provider.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '') + '/messages';
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: provider.modelName && provider.modelName !== 'default' ? provider.modelName : 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'health check' }],
          }),
        });
        responseTimeMs = Date.now() - startTime;
        isHealthy = res.ok || res.status === 200 || res.status === 400; // 400 may mean model param check succeeded
      } else if (provider.providerType === ProviderType.GEMINI) {
        const baseUrl = provider.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
        const url = `${baseUrl.replace(/\/+$/, '')}/models?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'GET',
        });
        responseTimeMs = Date.now() - startTime;
        isHealthy = res.ok || res.status === 200;
      } else {
        // Custom or Fallback Provider
        const url = provider.baseUrl || 'https://api.openai.com/v1/models';
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });
        responseTimeMs = Date.now() - startTime;
        isHealthy = res.ok;
      }
    } catch (error: any) {
      responseTimeMs = Date.now() - startTime;
      this.logger.warn(`Health check ping failed for provider [${provider.name}]: ${error.message}`);
      isHealthy = false;
    }

    this.logger.log(
      `Health check completed for [${provider.name}] (${provider.providerType}): Status=${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}, Latency=${responseTimeMs}ms`,
    );

    return {
      success: true,
      message: 'Provider health check completed',
      data: {
        provider: provider.providerType,
        name: provider.name,
        status: isHealthy ? 'HEALTHY' : 'UNHEALTHY',
        responseTime: responseTimeMs,
      },
    };
  }
}

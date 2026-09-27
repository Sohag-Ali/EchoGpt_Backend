import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ProviderType } from '@prisma/client';
import {
  AIProviderClient,
  AIProviderConfig,
  AIRequestOptions,
  AIResponse,
} from '../interfaces/ai-provider.interface';

@Injectable()
export class OpenAIService implements AIProviderClient {
  private readonly logger = new Logger(OpenAIService.name);
  readonly providerType = ProviderType.OPENAI;

  /**
   * Generates a normalized response from OpenAI Chat Completions API.
   * Never logs or exposes raw API keys.
   */
  async generateResponse(
    prompt: string,
    config: AIProviderConfig,
    options?: AIRequestOptions,
  ): Promise<AIResponse> {
    const startTime = Date.now();
    const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(
      /\/+$/,
      '',
    );
    const model =
      config.modelName && config.modelName !== 'default'
        ? config.modelName
        : 'gpt-4o';

    if (!config.apiKey || config.apiKey.toLowerCase().includes('dummy')) {
      return {
        content: `[Mock OpenAI Response] Echo output for: ${prompt}`,
        provider: ProviderType.OPENAI,
        model,
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        finishReason: 'stop',
        responseTimeMs: Date.now() - startTime,
      };
    }

    const messages: Array<{ role: string; content: string }> = [];

    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    if (
      options?.conversationHistory &&
      options.conversationHistory.length > 0
    ) {
      for (const msg of options.conversationHistory) {
        messages.push({
          role: msg.role === 'tool' ? 'user' : msg.role,
          content: msg.content,
        });
      }
    }

    messages.push({ role: 'user', content: prompt });

    const payload = {
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
    };

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const data: any = await response.json();
      const responseTimeMs = Date.now() - startTime;

      if (!response.ok) {
        this.logger.error(
          `OpenAI API request failed. Status: ${response.status}, Code: ${data?.error?.code}, Message: ${data?.error?.message}`,
        );
        throw new BadGatewayException(
          data?.error?.message || 'OpenAI API request failed.',
        );
      }

      const choice = data.choices?.[0];
      const content = choice?.message?.content || '';
      const inputTokens = data.usage?.prompt_tokens || 0;
      const outputTokens = data.usage?.completion_tokens || 0;
      const totalTokens =
        data.usage?.total_tokens || inputTokens + outputTokens;

      this.logger.log(
        `OpenAI response generated successfully. Model: [${model}], Tokens: [In:${inputTokens}, Out:${outputTokens}], Latency: [${responseTimeMs}ms]`,
      );

      return {
        content,
        provider: ProviderType.OPENAI,
        model: data.model || model,
        inputTokens,
        outputTokens,
        totalTokens,
        finishReason: choice?.finish_reason || 'stop',
        responseTimeMs,
      };
    } catch (error: any) {
      if (
        error instanceof BadGatewayException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(`Error reaching OpenAI provider: ${error.message}`);
      throw new BadGatewayException(
        'Failed to generate response from OpenAI provider.',
      );
    }
  }

  async *streamResponse(
    prompt: string,
    config: AIProviderConfig,
    options?: AIRequestOptions,
  ): AsyncGenerator<
    import('../interfaces/ai-provider.interface').AIStreamChunk
  > {
    throw new BadRequestException(
      'Streaming response is currently only implemented for Google Gemini provider.',
    );
  }
}

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
export class AnthropicService implements AIProviderClient {
  private readonly logger = new Logger(AnthropicService.name);
  readonly providerType = ProviderType.ANTHROPIC;

  /**
   * Generates a normalized response from Anthropic Messages API.
   * Never logs or exposes raw API keys.
   */
  async generateResponse(
    prompt: string,
    config: AIProviderConfig,
    options?: AIRequestOptions,
  ): Promise<AIResponse> {
    const startTime = Date.now();
    const baseUrl = (config.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    const model =
      config.modelName && config.modelName !== 'default'
        ? config.modelName
        : 'claude-3-5-sonnet-20240620';

    if (!config.apiKey || config.apiKey.toLowerCase().includes('dummy')) {
      return {
        content: `[Mock Anthropic Response] Echo output for: ${prompt}`,
        provider: ProviderType.ANTHROPIC,
        model,
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        finishReason: 'end_turn',
        responseTimeMs: Date.now() - startTime,
      };
    }

    const messages: Array<{ role: string; content: string }> = [];

    if (options?.conversationHistory && options.conversationHistory.length > 0) {
      for (const msg of options.conversationHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }
    }

    messages.push({ role: 'user', content: prompt });

    const payload: any = {
      model,
      max_tokens: options?.maxTokens || 1024,
      messages,
      temperature: options?.temperature ?? 0.7,
    };

    if (options?.systemPrompt) {
      payload.system = options.systemPrompt;
    }

    try {
      const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
      });

      const data: any = await response.json();
      const responseTimeMs = Date.now() - startTime;

      if (!response.ok) {
        this.logger.error(
          `Anthropic API request failed. Status: ${response.status}, Type: ${data?.error?.type}, Message: ${data?.error?.message}`,
        );
        throw new BadGatewayException(
          data?.error?.message || 'Anthropic API request failed.',
        );
      }

      const content = data.content?.[0]?.text || '';
      const inputTokens = data.usage?.input_tokens || 0;
      const outputTokens = data.usage?.output_tokens || 0;
      const totalTokens = inputTokens + outputTokens;

      this.logger.log(
        `Anthropic response generated successfully. Model: [${model}], Tokens: [In:${inputTokens}, Out:${outputTokens}], Latency: [${responseTimeMs}ms]`,
      );

      return {
        content,
        provider: ProviderType.ANTHROPIC,
        model: data.model || model,
        inputTokens,
        outputTokens,
        totalTokens,
        finishReason: data.stop_reason || 'end_turn',
        responseTimeMs,
      };
    } catch (error: any) {
      if (
        error instanceof BadGatewayException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(`Error reaching Anthropic provider: ${error.message}`);
      throw new BadGatewayException(
        'Failed to generate response from Anthropic provider.',
      );
    }
  }

  async *streamResponse(
    prompt: string,
    config: AIProviderConfig,
    options?: AIRequestOptions,
  ): AsyncGenerator<import('../interfaces/ai-provider.interface').AIStreamChunk> {
    throw new BadRequestException(
      'Streaming response is currently only implemented for Google Gemini provider.',
    );
  }
}

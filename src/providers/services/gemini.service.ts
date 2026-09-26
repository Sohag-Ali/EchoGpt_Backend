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
export class GeminiService implements AIProviderClient {
  private readonly logger = new Logger(GeminiService.name);
  readonly providerType = ProviderType.GEMINI;

  /**
   * Generates a normalized response from Google Gemini GenerateContent API.
   * Never logs or exposes raw API keys.
   */
  async generateResponse(
    prompt: string,
    config: AIProviderConfig,
    options?: AIRequestOptions,
  ): Promise<AIResponse> {
    const startTime = Date.now();
    let baseUrl = (
      config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
    ).replace(/\/+$/, '');

    if (!baseUrl.includes('/v1beta') && !baseUrl.includes('/v1')) {
      baseUrl = `${baseUrl}/v1beta`;
    }

    const defaultModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

    let rawModel =
      config.modelName && config.modelName !== 'default'
        ? config.modelName
        : defaultModel;

    // Normalize obsolete gemini model versions to gemini-3.8-flash
    if (
      rawModel.includes('gemini-1.5-flash') ||
      rawModel.includes('gemini-2.5-flash') ||
      rawModel.includes('gemini-2.0-flash')
    ) {
      rawModel = rawModel
        .replace('gemini-1.5-flash', 'gemini-3.8-flash')
        .replace('gemini-2.5-flash', 'gemini-3.8-flash')
        .replace('gemini-2.0-flash', 'gemini-3.8-flash');
    }

    // Ensure model name does not duplicate 'models/' prefix
    const cleanModel = rawModel.replace(/^models\//, '');

    if (!config.apiKey) {
      this.logger.error({
        provider: 'GEMINI',
        model: cleanModel,
        message: 'Gemini API key is missing.',
      });
      throw new BadGatewayException(
        'Gemini API key is missing for configured provider.',
      );
    }

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (options?.conversationHistory && options.conversationHistory.length > 0) {
      for (const msg of options.conversationHistory) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });

    const payload: any = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens,
      },
    };

    if (options?.systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    // Construct clean REST URL without duplicate 'models/' prefix
    const url = `${baseUrl}/models/${cleanModel}:generateContent`;

    let response: Response | undefined;
    let data: any = {};
    let responseTimeMs = 0;
    const maxAttempts = 3;

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': config.apiKey,
          },
          body: JSON.stringify(payload),
        });

        const responseText = await response.text();
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { error: { message: responseText } };
        }
        responseTimeMs = Date.now() - startTime;

        if (response.ok) {
          break;
        }

        // Handle temporary 503 high-demand spikes with quick retry
        if (response.status === 503 && attempt < maxAttempts) {
          this.logger.warn(
            `Gemini API returned HTTP 503 (High Demand Spike). Retrying attempt [${attempt + 1}/${maxAttempts}]...`,
          );
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }

        break;
      }

      if (!response || !response.ok) {
        // Safe backend diagnostic logging (no secrets or keys exposed)
        this.logger.error({
          provider: 'GEMINI',
          model: cleanModel,
          status: response ? response.status : 500,
          errorType: data?.error?.status || 'API_ERROR',
          errorCode: data?.error?.code,
          message: data?.error?.message || 'Gemini API request failed.',
        });

        throw new BadGatewayException(
          'Failed to generate response from Gemini provider.',
        );
      }

      const candidate = data.candidates?.[0];
      const content = candidate?.content?.parts?.[0]?.text || '';
      const usage = data.usageMetadata;
      const inputTokens = usage?.promptTokenCount || 0;
      const outputTokens = usage?.candidatesTokenCount || 0;
      const totalTokens = usage?.totalTokenCount || inputTokens + outputTokens;

      this.logger.log(
        `Gemini response generated successfully. Model: [${cleanModel}], Tokens: [In:${inputTokens}, Out:${outputTokens}], Latency: [${responseTimeMs}ms]`,
      );

      return {
        content,
        provider: ProviderType.GEMINI,
        model: cleanModel,
        inputTokens,
        outputTokens,
        totalTokens,
        finishReason: candidate?.finishReason || 'STOP',
        responseTimeMs,
      };
    } catch (error: any) {
      if (
        error instanceof BadGatewayException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error({
        provider: 'GEMINI',
        model: cleanModel,
        error: error.message,
      });
      throw new BadGatewayException(
        'Failed to generate response from Gemini provider.',
      );
    }
  }

  async *streamResponse(
    prompt: string,
    config: AIProviderConfig,
    options?: AIRequestOptions,
  ): AsyncGenerator<import('../interfaces/ai-provider.interface').AIStreamChunk> {
    let baseUrl = (
      config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
    ).replace(/\/+$/, '');

    if (!baseUrl.includes('/v1beta') && !baseUrl.includes('/v1')) {
      baseUrl = `${baseUrl}/v1beta`;
    }

    const defaultModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

    let rawModel =
      config.modelName && config.modelName !== 'default'
        ? config.modelName
        : defaultModel;

    if (
      rawModel.includes('gemini-1.5-flash') ||
      rawModel.includes('gemini-2.5-flash') ||
      rawModel.includes('gemini-2.0-flash')
    ) {
      rawModel = rawModel
        .replace('gemini-1.5-flash', 'gemini-3.8-flash')
        .replace('gemini-2.5-flash', 'gemini-3.8-flash')
        .replace('gemini-2.0-flash', 'gemini-3.8-flash');
    }

    const cleanModel = rawModel.replace(/^models\//, '');

    if (!config.apiKey) {
      this.logger.error({
        provider: 'GEMINI',
        model: cleanModel,
        message: 'Gemini API key is missing.',
      });
      throw new BadGatewayException(
        'Gemini API key is missing for configured provider.',
      );
    }

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (options?.conversationHistory && options.conversationHistory.length > 0) {
      for (const msg of options.conversationHistory) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });

    const payload: any = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens,
      },
    };

    if (options?.systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    const url = `${baseUrl}/models/${cleanModel}:streamGenerateContent?alt=sse`;

    let response: Response | undefined;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': config.apiKey,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) break;

        if (response.status === 503 && attempt < maxAttempts) {
          this.logger.warn(
            `Gemini Stream returned 503 (High Demand). Retrying attempt [${attempt + 1}/${maxAttempts}]...`,
          );
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }

        break;
      } catch (err: any) {
        if (attempt === maxAttempts) throw err;
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    if (!response || !response.ok || !response.body) {
      const errText = response ? await response.text() : 'No response from Gemini API';
      let errData: any = {};
      try {
        errData = JSON.parse(errText);
      } catch {
        errData = { error: { message: errText } };
      }

      this.logger.error({
        provider: 'GEMINI',
        model: cleanModel,
        status: response ? response.status : 500,
        errorType: errData?.error?.status || 'API_ERROR',
        errorCode: errData?.error?.code,
        message: errData?.error?.message || 'Gemini stream request failed.',
      });

      throw new BadGatewayException(
        errData?.error?.message || 'Failed to stream response from Gemini provider.',
      );
    }

    const reader = (response.body as any).getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const candidate = parsed.candidates?.[0];
          const text = candidate?.content?.parts?.[0]?.text || '';
          const usage = parsed.usageMetadata;

          yield {
            content: text,
            provider: ProviderType.GEMINI,
            model: cleanModel,
            inputTokens: usage?.promptTokenCount,
            outputTokens: usage?.candidatesTokenCount,
            totalTokens: usage?.totalTokenCount,
            finishReason: candidate?.finishReason,
          };
        } catch {
          // Ignore incomplete chunk parse errors
        }
      }
    }

    if (buffer.trim().startsWith('data:')) {
      const jsonStr = buffer.trim().slice(5).trim();
      if (jsonStr && jsonStr !== '[DONE]') {
        try {
          const parsed = JSON.parse(jsonStr);
          const candidate = parsed.candidates?.[0];
          const text = candidate?.content?.parts?.[0]?.text || '';
          const usage = parsed.usageMetadata;
          if (text || usage) {
            yield {
              content: text,
              provider: ProviderType.GEMINI,
              model: cleanModel,
              inputTokens: usage?.promptTokenCount,
              outputTokens: usage?.candidatesTokenCount,
              totalTokens: usage?.totalTokenCount,
              finishReason: candidate?.finishReason,
            };
          }
        } catch {
          // Ignore incomplete buffer parse error
        }
      }
    }
  }
}


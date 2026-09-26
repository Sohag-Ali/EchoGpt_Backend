import { ProviderType } from '@prisma/client';

export interface AIMessageHistory {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface AIRequestOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  conversationHistory?: AIMessageHistory[];
}

export interface AIResponse {
  content: string;
  provider: ProviderType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  finishReason?: string;
  responseTimeMs: number;
}

export interface AIProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  apiKey: string;
  modelName: string;
  baseUrl?: string | null;
  isActive: boolean;
  isDefault: boolean;
  costPer1kInput?: number;
  costPer1kOutput?: number;
}

export interface AIProviderClient {
  readonly providerType: ProviderType;

  generateResponse(
    prompt: string,
    config: AIProviderConfig,
    options?: AIRequestOptions,
  ): Promise<AIResponse>;
}

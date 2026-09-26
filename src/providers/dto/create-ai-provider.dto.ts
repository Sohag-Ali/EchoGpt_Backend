import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAIProviderDto {
  @ApiProperty({
    description: 'Human-readable name of the AI provider',
    example: 'OpenAI GPT-4o',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Supported provider engine type',
    enum: ProviderType,
    example: ProviderType.OPENAI,
  })
  @IsEnum(ProviderType)
  @IsNotEmpty()
  type: ProviderType;

  @ApiProperty({
    description: 'Provider API Key (encrypted at rest)',
    example: 'sk-proj-placeholder-key-never-exposed',
  })
  @IsString()
  @IsNotEmpty()
  apiKey: string;

  @ApiPropertyOptional({
    description: 'Default target model name',
    example: 'gpt-4o',
  })
  @IsOptional()
  @IsString()
  modelName?: string;

  @ApiPropertyOptional({
    description: 'Custom base URL if proxy or custom endpoint is used',
    example: 'https://api.openai.com/v1',
  })
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @ApiPropertyOptional({
    description: 'Cost per 1k input tokens in USD',
    example: 0.005,
  })
  @IsOptional()
  @IsNumber()
  costPer1kInput?: number;

  @ApiPropertyOptional({
    description: 'Cost per 1k output tokens in USD',
    example: 0.015,
  })
  @IsOptional()
  @IsNumber()
  costPer1kOutput?: number;

  @ApiPropertyOptional({
    description: 'Whether the provider is enabled for AI operations',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

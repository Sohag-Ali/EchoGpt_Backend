import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateAIProviderDto {
  @ApiPropertyOptional({
    description: 'Updated human-readable name of the AI provider',
    example: 'OpenAI Production Engine',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated provider engine type',
    enum: ProviderType,
    example: ProviderType.OPENAI,
  })
  @IsOptional()
  @IsEnum(ProviderType)
  type?: ProviderType;

  @ApiPropertyOptional({
    description: 'New Provider API Key to replace existing key',
    example: 'sk-proj-new-placeholder-api-key',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  apiKey?: string;

  @ApiPropertyOptional({
    description: 'Updated model name',
    example: 'gpt-4o-mini',
  })
  @IsOptional()
  @IsString()
  modelName?: string;

  @ApiPropertyOptional({
    description: 'Updated base URL',
    example: 'https://api.openai.com/v1',
  })
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @ApiPropertyOptional({
    description: 'Updated cost per 1k input tokens',
    example: 0.002,
  })
  @IsOptional()
  @IsNumber()
  costPer1kInput?: number;

  @ApiPropertyOptional({
    description: 'Updated cost per 1k output tokens',
    example: 0.008,
  })
  @IsOptional()
  @IsNumber()
  costPer1kOutput?: number;

  @ApiPropertyOptional({
    description: 'Toggle provider enabled status',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

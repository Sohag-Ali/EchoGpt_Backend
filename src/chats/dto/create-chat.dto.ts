import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderType } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateChatDto {
  @ApiProperty({
    example: 'Explain JavaScript closure in simple terms.',
    description: 'User prompt for the AI assistant',
  })
  @IsNotEmpty({ message: 'prompt should not be empty' })
  @IsString({ message: 'prompt must be a string' })
  @MaxLength(10000, { message: 'prompt must not exceed 10000 characters' })
  prompt!: string;

  @ApiPropertyOptional({
    example: 'Explain JavaScript closure in simple terms.',
    description: 'Alias for prompt parameter',
  })
  @IsOptional()
  @IsString({ message: 'message must be a string' })
  @MaxLength(10000, { message: 'message must not exceed 10000 characters' })
  message?: string;

  @ApiPropertyOptional({
    enum: ProviderType,
    example: ProviderType.OPENAI,
    description:
      'Optional AI Provider engine (OPENAI, ANTHROPIC, GEMINI). If omitted, active default provider is used.',
  })
  @IsOptional()
  @IsEnum(ProviderType)
  provider?: ProviderType;

  @ApiPropertyOptional({
    example: 'provider-uuid-12345',
    description: 'Optional AI Provider UUID',
  })
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({
    example: 'JavaScript Closures',
    description: 'Optional conversation title',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    example: 'You are an expert AI software architecture tutor.',
    description: 'Optional system prompt instructions',
  })
  @IsOptional()
  @IsString()
  systemPrompt?: string;
}

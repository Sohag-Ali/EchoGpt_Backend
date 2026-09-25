import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateChatDto {
  @ApiProperty({
    example: 'Explain quantum computing in simple terms.',
    description: 'User message prompt for the AI assistant',
  })
  @IsNotEmpty({ message: 'message prompt is required' })
  @IsString({ message: 'message must be a string' })
  message!: string;

  @ApiPropertyOptional({
    example: 'Quantum Computing Intro',
    description: 'Optional chat title',
  })
  @IsOptional()
  @IsString({ message: 'title must be a string' })
  title?: string;

  @ApiPropertyOptional({
    example: 'provider-uuid-12345',
    description: 'Optional AI Provider ID',
  })
  @IsOptional()
  @IsString({ message: 'providerId must be a string' })
  providerId?: string;

  @ApiPropertyOptional({
    example: 'You are an expert AI assistant specializing in technology.',
    description: 'Optional system prompt instructions',
  })
  @IsOptional()
  @IsString({ message: 'systemPrompt must be a string' })
  systemPrompt?: string;
}

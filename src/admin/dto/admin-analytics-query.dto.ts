import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AdminAnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Start date ISO string (e.g. 2026-09-01)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'End date ISO string (e.g. 2026-09-26)' })
  @IsOptional()
  @IsString()
  to?: string;
}

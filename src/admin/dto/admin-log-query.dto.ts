import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApiRequestType, ApiUsageStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AdminLogQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by User ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by Provider ID' })
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({ enum: ApiRequestType })
  @IsOptional()
  @IsEnum(ApiRequestType)
  requestType?: ApiRequestType;

  @ApiPropertyOptional({ enum: ApiUsageStatus })
  @IsOptional()
  @IsEnum(ApiUsageStatus)
  status?: ApiUsageStatus;

  @ApiPropertyOptional({ description: 'Filter by endpoint path' })
  @IsOptional()
  @IsString()
  endpoint?: string;

  @ApiPropertyOptional({ description: 'Start date ISO string (e.g. 2026-09-01)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'End date ISO string (e.g. 2026-09-26)' })
  @IsOptional()
  @IsString()
  to?: string;
}

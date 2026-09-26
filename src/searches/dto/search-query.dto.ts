import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchHistoryQueryDto {
  @ApiPropertyOptional({ example: 1, description: 'Page number (default: 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    description: 'Limit per page (default: 20, max: 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class RecentSearchesQueryDto {
  @ApiPropertyOptional({
    example: 10,
    description: 'Limit recent searches (default: 10, max: 20)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 10;
}

export class SearchSuggestionsQueryDto {
  @ApiPropertyOptional({
    example: 'java',
    description: 'Query prefix for search suggestions (minimum 1 char)',
  })
  @IsOptional()
  @IsString()
  q?: string;
}

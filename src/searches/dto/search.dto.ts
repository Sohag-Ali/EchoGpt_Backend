import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SearchDto {
  @ApiProperty({
    example: 'latest JavaScript features',
    description: 'Web search query text (max 500 characters)',
  })
  @IsNotEmpty({ message: 'query should not be empty' })
  @IsString({ message: 'query must be a string' })
  @MaxLength(500, { message: 'query must not exceed 500 characters' })
  query!: string;
}

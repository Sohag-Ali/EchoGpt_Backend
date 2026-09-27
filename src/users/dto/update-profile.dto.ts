import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'Sohag',
    description: 'First name',
  })
  @IsOptional()
  @IsString({ message: 'firstName must be a string' })
  @MinLength(1, { message: 'firstName must be at least 1 character long' })
  firstName?: string;

  @ApiPropertyOptional({
    example: 'Ali',
    description: 'Last name',
  })
  @IsOptional()
  @IsString({ message: 'lastName must be a string' })
  lastName?: string;

  @ApiPropertyOptional({
    example: '+8801700000000',
    description: 'Phone number',
  })
  @IsOptional()
  @IsString({ message: 'phone must be a string' })
  phone?: string;

  @ApiPropertyOptional({
    example: 'Backend software developer with NestJS & Prisma.',
    description: 'Short biography',
  })
  @IsOptional()
  @IsString({ message: 'bio must be a string' })
  @MaxLength(1000, { message: 'bio cannot exceed 1000 characters' })
  bio?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/images/avatar.jpg',
    description: 'Profile image URL or file upload',
  })
  @IsOptional()
  @IsString({ message: 'profileImage must be a string' })
  profileImage?: string;

  @ApiPropertyOptional({
    example: '1995-10-25',
    description: 'Date of birth in ISO date format (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'dateOfBirth must be a valid ISO date string' })
  dateOfBirth?: string;

  @ApiPropertyOptional({
    example: 'Male',
    description: 'Gender',
  })
  @IsOptional()
  @IsString({ message: 'gender must be a string' })
  gender?: string;

  @ApiPropertyOptional({
    example: 'Bangladesh',
    description: 'Country',
  })
  @IsOptional()
  @IsString({ message: 'country must be a string' })
  country?: string;

  @ApiPropertyOptional({
    example: 'Dhaka',
    description: 'City',
  })
  @IsOptional()
  @IsString({ message: 'city must be a string' })
  city?: string;

  @ApiPropertyOptional({
    example: 'Gulshan 2, Dhaka',
    description: 'Address',
  })
  @IsOptional()
  @IsString({ message: 'address must be a string' })
  address?: string;

  @ApiPropertyOptional({
    example: 'https://sohag.dev',
    description: 'Personal website URL',
  })
  @IsOptional()
  @IsUrl({}, { message: 'website must be a valid URL' })
  website?: string;

  @ApiPropertyOptional({
    example: 'https://github.com/sohag',
    description: 'GitHub profile URL',
  })
  @IsOptional()
  @IsUrl({}, { message: 'github must be a valid URL' })
  github?: string;

  @ApiPropertyOptional({
    example: 'https://linkedin.com/in/sohag',
    description: 'LinkedIn profile URL',
  })
  @IsOptional()
  @IsUrl({}, { message: 'linkedin must be a valid URL' })
  linkedin?: string;
}

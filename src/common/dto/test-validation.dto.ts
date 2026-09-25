import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class TestValidationDto {
  @ApiProperty({
    example: 'user@echogpt.io',
    description: 'User email address',
  })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @IsNotEmpty({ message: 'email should not be empty' })
  email: string;

  @ApiProperty({
    example: 'SecretP@ss123',
    description: 'User password (minimum 8 characters)',
  })
  @IsString({ message: 'password must be a string' })
  @MinLength(8, { message: 'password must be at least 8 characters long' })
  password: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User registered email address',
  })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @IsNotEmpty({ message: 'email is required' })
  email: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP code sent to registered email',
  })
  @IsString({ message: 'otp must be a string' })
  @Length(6, 6, { message: 'otp must be exactly 6 digits' })
  otp: string;

  @ApiProperty({
    example: 'NewPassword123!',
    description: 'New password (minimum 8 characters)',
  })
  @IsString({ message: 'newPassword must be a string' })
  @MinLength(8, { message: 'newPassword must be at least 8 characters long' })
  newPassword: string;
}

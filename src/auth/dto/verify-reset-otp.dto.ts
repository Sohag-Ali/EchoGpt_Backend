import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyResetOtpDto {
  @ApiProperty({
    example: 'sohag@echogpt.io',
    description: 'User registered email address',
  })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @IsNotEmpty({ message: 'email is required' })
  email: string;

  @ApiProperty({
    example: '482915',
    description: '6-digit OTP code sent via email',
  })
  @IsString({ message: 'otp must be a string' })
  @Length(6, 6, { message: 'otp must be exactly 6 digits' })
  otp: string;
}

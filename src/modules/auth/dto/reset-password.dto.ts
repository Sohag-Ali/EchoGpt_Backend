import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'a1b2c3d4e5f67890a1b2c3d4e5f67890',
    description: 'Temporary single-use reset token received upon successful OTP verification',
  })
  @IsString({ message: 'resetToken must be a string' })
  @IsNotEmpty({ message: 'resetToken is required' })
  resetToken: string;

  @ApiProperty({
    example: 'NewBrandPass123!',
    description: 'New password (minimum 8 characters)',
  })
  @IsString({ message: 'newPassword must be a string' })
  @MinLength(8, { message: 'newPassword must be at least 8 characters long' })
  newPassword: string;
}

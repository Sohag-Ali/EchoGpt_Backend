import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'UserEchoGPT2026!SecretPass',
    description: 'Current user password',
  })
  @IsString({ message: 'currentPassword must be a string' })
  @IsNotEmpty({ message: 'currentPassword is required' })
  currentPassword: string;

  @ApiProperty({
    example: 'NewPassword123!',
    description: 'New password (minimum 8 characters)',
  })
  @IsString({ message: 'newPassword must be a string' })
  @MinLength(8, { message: 'newPassword must be at least 8 characters long' })
  newPassword: string;
}

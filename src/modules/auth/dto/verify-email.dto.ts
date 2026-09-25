import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailQueryDto {
  @ApiProperty({
    example: '8f3Kx9Lm2Qa7Vp4Rs6Tn1YwZ5Hd8Jc',
    description: 'Single-use raw email verification token received via email',
  })
  @IsString({ message: 'token must be a string' })
  @IsNotEmpty({ message: 'token is required' })
  token: string;
}

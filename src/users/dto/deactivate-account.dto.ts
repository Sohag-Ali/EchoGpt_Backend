import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DeactivateAccountDto {
  @ApiProperty({
    example: 'UserEchoGPT2026!SecretPass',
    description: 'Current user password to confirm deactivation',
  })
  @IsString({ message: 'password must be a string' })
  @IsNotEmpty({ message: 'password is required' })
  password: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ExecutePaymentDto {
  @ApiProperty({
    example: 'TR0011c7MkJ1710928392102',
    description: 'bKash Provider Payment ID returned during payment creation',
  })
  @IsNotEmpty({ message: 'paymentID is required' })
  @IsString({ message: 'paymentID must be a string' })
  paymentID!: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { RoleType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class AdminUpdateUserDto {
  @ApiPropertyOptional({ example: 'Sohag Ali Updated', description: 'User full name' })
  @IsOptional()
  @IsString({ message: 'name must be a string' })
  @MinLength(2, { message: 'name must be at least 2 characters long' })
  name?: string;

  @ApiPropertyOptional({ enum: RoleType, example: RoleType.USER, description: 'Role assigned to user (USER, ADMIN)' })
  @IsOptional()
  @IsEnum(RoleType, { message: 'role must be a valid RoleType (USER, ADMIN)' })
  role?: RoleType;

  @ApiPropertyOptional({ example: true, description: 'Active status of user' })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}

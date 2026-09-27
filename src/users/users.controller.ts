import 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RoleType } from '@prisma/client';
import { UsersService } from './users.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // =========================================================================
  // AUTHENTICATED USER ENDPOINTS
  // =========================================================================

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get basic authenticated user account information' })
  @ApiResponse({
    status: 200,
    description: 'Account information fetched successfully.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Bearer token or HttpOnly cookie missing, expired, or invalid.',
  })
  async getMe(@CurrentUser('id') userId: string) {
    return this.usersService.getMe(userId);
  }

  @Get('me/profile')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current user account and complete UserProfile data',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile fetched successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized access.',
  })
  async getMeProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getMeProfile(userId);
  }

  @Get('me/usage-logs')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current user API usage audit logs with pagination',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'API usage logs fetched successfully.',
  })
  async getMeUsageLogs(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getMeUsageLogs(userId, page, limit);
  }

  @Patch('me/profile')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('profileImage'))
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Create or update own UserProfile details and optional Cloudinary profile image',
  })
  @ApiBody({
    description:
      'Profile information and optional profile image file (jpg, jpeg, png, webp, max 5MB)',
    schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string', example: 'Sohag' },
        lastName: { type: 'string', example: 'Ali' },
        phone: { type: 'string', example: '+8801700000000' },
        bio: {
          type: 'string',
          example: 'Backend software developer with NestJS & Prisma.',
        },
        dateOfBirth: { type: 'string', format: 'date', example: '1995-10-25' },
        gender: { type: 'string', example: 'Male' },
        country: { type: 'string', example: 'Bangladesh' },
        city: { type: 'string', example: 'Dhaka' },
        address: { type: 'string', example: 'Gulshan 2, Dhaka' },
        website: { type: 'string', example: 'https://sohag.dev' },
        github: { type: 'string', example: 'https://github.com/sohag' },
        linkedin: { type: 'string', example: 'https://linkedin.com/in/sohag' },
        profileImage: {
          type: 'string',
          format: 'binary',
          description:
            'Profile image file (JPG, JPEG, PNG, WEBP allowed, max size 5MB)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Validation failed or unsupported image file format.',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized access.',
  })
  @ApiPayloadTooLargeResponse({
    description: 'File size exceeds the 5MB maximum limit.',
  })
  @ApiInternalServerErrorResponse({
    description: 'Cloudinary upload or server storage error.',
  })
  async updateMyProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ];
      const allowedExtensions = /\.(jpg|jpeg|png|webp)$/i;

      if (
        !allowedMimeTypes.includes(file.mimetype) &&
        !file.originalname.match(allowedExtensions)
      ) {
        throw new BadRequestException(
          'Invalid file type. Only JPG, JPEG, PNG, and WEBP image files are allowed.',
        );
      }

      const maxSize = 5 * 1024 * 1024; // 5MB limit
      if (file.size > maxSize) {
        throw new BadRequestException(
          'File size exceeds the 5MB maximum limit.',
        );
      }
    }

    return this.usersService.updateMyProfile(userId, dto, file);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Change own password using current password' })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Incorrect current password or new password same as current.',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized access.',
  })
  async changeMyPassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changeMyPassword(userId, dto);
  }

  @Patch('me/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Deactivate own user account using current password',
  })
  @ApiResponse({
    status: 200,
    description: 'Account deactivated successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Incorrect password provided.',
  })
  @ApiConflictResponse({
    description: 'Cannot deactivate the last active administrator account.',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized access.',
  })
  async deactivateMyAccount(
    @CurrentUser('id') userId: string,
    @Body() dto: DeactivateAccountDto,
  ) {
    return this.usersService.deactivateMyAccount(userId, dto);
  }

  // =========================================================================
  // ADMIN USER MANAGEMENT ENDPOINTS (Requires ADMIN Role)
  // =========================================================================

  @Get('admin')
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Admin: Get paginated users with search & filters (ADMIN role required)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String, example: 'sohag' })
  @ApiQuery({ name: 'role', required: false, enum: RoleType })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'Users list fetched successfully.',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden. Authenticated user lacks ADMIN role.',
  })
  async adminGetUsers(@Query() query: QueryUsersDto) {
    return this.usersService.adminGetUsers(query);
  }

  @Get('admin/:id')
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Get user details by ID (ADMIN role required)',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User details fetched successfully.',
  })
  @ApiNotFoundResponse({
    description: 'User not found.',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden. Authenticated user lacks ADMIN role.',
  })
  async adminGetUserById(@Param('id') id: string) {
    return this.usersService.adminGetUserById(id);
  }

  @Patch('admin/:id')
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Admin: Update user controlled fields (name, role, isActive) (ADMIN role required)',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully.',
  })
  @ApiConflictResponse({
    description: 'Cannot deactivate or demote the last active administrator.',
  })
  @ApiNotFoundResponse({
    description: 'User not found.',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden. Authenticated user lacks ADMIN role.',
  })
  async adminUpdateUser(
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.usersService.adminUpdateUser(id, dto);
  }

  @Delete('admin/:id')
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Delete user and associated records (ADMIN role required)',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User deleted successfully.',
  })
  @ApiConflictResponse({
    description: 'Cannot delete the last active administrator.',
  })
  @ApiNotFoundResponse({
    description: 'User not found.',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden. Authenticated user lacks ADMIN role.',
  })
  async adminDeleteUser(
    @Param('id') id: string,
    @CurrentUser('id') currentAdminId: string,
  ) {
    return this.usersService.adminDeleteUser(id, currentAdminId);
  }
}

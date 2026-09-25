import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
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
    description: 'Bearer token or HttpOnly cookie missing, expired, or invalid.',
  })
  async getMe(@CurrentUser('id') userId: string) {
    return this.usersService.getMe(userId);
  }

  @Get('me/profile')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user account and complete UserProfile data' })
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

  @Patch('me/profile')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create or update own optional UserProfile details' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized access.',
  })
  async updateMyProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateMyProfile(userId, dto);
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
  @ApiOperation({ summary: 'Deactivate own user account using current password' })
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
  @ApiOperation({ summary: 'Admin: Get paginated users with search & filters (ADMIN role required)' })
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
  @ApiOperation({ summary: 'Admin: Get user details by ID (ADMIN role required)' })
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
  @ApiOperation({ summary: 'Admin: Update user controlled fields (name, role, isActive) (ADMIN role required)' })
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
  @ApiOperation({ summary: 'Admin: Delete user and associated records (ADMIN role required)' })
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

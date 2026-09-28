import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RoleType } from '@prisma/client';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { AdminSubscriptionQueryDto } from './dto/admin-subscription-query.dto';
import { AdminLogQueryDto } from './dto/admin-log-query.dto';
import { AdminAnalyticsQueryDto } from './dto/admin-analytics-query.dto';
import { CreateAIProviderDto } from '../providers/dto/create-ai-provider.dto';
import { UpdateAIProviderDto } from '../providers/dto/update-ai-provider.dto';

@ApiTags('Admin Management')
@Controller('admin')
@Roles(RoleType.ADMIN)
@ApiBearerAuth('JWT-auth')
@ApiUnauthorizedResponse({ description: 'Unauthorized access.' })
@ApiForbiddenResponse({ description: 'Forbidden. Requires ADMIN role.' })
export class AdminController {
  constructor(private readonly adminService: AdminService) {}


  // 1. DASHBOARD
  

  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin Dashboard metrics (Requires ADMIN role)' })
  @ApiResponse({
    status: 200,
    description: 'Admin dashboard metrics retrieved successfully.',
  })
  async getAdminDashboard() {
    const data = await this.adminService.getDashboardMetrics();
    return {
      success: true,
      message: 'Admin dashboard fetched successfully',
      data,
    };
  }


  // 2. USER MANAGEMENT
  

  @Get('users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get paginated users with filters (Requires ADMIN role)',
  })
  @ApiResponse({ status: 200, description: 'Users fetched successfully.' })
  async getUsers(@Query() query: AdminUserQueryDto) {
    return this.adminService.getUsers(query);
  }

  @Get('users/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get detailed user details (Requires ADMIN role)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User details fetched successfully.',
  })
  @ApiNotFoundResponse({ description: 'User not found.' })
  async getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update user administrative status/role (Requires ADMIN role)',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User updated successfully.' })
  @ApiConflictResponse({
    description: 'Cannot deactivate or demote the last active administrator.',
  })
  async updateUser(@Param('id') id: string, @Body() dto: UpdateAdminUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete user with safe relation cascade (Requires ADMIN role)',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User deleted successfully.' })
  @ApiConflictResponse({
    description: 'Cannot delete the last active administrator.',
  })
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser('id') currentAdminId: string,
  ) {
    return this.adminService.deleteUser(id, currentAdminId);
  }

  
  // 3. SUBSCRIPTION MANAGEMENT


  @Get('subscriptions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get paginated subscriptions with filters (Requires ADMIN role)',
  })
  @ApiResponse({
    status: 200,
    description: 'Subscriptions fetched successfully.',
  })
  async getSubscriptions(@Query() query: AdminSubscriptionQueryDto) {
    const data = await this.adminService.getSubscriptions(query);
    return {
      success: true,
      message: 'Subscriptions fetched successfully',
      data,
    };
  }

 
  // 4. AI PROVIDER MANAGEMENT


  @Get('providers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all AI providers (Requires ADMIN role)' })
  @ApiResponse({
    status: 200,
    description: 'AI providers retrieved successfully.',
  })
  async getAllProviders() {
    return this.adminService.getAllProviders();
  }

  @Post('providers')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new AI provider (Requires ADMIN role)' })
  @ApiResponse({
    status: 201,
    description: 'AI provider created successfully.',
  })
  async createProvider(@Body() dto: CreateAIProviderDto) {
    return this.adminService.createProvider(dto);
  }

  @Patch('providers/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update AI provider configuration (Requires ADMIN role)',
  })
  @ApiParam({ name: 'id', description: 'Provider ID' })
  @ApiResponse({
    status: 200,
    description: 'AI provider updated successfully.',
  })
  async updateProvider(
    @Param('id') id: string,
    @Body() dto: UpdateAIProviderDto,
  ) {
    return this.adminService.updateProvider(id, dto);
  }

  @Delete('providers/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete AI provider (Requires ADMIN role)' })
  @ApiParam({ name: 'id', description: 'Provider ID' })
  @ApiResponse({
    status: 200,
    description: 'AI provider deleted successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Cannot delete provider with existing chat or usage history.',
  })
  async deleteProvider(@Param('id') id: string) {
    return this.adminService.deleteProvider(id);
  }

  
  // 5. ANALYTICS & LOGS


  @Get('analytics/usage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get aggregated API usage analytics (Requires ADMIN role)',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage analytics fetched successfully.',
  })
  async getUsageAnalytics(@Query() query: AdminAnalyticsQueryDto) {
    const data = await this.adminService.getUsageAnalytics(query);
    return {
      success: true,
      message: 'Usage analytics fetched successfully',
      data,
    };
  }

  @Get('logs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get paginated system API usage audit logs (Requires ADMIN role)',
  })
  @ApiResponse({
    status: 200,
    description: 'System API usage logs fetched successfully.',
  })
  async getSystemUsageLogs(@Query() query: AdminLogQueryDto) {
    const data = await this.adminService.getSystemUsageLogs(query);
    return {
      success: true,
      message: 'System API usage logs fetched successfully',
      data,
    };
  }


  // 6. HEALTH


  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get system health metrics (Requires ADMIN role)' })
  @ApiResponse({
    status: 200,
    description: 'System health fetched successfully.',
  })
  async getSystemHealth() {
    const data = await this.adminService.getSystemHealth();
    return {
      success: true,
      message: 'System health fetched successfully',
      data,
    };
  }
}

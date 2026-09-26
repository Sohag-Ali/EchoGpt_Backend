import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RoleType } from '@prisma/client';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Admin Management')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Admin Dashboard metrics (Requires ADMIN role)' })
  @ApiResponse({
    status: 200,
    description: 'Admin dashboard metrics retrieved successfully.',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden. Authenticated user lacks ADMIN role.',
  })
  async getAdminDashboard(@CurrentUser() user: any) {
    const data = await this.adminService.getDashboardMetrics(user);
    return {
      success: true,
      message: 'Admin metrics retrieved successfully.',
      data,
    };
  }

  @Get('usage-logs')
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get system-wide API usage audit logs (Requires ADMIN role)' })
  @ApiResponse({
    status: 200,
    description: 'System API usage logs retrieved successfully.',
  })
  async getSystemUsageLogs(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const data = await this.adminService.getSystemUsageLogs(page, limit);
    return {
      success: true,
      message: 'System API usage logs retrieved successfully.',
      data,
    };
  }
}


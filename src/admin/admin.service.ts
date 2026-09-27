import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { ProvidersService } from '../providers/providers.service';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { AdminSubscriptionQueryDto } from './dto/admin-subscription-query.dto';
import { AdminLogQueryDto } from './dto/admin-log-query.dto';
import { AdminAnalyticsQueryDto } from './dto/admin-analytics-query.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly usersService: UsersService,
    private readonly providersService: ProvidersService,
  ) {}

  /**
   * 1. GET /api/v1/admin/dashboard - Aggregated System Metrics
   */
  async getDashboardMetrics() {
    const [
      totalUsers,
      freeUsers,
      premiumUsers,
      totalChats,
      totalSearches,
      activeProviders,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.subscription.count({
        where: { plan: 'FREE', status: 'ACTIVE' },
      }),
      this.prisma.subscription.count({
        where: { plan: 'PREMIUM', status: 'ACTIVE' },
      }),
      this.prisma.chat.count(),
      this.prisma.webSearch.count(),
      this.prisma.aIProvider.count({
        where: { isActive: true },
      }),
    ]);

    return {
      totalUsers,
      freeUsers,
      premiumUsers,
      totalChats,
      totalSearches,
      activeProviders,
    };
  }

  /**
   * 2. USER MANAGEMENT - Delegated to UsersService
   */
  async getUsers(query: AdminUserQueryDto) {
    return this.usersService.adminGetUsers(query as any);
  }

  async getUserById(id: string) {
    return this.usersService.adminGetUserById(id);
  }

  async updateUser(targetUserId: string, dto: UpdateAdminUserDto) {
    return this.usersService.adminUpdateUser(targetUserId, dto as any);
  }

  async deleteUser(targetUserId: string, currentAdminId: string) {
    return this.usersService.adminDeleteUser(targetUserId, currentAdminId);
  }

  /**
   * 3. SUBSCRIPTION MANAGEMENT
   */
  async getSubscriptions(query: AdminSubscriptionQueryDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.plan) where.plan = query.plan;
    if (query.status) where.status = query.status;

    if (query.search) {
      const searchTerm = query.search.trim();
      where.user = {
        OR: [
          { email: { contains: searchTerm, mode: 'insensitive' } },
          { name: { contains: searchTerm, mode: 'insensitive' } },
        ],
      };
    }

    const [total, subscriptions] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const formattedItems = subscriptions.map((sub) => ({
      id: sub.id,
      userId: sub.userId,
      user: sub.user,
      plan: sub.plan,
      status: sub.status,
      monthlyLimit: sub.monthlyLimit,
      usedRequests: sub.usedRequests,
      remainingRequests: Math.max(0, sub.monthlyLimit - sub.usedRequests),
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    }));

    return {
      items: formattedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 4. PROVIDER MANAGEMENT - Delegated to ProvidersService
   */
  async getAllProviders() {
    return this.providersService.getAllProviders();
  }

  async createProvider(dto: any) {
    return this.providersService.createProvider(dto);
  }

  async updateProvider(id: string, dto: any) {
    return this.providersService.updateProvider(id, dto);
  }

  async deleteProvider(id: string) {
    return this.providersService.deleteProvider(id);
  }

  /**
   * 5. ANALYTICS - Aggregate API Usage Logs
   */
  async getUsageAnalytics(query: AdminAnalyticsQueryDto) {
    const where: any = {};

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [
      totalRequests,
      successfulRequests,
      failedRequests,
      aggregateStats,
      requestTypeGroups,
      providerGroups,
      endpointGroups,
    ] = await Promise.all([
      this.prisma.apiUsageLog.count({ where }),
      this.prisma.apiUsageLog.count({ where: { ...where, status: 'SUCCESS' } }),
      this.prisma.apiUsageLog.count({ where: { ...where, status: 'FAILED' } }),
      this.prisma.apiUsageLog.aggregate({
        where,
        _sum: { totalTokens: true },
        _avg: { latencyMs: true },
      }),
      this.prisma.apiUsageLog.groupBy({
        by: ['requestType'],
        where,
        _count: { _all: true },
      }),
      this.prisma.apiUsageLog.groupBy({
        by: ['providerId'],
        where,
        _count: { _all: true },
      }),
      this.prisma.apiUsageLog.groupBy({
        by: ['endpoint'],
        where,
        _count: { _all: true },
      }),
    ]);

    const byRequestType: Record<string, number> = {};
    for (const group of requestTypeGroups) {
      byRequestType[group.requestType] = group._count._all;
    }

    const byEndpoint: Record<string, number> = {};
    for (const group of endpointGroups) {
      byEndpoint[group.endpoint] = group._count._all;
    }

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      totalTokens: aggregateStats._sum.totalTokens || 0,
      averageResponseTime: Math.round(aggregateStats._avg.latencyMs || 0),
      byRequestType,
      byProvider: providerGroups.map((g) => ({
        providerId: g.providerId || 'N/A',
        count: g._count._all,
      })),
      byEndpoint,
    };
  }

  /**
   * 6. SYSTEM API USAGE LOGS - Paginated with filters
   */
  async getSystemUsageLogs(query: AdminLogQueryDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.userId) where.userId = query.userId;
    if (query.providerId) where.providerId = query.providerId;
    if (query.requestType) where.requestType = query.requestType;
    if (query.status) where.status = query.status;
    if (query.endpoint)
      where.endpoint = { contains: query.endpoint, mode: 'insensitive' };

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [total, items] = await Promise.all([
      this.prisma.apiUsageLog.count({ where }),
      this.prisma.apiUsageLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
          provider: {
            select: { id: true, name: true, providerType: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 7. SYSTEM HEALTH - Database, Redis, and Providers status
   */
  async getSystemHealth() {
    let databaseStatus = 'DOWN';
    let redisStatus = 'DOWN';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      databaseStatus = 'UP';
    } catch (e) {
      databaseStatus = 'DOWN';
    }

    try {
      const pong = await this.redisService.getClient().ping();
      redisStatus = pong === 'PONG' ? 'UP' : 'DOWN';
    } catch (e) {
      redisStatus = 'DOWN';
    }

    const [totalProviders, activeProviders] = await Promise.all([
      this.prisma.aIProvider.count(),
      this.prisma.aIProvider.count({ where: { isActive: true } }),
    ]);

    const overallStatus =
      databaseStatus === 'UP' && redisStatus === 'UP' ? 'HEALTHY' : 'DEGRADED';

    return {
      status: overallStatus,
      database: databaseStatus,
      redis: redisStatus,
      providers: {
        total: totalProviders,
        active: activeProviders,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

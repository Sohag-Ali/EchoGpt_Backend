import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardMetrics(currentUser: any) {
    const totalUsers = await this.prisma.user.count();
    const activeSubscriptions = await this.prisma.subscription.count({
      where: { status: 'ACTIVE' },
    });

    return {
      systemStatus: 'operational',
      totalUsers,
      activeSubscriptions,
      authenticatedUser: currentUser,
    };
  }

  async getSystemUsageLogs(page = 1, limit = 20) {
    const pageNum = Number(page) || 1;
    const limitNum = Math.min(Number(limit) || 20, 100);
    const skip = (pageNum - 1) * limitNum;

    const [total, items] = await Promise.all([
      this.prisma.apiUsageLog.count(),
      this.prisma.apiUsageLog.findMany({
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
        take: limitNum,
      }),
    ]);

    return {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }
}


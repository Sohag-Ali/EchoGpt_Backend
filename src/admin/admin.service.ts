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
}

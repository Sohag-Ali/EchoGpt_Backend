import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';

export interface UsageCheckResult {
  allowed: boolean;
  plan: SubscriptionPlan;
  monthlyLimit: number;
  usedRequests: number;
  remainingRequests: number;
  reason?: string;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
  ) {}

  /**
   * Internal helper to fetch user subscription and automatically handle monthly period resets
   * and scheduled downgrades.
   */
  async getOrResetSubscription(userId: string) {
    let subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription record not found for this user.');
    }

    const now = new Date();
    // Monthly Reset Handling: If current period has expired, reset usage & set new period dates
    if (now > subscription.currentPeriodEnd) {
      const nextPeriodStart = now;
      const nextPeriodEnd = new Date(now);
      nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

      // Check if a downgrade to FREE was scheduled for period end
      const isScheduledDowngrade =
        subscription.cancelAtPeriodEnd ||
        subscription.scheduledPlan === SubscriptionPlan.FREE;

      const updateData: any = {
        usedRequests: 0,
        currentPeriodStart: nextPeriodStart,
        currentPeriodEnd: nextPeriodEnd,
      };

      if (isScheduledDowngrade) {
        updateData.plan = SubscriptionPlan.FREE;
        updateData.monthlyLimit = 50;
        updateData.cancelAtPeriodEnd = false;
        updateData.scheduledPlan = null;
        updateData.canceledAt = now;
        this.logger.log(
          `Scheduled downgrade executed for user [${userId}]. Plan transitioned to FREE (Limit: 50).`,
        );
      }

      subscription = await this.prisma.subscription.update({
        where: { userId },
        data: updateData,
      });

      this.logger.log(
        `Subscription period auto-reset for user [${userId}]. Used requests reset to 0.`,
      );
    }

    return subscription;
  }

  /**
   * Reusable method: Checks subscription usage limit without modifying state.
   */
  async checkUsageLimit(userId: string): Promise<UsageCheckResult> {
    const subscription = await this.getOrResetSubscription(userId);

    const remainingRequests = Math.max(
      0,
      subscription.monthlyLimit - subscription.usedRequests,
    );

    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      return {
        allowed: false,
        plan: subscription.plan,
        monthlyLimit: subscription.monthlyLimit,
        usedRequests: subscription.usedRequests,
        remainingRequests: 0,
        reason: 'Subscription status is inactive.',
      };
    }

    if (subscription.usedRequests >= subscription.monthlyLimit) {
      return {
        allowed: false,
        plan: subscription.plan,
        monthlyLimit: subscription.monthlyLimit,
        usedRequests: subscription.usedRequests,
        remainingRequests: 0,
        reason: 'Monthly AI request limit reached.',
      };
    }

    return {
      allowed: true,
      plan: subscription.plan,
      monthlyLimit: subscription.monthlyLimit,
      usedRequests: subscription.usedRequests,
      remainingRequests,
    };
  }

  /**
   * Reusable method: Enforces subscription usage limit.
   */
  async enforceUsageLimit(userId: string): Promise<UsageCheckResult> {
    const usageCheck = await this.checkUsageLimit(userId);

    if (!usageCheck.allowed) {
      throw new ForbiddenException({
        statusCode: 403,
        message:
          usageCheck.reason ||
          'Monthly subscription limit reached. Please upgrade to PREMIUM.',
        data: usageCheck,
      });
    }

    return usageCheck;
  }

  /**
   * Reusable method: Increment usage atomically after a successful AI execution.
   */
  async incrementUsage(userId: string, count: number = 1) {
    if (count <= 0) return;

    const updatedSubscription = await this.prisma.subscription.update({
      where: { userId },
      data: {
        usedRequests: {
          increment: count,
        },
      },
    });

    const remainingRequests = Math.max(
      0,
      updatedSubscription.monthlyLimit - updatedSubscription.usedRequests,
    );

    this.logger.log(
      `Incremented usage for user [${userId}] by ${count}. Used: ${updatedSubscription.usedRequests}/${updatedSubscription.monthlyLimit}`,
    );

    return {
      success: true,
      monthlyLimit: updatedSubscription.monthlyLimit,
      usedRequests: updatedSubscription.usedRequests,
      remainingRequests,
    };
  }

  /**
   * 1. GET /api/v1/subscriptions/me - Get current user subscription details
   */
  async getMySubscription(userId: string) {
    const subscription = await this.getOrResetSubscription(userId);

    const remainingRequests = Math.max(
      0,
      subscription.monthlyLimit - subscription.usedRequests,
    );

    return {
      success: true,
      message: 'Subscription fetched successfully',
      data: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        monthlyLimit: subscription.monthlyLimit,
        usedRequests: subscription.usedRequests,
        remainingRequests,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        scheduledPlan: subscription.scheduledPlan,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        canceledAt: subscription.canceledAt,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
      },
    };
  }

  /**
   * 2. GET /api/v1/subscriptions/usage - Get current subscription usage metrics
   */
  async getSubscriptionUsage(userId: string) {
    const subscription = await this.getOrResetSubscription(userId);

    const remainingRequests = Math.max(
      0,
      subscription.monthlyLimit - subscription.usedRequests,
    );

    return {
      success: true,
      message: 'Subscription usage retrieved successfully',
      data: {
        plan: subscription.plan,
        status: subscription.status,
        monthlyLimit: subscription.monthlyLimit,
        usedRequests: subscription.usedRequests,
        remainingRequests,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        scheduledPlan: subscription.scheduledPlan,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    };
  }

  /**
   * 3. POST /api/v1/subscriptions/upgrade - Initiate subscription upgrade via bKash
   */
  async upgradeSubscription(userId: string) {
    return this.paymentsService.initiateUpgradePayment(userId);
  }

  /**
   * 4. POST /api/v1/subscriptions/downgrade - Schedule subscription downgrade to FREE at period end
   */
  async downgradeSubscription(userId: string) {
    const subscription = await this.getOrResetSubscription(userId);

    if (subscription.plan === SubscriptionPlan.FREE) {
      throw new BadRequestException('User is already on the FREE plan.');
    }

    if (
      subscription.cancelAtPeriodEnd &&
      subscription.scheduledPlan === SubscriptionPlan.FREE
    ) {
      return {
        success: true,
        message:
          'Subscription downgrade to FREE is already scheduled for the end of the current period.',
        data: {
          currentPlan: subscription.plan,
          scheduledPlan: SubscriptionPlan.FREE,
          cancelAtPeriodEnd: true,
          effectiveDate: subscription.currentPeriodEnd,
          monthlyLimit: subscription.monthlyLimit,
          usedRequests: subscription.usedRequests,
        },
      };
    }

    // Schedule downgrade at the end of current period (preserving current PREMIUM access)
    const updatedSubscription = await this.prisma.subscription.update({
      where: { userId },
      data: {
        cancelAtPeriodEnd: true,
        scheduledPlan: SubscriptionPlan.FREE,
        canceledAt: new Date(),
      },
    });

    const remainingRequests = Math.max(
      0,
      updatedSubscription.monthlyLimit - updatedSubscription.usedRequests,
    );

    this.logger.log(
      `User [${userId}] scheduled subscription downgrade to FREE for period end: ${updatedSubscription.currentPeriodEnd.toISOString()}`,
    );

    return {
      success: true,
      message:
        'Subscription downgrade scheduled successfully. PREMIUM plan features will remain active until the current period ends.',
      data: {
        currentPlan: updatedSubscription.plan,
        scheduledPlan: SubscriptionPlan.FREE,
        cancelAtPeriodEnd: updatedSubscription.cancelAtPeriodEnd,
        effectiveDate: updatedSubscription.currentPeriodEnd,
        monthlyLimit: updatedSubscription.monthlyLimit,
        usedRequests: updatedSubscription.usedRequests,
        remainingRequests,
      },
    };
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentProvider,
  PaymentStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BkashService } from './bkash.service';
import { ExecutePaymentDto } from './dto/execute-payment.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly bkashService: BkashService,
  ) {}

  /**
   * Helper to resolve and normalize the bKash callback URL.
   * Guarantees no trailing slashes and ensures full path /api/v1/payments/bkash/callback.
   */
  private getCallbackUrl(): string {
    let rawUrl = this.configService
      .get<string>(
        'bkash.callbackUrl',
        'http://localhost:5000/api/v1/payments/bkash/callback',
      )
      .trim();

    // Strip trailing slashes
    rawUrl = rawUrl.replace(/\/+$/, '');

    // If callbackUrl ends at /api/v1, complete the path
    if (rawUrl.endsWith('/api/v1')) {
      rawUrl = `${rawUrl}/payments/bkash/callback`;
    } else if (!rawUrl.includes('/payments/bkash/callback')) {
      rawUrl = `${rawUrl}/api/v1/payments/bkash/callback`.replace(
        /\/api\/v1\/api\/v1\//,
        '/api/v1/',
      );
    }

    return rawUrl;
  }

  /**
   * 1. Initiate bKash Subscription Upgrade Payment
   */
  async initiateUpgradePayment(userId: string) {
    // 1. Verify user subscription status
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      throw new NotFoundException(
        'Subscription record not found for this user.',
      );
    }

    if (
      subscription.plan === SubscriptionPlan.PREMIUM &&
      subscription.status === SubscriptionStatus.ACTIVE
    ) {
      throw new ConflictException('User is already on the PREMIUM plan.');
    }

    const premiumPrice = this.configService.get<number>(
      'bkash.premiumPrice',
      500,
    );
    const callbackUrl = this.getCallbackUrl();

    const invoiceId = `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 2. Create PENDING Payment record in PostgreSQL
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        subscriptionId: subscription.id,
        provider: PaymentProvider.BKASH,
        amount: premiumPrice,
        currency: 'BDT',
        status: PaymentStatus.PENDING,
        invoiceId,
      },
    });

    try {
      // 3. Create payment checkout via official bKash API
      const bkashRes = await this.bkashService.createPayment({
        amount: payment.amount,
        invoiceNumber: invoiceId,
        callbackUrl,
      });

      // 4. Update Payment record with providerPaymentId (paymentID)
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: bkashRes.paymentID,
        },
      });

      this.logger.log(
        `Initiated bKash upgrade payment for user [${userId}], InternalID: ${payment.id}, bKashID: ${bkashRes.paymentID}, Callback: ${callbackUrl}`,
      );

      return {
        success: true,
        message: 'bKash checkout URL created successfully.',
        data: {
          paymentId: payment.id,
          providerPaymentId: bkashRes.paymentID,
          bkashURL: bkashRes.bkashURL,
          amount: payment.amount,
          currency: payment.currency,
        },
      };
    } catch (error: any) {
      // Mark payment as FAILED if bKash creation fails
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      throw error;
    }
  }

  /**
   * 2. Verify & Execute bKash Payment Server-Side (Server-to-Server Verification)
   */
  async executePayment(userId: string, dto: ExecutePaymentDto) {
    const { paymentID } = dto;

    // 1. Find payment record by providerPaymentId
    const payment = await this.prisma.payment.findFirst({
      where: { providerPaymentId: paymentID },
    });

    if (!payment) {
      throw new NotFoundException(
        `Payment record for bKash PaymentID [${paymentID}] not found.`,
      );
    }

    // 2. Ownership Security Check: Validate payment belongs to current authenticated user
    if (payment.userId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to confirm this payment.',
      );
    }

    // 3. Idempotency Check: Prevent duplicate upgrades
    if (payment.status === PaymentStatus.COMPLETED) {
      this.logger.log(
        `Payment [${payment.id}] is already COMPLETED. Returning existing status.`,
      );
      return {
        success: true,
        message: 'Payment already completed.',
        data: payment,
      };
    }

    try {
      // 4. Server-Side Execution & Verification with bKash Gateway
      const bkashRes = await this.bkashService.executePayment(paymentID);

      const isSuccessful =
        bkashRes.statusCode === '0000' ||
        bkashRes.transactionStatus === 'Completed' ||
        bkashRes.statusCode === '2058';

      if (!isSuccessful) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.FAILED },
        });
        throw new BadRequestException(
          `bKash Payment failed: ${bkashRes.statusMessage}`,
        );
      }

      // 5. Calculate new 1-month period
      const currentPeriodStart = new Date();
      const currentPeriodEnd = new Date();
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

      // 6. Atomic Prisma Transaction: Update Payment to COMPLETED & Upgrade Subscription to PREMIUM
      await this.prisma.$transaction(async (tx) => {
        // Update Payment Status to COMPLETED
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.COMPLETED,
            transactionId: bkashRes.trxID,
          },
        });

        // Upgrade User Subscription to PREMIUM with 1000 limit and clear scheduled cancellations
        await tx.subscription.upsert({
          where: { userId },
          create: {
            userId,
            plan: SubscriptionPlan.PREMIUM,
            status: SubscriptionStatus.ACTIVE,
            monthlyLimit: 1000,
            usedRequests: 0,
            cancelAtPeriodEnd: false,
            scheduledPlan: null,
            canceledAt: null,
            currentPeriodStart,
            currentPeriodEnd,
          },
          update: {
            plan: SubscriptionPlan.PREMIUM,
            status: SubscriptionStatus.ACTIVE,
            monthlyLimit: 1000,
            cancelAtPeriodEnd: false,
            scheduledPlan: null,
            canceledAt: null,
            currentPeriodStart,
            currentPeriodEnd,
          },
        });
      });

      this.logger.log(
        `Payment [${payment.id}] verified successfully. User [${userId}] upgraded to PREMIUM (Limit: 1000). TrxID: ${bkashRes.trxID}`,
      );

      return {
        success: true,
        message:
          'Payment verified and executed successfully. Subscription upgraded to PREMIUM!',
        data: {
          paymentId: payment.id,
          transactionId: bkashRes.trxID,
          plan: SubscriptionPlan.PREMIUM,
          monthlyLimit: 1000,
          currentPeriodStart,
          currentPeriodEnd,
        },
      };
    } catch (error: any) {
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      // Update payment status to FAILED on error
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      this.logger.error(
        `Error executing payment [${payment.id}]: ${error.message}`,
      );
      throw new BadRequestException(
        'Payment confirmation failed. Please contact support.',
      );
    }
  }

  /**
   * 3. Handle bKash Redirect Callback (Web Checkout Callback)
   */
  async handleBkashCallback(paymentID: string, status: string) {
    const cleanPaymentId = (paymentID || '').replace(/\/+$/, '').trim();
    const cleanStatus = (status || '').replace(/\/+$/, '').trim().toLowerCase();

    this.logger.log(
      `Received bKash callback redirect: PaymentID=${cleanPaymentId}, Status=${cleanStatus}`,
    );

    const payment = await this.prisma.payment.findFirst({
      where: { providerPaymentId: cleanPaymentId },
    });

    if (!payment) {
      this.logger.warn(
        `bKash callback failed: Payment record not found for PaymentID [${cleanPaymentId}]`,
      );
      throw new NotFoundException('Payment record not found.');
    }

    if (cleanStatus === 'cancel') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.CANCELLED },
      });
      this.logger.log(
        `Payment [${payment.id}] marked CANCELLED via bKash callback.`,
      );
      return {
        success: false,
        message: 'Payment was cancelled by user. Subscription remains FREE.',
        data: {
          paymentId: payment.id,
          status: PaymentStatus.CANCELLED,
        },
      };
    }

    if (cleanStatus === 'failure') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      this.logger.log(
        `Payment [${payment.id}] marked FAILED via bKash callback.`,
      );
      return {
        success: false,
        message: 'Payment failed with bKash. Subscription remains FREE.',
        data: {
          paymentId: payment.id,
          status: PaymentStatus.FAILED,
        },
      };
    }

    if (cleanStatus === 'success') {
      this.logger.log(
        `bKash callback status SUCCESS for PaymentID [${cleanPaymentId}]. Proceeding to server-side execution.`,
      );
      // Server-side verification & subscription upgrade
      return this.executePayment(payment.userId, { paymentID: cleanPaymentId });
    }

    this.logger.warn(
      `Unknown bKash callback status [${cleanStatus}] for PaymentID [${cleanPaymentId}]`,
    );
    return {
      success: false,
      message: `Unknown payment status: ${cleanStatus}`,
    };
  }

  /**
   * 4. Get Current User's Payment History
   */
  async getMyPayments(userId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        currency: true,
        provider: true,
        status: true,
        transactionId: true,
        invoiceId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      message: 'User payment history retrieved successfully.',
      data: payments,
    };
  }
}

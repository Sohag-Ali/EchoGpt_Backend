import { Injectable, Logger } from '@nestjs/common';
import { ApiRequestType, ApiUsageStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateUsageLogOptions {
  userId: string;
  providerId?: string | null;
  endpoint: string;
  requestType: ApiRequestType;
  modelName?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  responseTimeMs?: number | null;
  status?: ApiUsageStatus;
}

@Injectable()
export class UsageLogsService {
  private readonly logger = new Logger(UsageLogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Centralized method to record API usage audit logs.
   * Safe transaction / failure handling: Never throws or breaks primary API responses if logging fails.
   */
  async createLog(options: CreateUsageLogOptions) {
    try {
      const promptTokens = options.promptTokens ?? 0;
      const completionTokens = options.completionTokens ?? 0;
      const totalTokens =
        options.totalTokens ?? promptTokens + completionTokens;

      const log = await this.prisma.apiUsageLog.create({
        data: {
          userId: options.userId,
          providerId: options.providerId || null,
          endpoint: options.endpoint,
          requestType: options.requestType,
          modelName: options.modelName || 'default',
          promptTokens,
          completionTokens,
          totalTokens,
          estimatedCost: options.estimatedCost ?? 0.0,
          latencyMs: options.responseTimeMs ?? null,
          status: options.status || ApiUsageStatus.SUCCESS,
        },
      });

      this.logger.debug(
        `[UsageLog] Logged ${options.requestType} for user [${options.userId}] on [${options.endpoint}] - Status: ${options.status || ApiUsageStatus.SUCCESS}, Tokens: ${totalTokens}, Time: ${options.responseTimeMs ?? 0}ms`,
      );

      return log;
    } catch (error: any) {
      this.logger.error(
        `[UsageLog] Failed to persist API usage log for user [${options.userId}]: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }
}

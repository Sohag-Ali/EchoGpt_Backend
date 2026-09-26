import { Response } from 'express';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApiRequestType, ApiUsageStatus, MessageRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AIProviderFactory } from '../providers/factory/ai-provider.factory';
import { UsageLogsService } from '../usage-logs/usage-logs.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { GetChatsQueryDto } from './dto/get-chats-query.dto';

@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly aiProviderFactory: AIProviderFactory,
    private readonly usageLogsService: UsageLogsService,
  ) {}

  /**
   * 1. POST /api/v1/chats - Create Chat & Generate AI Response
   */
  async createChat(userId: string, dto: CreateChatDto) {
    const userPrompt = (dto.prompt || dto.message || '').trim();

    if (!userPrompt) {
      throw new BadRequestException('Prompt is required and cannot be empty.');
    }

    // STEP 1: Pre-Execution Gate - Enforce Subscription Usage Limit
    await this.subscriptionsService.enforceUsageLimit(userId);

    const startTime = Date.now();
    let aiResponse: any;
    let providerConfig: any;

    try {
      // STEP 2: Execute AI Request via Provider Factory Abstraction
      aiResponse = await this.aiProviderFactory.generateResponse(
        userPrompt,
        dto.provider,
        {
          systemPrompt: dto.systemPrompt,
        },
      );

      providerConfig = await this.aiProviderFactory.getProviderConfig(
        dto.provider,
      );
    } catch (error: any) {
      const responseTimeMs = Date.now() - startTime;
      await this.usageLogsService.createLog({
        userId,
        endpoint: '/api/v1/chats',
        requestType: ApiRequestType.CHAT,
        status: ApiUsageStatus.FAILED,
        responseTimeMs,
      });
      throw error;
    }

    // STEP 3: Post-Execution - Increment Usage & Save History
    const usageResult = await this.subscriptionsService.incrementUsage(
      userId,
      1,
    );

    const chatTitle =
      dto.title ||
      (userPrompt.length > 30 ? userPrompt.substring(0, 30) + '...' : userPrompt);

    const chat = await this.prisma.$transaction(
      async (tx) => {
        const newChat = await tx.chat.create({
          data: {
            userId,
            title: chatTitle,
            providerId: providerConfig.id,
            systemPrompt: dto.systemPrompt || null,
            messages: {
              create: [
                {
                  role: MessageRole.USER,
                  content: userPrompt,
                  promptTokens: aiResponse.inputTokens,
                  totalTokens: aiResponse.inputTokens,
                },
                {
                  role: MessageRole.ASSISTANT,
                  content: aiResponse.content,
                  completionTokens: aiResponse.outputTokens,
                  totalTokens: aiResponse.outputTokens,
                  latencyMs: aiResponse.responseTimeMs,
                },
              ],
            },
          },
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });

        return newChat;
      },
      { timeout: 15000 },
    );

    // STEP 4: Centralized API Usage Audit Logging
    const costPer1k = providerConfig.costPer1kInput || 0.002;
    const estimatedCost = (aiResponse.totalTokens / 1000) * costPer1k;

    await this.usageLogsService.createLog({
      userId,
      providerId: providerConfig.id,
      endpoint: '/api/v1/chats',
      requestType: ApiRequestType.CHAT,
      modelName: aiResponse.model || providerConfig.modelName || 'default',
      promptTokens: aiResponse.inputTokens,
      completionTokens: aiResponse.outputTokens,
      totalTokens: aiResponse.totalTokens,
      estimatedCost,
      responseTimeMs: aiResponse.responseTimeMs,
      status: ApiUsageStatus.SUCCESS,
    });

    this.logger.log(
      `Chat [${chat.id}] created for user [${userId}] via [${aiResponse.provider}] (${aiResponse.model}). Remaining requests: ${usageResult?.remainingRequests}`,
    );

    return {
      success: true,
      message: 'Chat response generated successfully',
      data: {
        id: chat.id,
        prompt: userPrompt,
        response: aiResponse.content,
        provider: aiResponse.provider,
        model: aiResponse.model,
        usage: {
          inputTokens: aiResponse.inputTokens,
          outputTokens: aiResponse.outputTokens,
          totalTokens: aiResponse.totalTokens,
          responseTimeMs: aiResponse.responseTimeMs,
          remainingRequests: usageResult?.remainingRequests ?? 0,
        },
        createdAt: chat.createdAt,
      },
    };
  }

  /**
   * 1b. POST /api/v1/chats/stream - Create Chat & Stream AI Response (SSE)
   */
  async createChatStream(userId: string, dto: CreateChatDto, res: Response) {
    const userPrompt = (dto.prompt || dto.message || '').trim();

    if (!userPrompt) {
      throw new BadRequestException('Prompt is required and cannot be empty.');
    }

    await this.subscriptionsService.enforceUsageLimit(userId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const startTime = Date.now();
    let fullResponse = '';
    let lastInputTokens = 0;
    let lastOutputTokens = 0;
    let lastTotalTokens = 0;
    let usedModel = 'gemini-3.8-flash';
    let providerConfig: any = null;

    try {
      providerConfig = await this.aiProviderFactory.getProviderConfig(
        dto.provider,
      );
      usedModel = providerConfig.modelName;

      const stream = this.aiProviderFactory.streamResponse(
        userPrompt,
        dto.provider,
        {
          systemPrompt: dto.systemPrompt,
        },
      );

      for await (const chunk of stream) {
        if (chunk.content) {
          fullResponse += chunk.content;
          res.write(
            `data: ${JSON.stringify({
              content: chunk.content,
              provider: chunk.provider,
              model: chunk.model,
            })}\n\n`,
          );
        }
        if (chunk.model) usedModel = chunk.model;
        if (chunk.inputTokens) lastInputTokens = chunk.inputTokens;
        if (chunk.outputTokens) lastOutputTokens = chunk.outputTokens;
        if (chunk.totalTokens) lastTotalTokens = chunk.totalTokens;
      }

      if (fullResponse && providerConfig) {
        const usageResult = await this.subscriptionsService.incrementUsage(
          userId,
          1,
        );

        const responseTimeMs = Date.now() - startTime;
        const chatTitle =
          dto.title ||
          (userPrompt.length > 30
            ? userPrompt.substring(0, 30) + '...'
            : userPrompt);

        await this.prisma.$transaction(
          async (tx) => {
            const newChat = await tx.chat.create({
              data: {
                userId,
                title: chatTitle,
                providerId: providerConfig.id,
                systemPrompt: dto.systemPrompt || null,
                messages: {
                  create: [
                    {
                      role: MessageRole.USER,
                      content: userPrompt,
                      promptTokens: lastInputTokens,
                      totalTokens: lastInputTokens,
                    },
                    {
                      role: MessageRole.ASSISTANT,
                      content: fullResponse,
                      completionTokens: lastOutputTokens,
                      totalTokens: lastOutputTokens,
                      latencyMs: responseTimeMs,
                    },
                  ],
                },
              },
            });

            return newChat;
          },
          { timeout: 15000 },
        );

        const costPer1k = providerConfig.costPer1kInput || 0.002;
        const estimatedCost = (lastTotalTokens / 1000) * costPer1k;

        // Exactly ONE API usage log after stream finishes
        await this.usageLogsService.createLog({
          userId,
          providerId: providerConfig.id,
          endpoint: '/api/v1/chats/stream',
          requestType: ApiRequestType.CHAT_STREAM,
          modelName: usedModel || providerConfig.modelName || 'default',
          promptTokens: lastInputTokens,
          completionTokens: lastOutputTokens,
          totalTokens: lastTotalTokens,
          estimatedCost,
          responseTimeMs,
          status: ApiUsageStatus.SUCCESS,
        });

        this.logger.log(
          `Stream chat completed for user [${userId}] via [${providerConfig.providerType}] (${usedModel}). Remaining requests: ${usageResult?.remainingRequests}`,
        );
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error: any) {
      const responseTimeMs = Date.now() - startTime;
      await this.usageLogsService.createLog({
        userId,
        providerId: providerConfig?.id || null,
        endpoint: '/api/v1/chats/stream',
        requestType: ApiRequestType.CHAT_STREAM,
        status: ApiUsageStatus.FAILED,
        responseTimeMs,
      });

      this.logger.error(
        `Error during streaming AI response for user [${userId}]: ${error.message}`,
      );
      if (!res.headersSent) {
        throw error;
      } else {
        res.write(
          `data: ${JSON.stringify({
            error: error.message || 'Failed to generate AI response.',
          })}\n\n`,
        );
        res.end();
        return;
      }
    }
  }

  /**
   * 2. GET /api/v1/chats - Get current user chat history with pagination
   */
  async getUserConversations(userId: string, query: GetChatsQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [total, chats] = await Promise.all([
      this.prisma.chat.count({
        where: { userId },
      }),
      this.prisma.chat.findMany({
        where: { userId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
          provider: {
            select: {
              id: true,
              name: true,
              providerType: true,
              modelName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      success: true,
      message: 'User chat history retrieved successfully',
      data: chats,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 3. GET /api/v1/chats/:id - Get specific chat by ID (Owner authorization enforced)
   */
  async getChatById(userId: string, id: string) {
    const chat = await this.prisma.chat.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        provider: {
          select: {
            id: true,
            name: true,
            providerType: true,
            modelName: true,
          },
        },
      },
    });

    if (!chat) {
      throw new NotFoundException(`Chat with ID [${id}] not found.`);
    }

    if (chat.userId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to access another user’s chat history.',
      );
    }

    return {
      success: true,
      message: 'Chat details retrieved successfully',
      data: chat,
    };
  }

  /**
   * 4. DELETE /api/v1/chats/:id - Delete chat by ID (Owner authorization enforced)
   */
  async deleteChat(userId: string, id: string) {
    const chat = await this.prisma.chat.findUnique({
      where: { id },
    });

    if (!chat) {
      throw new NotFoundException(`Chat with ID [${id}] not found.`);
    }

    if (chat.userId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to delete another user’s chat history.',
      );
    }

    await this.prisma.chat.delete({
      where: { id },
    });

    this.logger.log(`Chat [${id}] deleted by user [${userId}].`);

    return {
      success: true,
      message: 'Chat deleted successfully',
    };
  }
}

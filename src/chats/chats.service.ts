import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MessageRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AIProviderFactory } from '../providers/factory/ai-provider.factory';
import { CreateChatDto } from './dto/create-chat.dto';
import { GetChatsQueryDto } from './dto/get-chats-query.dto';

@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly aiProviderFactory: AIProviderFactory,
  ) {}

  /**
   * 1. POST /api/v1/chats - Create Chat & Generate AI Response
   * Flow:
   * 1. Validate prompt
   * 2. Check subscription usage limit (Pre-execution gate)
   * 3. Call AI Provider via AIProviderFactory abstraction
   * 4. Save Chat & Messages history
   * 5. Increment usage
   * 6. Create API usage log
   */
  async createChat(userId: string, dto: CreateChatDto) {
    const userPrompt = (dto.prompt || dto.message || '').trim();

    if (!userPrompt) {
      throw new BadRequestException('Prompt is required and cannot be empty.');
    }

    // =========================================================================
    // STEP 1: Pre-Execution Gate - Enforce Subscription Usage Limit
    // =========================================================================
    await this.subscriptionsService.enforceUsageLimit(userId);

    // =========================================================================
    // STEP 2: Execute AI Request via Provider Factory Abstraction
    // (Resolves provider configuration, checks isActive, decrypts key, calls engine)
    // =========================================================================
    const aiResponse = await this.aiProviderFactory.generateResponse(
      userPrompt,
      dto.provider,
      {
        systemPrompt: dto.systemPrompt,
      },
    );

    // Resolve Provider DB Config for relations
    const providerConfig = await this.aiProviderFactory.getProviderConfig(
      dto.provider,
    );

    // =========================================================================
    // STEP 3: Post-Execution - Increment Subscription Usage & Save History
    // =========================================================================
    const usageResult = await this.subscriptionsService.incrementUsage(
      userId,
      1,
    );

    const chatTitle = dto.title || (userPrompt.length > 30 ? userPrompt.substring(0, 30) + '...' : userPrompt);

    const chat = await this.prisma.$transaction(async (tx) => {
      // 1. Persist Chat conversation thread and user/assistant messages
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

      // 2. Persist API usage audit log
      const costPer1k = providerConfig.costPer1kInput || 0.002;
      const estimatedCost = (aiResponse.totalTokens / 1000) * costPer1k;

      await tx.apiUsageLog.create({
        data: {
          userId,
          providerId: providerConfig.id,
          modelName: aiResponse.model || providerConfig.modelName || 'default',
          promptTokens: aiResponse.inputTokens,
          completionTokens: aiResponse.outputTokens,
          totalTokens: aiResponse.totalTokens,
          estimatedCost,
          endpoint: '/api/v1/chats',
          latencyMs: aiResponse.responseTimeMs,
        },
      });

      return newChat;
    }, { timeout: 15000 });

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

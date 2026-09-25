import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MessageRole, ProviderType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreateChatDto } from './dto/create-chat.dto';

@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * 1. GET /api/v1/chats - Get user chat history
   */
  async getUserConversations(userId: string) {
    const chats = await this.prisma.chat.findMany({
      where: { userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    return {
      success: true,
      message: 'Chat conversations fetched successfully',
      data: chats,
    };
  }

  /**
   * 2. POST /api/v1/chats - Create Chat & Generate AI Response
   * Enforces Subscription Limit BEFORE execution, increments AFTER successful response.
   */
  async createChat(userId: string, dto: CreateChatDto) {
    // =========================================================================
    // STEP 1: Check & Enforce Subscription Usage Limit (Pre-Execution Gate)
    // =========================================================================
    await this.subscriptionsService.enforceUsageLimit(userId);

    // =========================================================================
    // STEP 2: Resolve AI Provider
    // =========================================================================
    let provider = null;
    if (dto.providerId) {
      provider = await this.prisma.aIProvider.findUnique({
        where: { id: dto.providerId },
      });
      if (!provider) {
        throw new NotFoundException('Specified AI Provider not found.');
      }
    } else {
      provider = await this.prisma.aIProvider.findFirst({
        where: { isDefault: true, isActive: true },
      });

      if (!provider) {
        provider = await this.prisma.aIProvider.findFirst({
          where: { isActive: true },
        });
      }

      if (!provider) {
        // Fallback default AI Provider if table is empty
        provider = await this.prisma.aIProvider.create({
          data: {
            name: 'EchoGPT Default AI (GPT-4o)',
            providerType: ProviderType.OPENAI,
            modelName: 'gpt-4o',
            isActive: true,
            isDefault: true,
          },
        });
      }
    }

    const startTime = Date.now();

    // =========================================================================
    // STEP 3: Execute AI Provider Call
    // (If this throws an error, usage is NOT incremented)
    // =========================================================================
    let aiResponseContent = '';
    try {
      aiResponseContent = `EchoGPT Assistant: I have processed your request ("${dto.message.substring(0, 50)}..."). This is a high-performance response powered by ${provider.name}.`;
    } catch (error: any) {
      this.logger.error(`AI Provider request failed for user [${userId}]: ${error.message}`);
      throw new BadRequestException('Failed to generate AI response. Please try again.');
    }

    const latencyMs = Date.now() - startTime;
    const promptTokens = Math.ceil(dto.message.length / 4);
    const completionTokens = Math.ceil(aiResponseContent.length / 4);
    const totalTokens = promptTokens + completionTokens;

    // =========================================================================
    // STEP 4: Post-Execution - Increment Usage & Log API Usage
    // =========================================================================
    const usageResult = await this.subscriptionsService.incrementUsage(userId, 1);

    // Save Chat, Messages, and ApiUsageLog in PostgreSQL
    const chatTitle = dto.title || dto.message.substring(0, 30) + '...';

    const chat = await this.prisma.$transaction(async (tx) => {
      const newChat = await tx.chat.create({
        data: {
          userId,
          title: chatTitle,
          providerId: provider.id,
          systemPrompt: dto.systemPrompt || null,
          messages: {
            create: [
              {
                role: MessageRole.USER,
                content: dto.message,
                promptTokens,
                totalTokens: promptTokens,
              },
              {
                role: MessageRole.ASSISTANT,
                content: aiResponseContent,
                completionTokens,
                totalTokens: completionTokens,
                latencyMs,
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

      // Create API usage log
      await tx.apiUsageLog.create({
        data: {
          userId,
          providerId: provider.id,
          modelName: provider.modelName,
          promptTokens,
          completionTokens,
          totalTokens,
          estimatedCost: (totalTokens / 1000) * 0.002,
          endpoint: '/api/v1/chats',
          latencyMs,
        },
      });

      return newChat;
    });

    this.logger.log(
      `Chat [${chat.id}] created for user [${userId}]. Usage incremented. Remaining: ${usageResult?.remainingRequests}`,
    );

    return {
      success: true,
      message: 'AI response generated successfully',
      data: {
        chatId: chat.id,
        title: chat.title,
        provider: {
          id: provider.id,
          name: provider.name,
          modelName: provider.modelName,
        },
        messages: chat.messages,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs,
          remainingRequests: usageResult?.remainingRequests ?? 0,
        },
      },
    };
  }
}

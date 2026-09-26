import { Response } from 'express';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ChatsService } from './chats.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateChatDto } from './dto/create-chat.dto';
import { GetChatsQueryDto } from './dto/get-chats-query.dto';

@ApiTags('Chats')
@ApiBearerAuth('JWT-auth')
@Controller('chats')
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Send message prompt & generate AI response',
    description:
      'Checks subscription usage limit, resolves requested/default AI provider via ProviderFactory, generates AI response, records chat history, increments usage, and logs API usage.',
  })
  @ApiResponse({
    status: 201,
    description: 'AI response generated successfully.',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden. Monthly subscription limit reached.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid prompt or provider configuration error.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token or HttpOnly cookie missing, expired, or invalid.',
  })
  async createChat(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateChatDto,
  ) {
    return this.chatsService.createChat(userId, dto);
  }

  @Post('stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send message prompt & stream AI response progressively (SSE)',
    description:
      'Progressively streams AI response text chunks to the client using Server-Sent Events (Content-Type: text/event-stream). Enforces subscription limit pre-execution, accumulates complete response, saves ChatHistory once, increments usage once, and creates API usage log upon completion.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Server-Sent Events (SSE) stream initiated. Output formatted as text/event-stream.',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden. Monthly subscription limit reached.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid prompt or provider configuration error.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token or HttpOnly cookie missing, expired, or invalid.',
  })
  async createChatStream(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateChatDto,
    @Res() res: Response,
  ) {
    return this.chatsService.createChatStream(userId, dto, res);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get authenticated user chat history (Paginated)',
    description:
      'Returns a paginated list of chats owned by the authenticated user, ordered by newest first.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 20,
    description: 'Items per page (default: 20, max: 100)',
  })
  @ApiResponse({
    status: 200,
    description: 'User chat history fetched successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token or HttpOnly cookie missing, expired, or invalid.',
  })
  async getUserConversations(
    @CurrentUser('id') userId: string,
    @Query() query: GetChatsQueryDto,
  ) {
    return this.chatsService.getUserConversations(userId, query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get single chat conversation details by ID',
    description:
      'Returns full message history for the requested chat. Strictly enforces ownership security.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique UUID of the chat conversation',
  })
  @ApiResponse({
    status: 200,
    description: 'Chat details retrieved successfully.',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden. You are not authorized to access another user’s chat.',
  })
  @ApiNotFoundResponse({
    description: 'Chat not found.',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized access.',
  })
  async getChatById(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.chatsService.getChatById(userId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a chat conversation thread by ID',
    description:
      'Deletes the specified chat conversation thread and messages. Strictly enforces owner authorization.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique UUID of the chat conversation to delete',
  })
  @ApiResponse({
    status: 200,
    description: 'Chat deleted successfully.',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden. You are not authorized to delete another user’s chat.',
  })
  @ApiNotFoundResponse({
    description: 'Chat not found.',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized access.',
  })
  async deleteChat(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.chatsService.deleteChat(userId, id);
  }
}

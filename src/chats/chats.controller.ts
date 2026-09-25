import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ChatsService } from './chats.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateChatDto } from './dto/create-chat.dto';

@ApiTags('Chats')
@Controller('chats')
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get user chat history' })
  @ApiResponse({
    status: 200,
    description: 'Conversations fetched successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token or HttpOnly cookie missing, expired, or invalid.',
  })
  async getConversations(@CurrentUser('id') userId: string) {
    return this.chatsService.getUserConversations(userId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Send message prompt & generate AI response (Enforces subscription limit)',
  })
  @ApiResponse({
    status: 200,
    description: 'AI response generated successfully.',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden. Monthly subscription request limit reached.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid prompt or AI provider request error.',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized access.',
  })
  async createChat(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateChatDto,
  ) {
    return this.chatsService.createChat(userId, dto);
  }
}

import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiConflictResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new EchoGPT user account' })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully with default USER role and FREE subscription.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'User registered successfully.' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'f3b8c9d1-0a2b-4c5d-8e9f-1a2b3c4d5e6f' },
            email: { type: 'string', example: 'sohag@example.com' },
            name: { type: 'string', example: 'Sohag Ali' },
            isEmailVerified: { type: 'boolean', example: false },
            isActive: { type: 'boolean', example: true },
            role: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string', example: 'USER' },
              },
            },
            subscriptions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  plan: { type: 'string', example: 'FREE' },
                  status: { type: 'string', example: 'ACTIVE' },
                },
              },
            },
            createdAt: { type: 'string', example: '2026-09-25T09:47:00.000Z' },
          },
        },
      },
    },
  })
  @ApiConflictResponse({
    description: 'An account with this email address already exists.',
  })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }
}

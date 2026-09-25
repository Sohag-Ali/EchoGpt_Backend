import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

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
  })
  @ApiConflictResponse({
    description: 'An account with this email address already exists.',
  })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate user and issue JWT tokens' })
  @ApiResponse({
    status: 200,
    description: 'User authenticated successfully. Returns Access Token, Refresh Token, and User profile.',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid email address or password.',
  })
  async login(
    @Body() dto: LoginDto,
    @Headers('user-agent') userAgent: string,
    @Ip() ipAddress: string,
  ) {
    return this.authService.login(dto, { userAgent, ipAddress });
  }

  @Public()
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate Refresh Token and issue new Access Token' })
  @ApiResponse({
    status: 200,
    description: 'Refresh token validated successfully. Returns new Access Token and new Refresh Token.',
  })
  @ApiUnauthorizedResponse({
    description: 'Refresh token is expired, invalid, or has been revoked.',
  })
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Headers('user-agent') userAgent: string,
    @Ip() ipAddress: string,
  ) {
    return this.authService.refreshToken(dto, { userAgent, ipAddress });
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Revoke active user session and log out' })
  @ApiResponse({
    status: 200,
    description: 'User logged out and session revoked successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token missing or invalid.',
  })
  async logout(
    @CurrentUser('id') userId: string,
    @Body() dto?: RefreshTokenDto,
  ) {
    return this.authService.logout(userId, dto);
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token missing, expired, or invalid.',
  })
  async getMe(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }
}

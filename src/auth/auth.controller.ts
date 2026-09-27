import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyRegistrationDto } from './dto/verify-registration.dto';
import { ResendRegistrationOtpDto } from './dto/resend-registration-otp.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyEmailQueryDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate user registration and send 6-digit OTP to email',
  })
  @ApiResponse({
    status: 200,
    description:
      'Verification OTP sent to email. User is NOT created in PostgreSQL until OTP is verified.',
  })
  @ApiConflictResponse({
    description: 'Email is already registered.',
  })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('verify-registration')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Verify 6-digit OTP and complete account creation in PostgreSQL',
  })
  @ApiResponse({
    status: 201,
    description:
      'OTP verified successfully. User account and FREE subscription created in PostgreSQL.',
  })
  @ApiBadRequestResponse({
    description:
      'Invalid, expired OTP or maximum verification attempts exceeded.',
  })
  @ApiConflictResponse({
    description: 'Email is already registered.',
  })
  async verifyRegistration(@Body() dto: VerifyRegistrationDto) {
    return this.authService.verifyRegistration(dto);
  }

  @Public()
  @Post('resend-registration-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend registration OTP to email with 60s cooldown',
  })
  @ApiResponse({
    status: 200,
    description: 'New verification OTP sent to email.',
  })
  @ApiBadRequestResponse({
    description: 'No pending registration found for this email.',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests. Resend cooldown (60 seconds) active.',
  })
  async resendRegistrationOtp(@Body() dto: ResendRegistrationOtpDto) {
    return this.authService.resendRegistrationOtp(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate user and set JWT tokens in HttpOnly cookies',
  })
  @ApiResponse({
    status: 200,
    description:
      'User authenticated successfully. Tokens set in HttpOnly cookies (accessToken, refreshToken). Returns User profile in JSON response.',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid email address or password.',
  })
  async login(
    @Body() dto: LoginDto,
    @Headers('user-agent') userAgent: string,
    @Ip() ipAddress: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, { userAgent, ipAddress });

    const { accessToken, refreshToken, user } = result.data;
    const isProduction = process.env.NODE_ENV === 'production';

    // Access Token Cookie (24 hours = 86,400,000 ms)
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    // Refresh Token Cookie (7 days = 604,800,000 ms)
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      success: result.success,
      message: result.message,
      data: {
        user,
      },
    };
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate user using Google Sign-In ID Token' })
  @ApiResponse({
    status: 200,
    description:
      'Google authentication successful. Tokens set in HttpOnly cookies (accessToken, refreshToken). Returns User profile in JSON response.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid request body or missing Google ID token.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Invalid Google ID token, unverified Google email, or deactivated user account.',
  })
  async googleLogin(
    @Body() dto: GoogleLoginDto,
    @Headers('user-agent') userAgent: string,
    @Ip() ipAddress: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.googleLogin(dto, {
      userAgent,
      ipAddress,
    });

    const { accessToken, refreshToken, user } = result.data;
    const isProduction = process.env.NODE_ENV === 'production';

    // Access Token Cookie (24 hours = 86,400,000 ms)
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    // Refresh Token Cookie (7 days = 604,800,000 ms)
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      success: result.success,
      message: result.message,
      data: {
        user,
      },
    };
  }

  @Public()
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate Refresh Token and issue new Access Token' })
  @ApiResponse({
    status: 200,
    description:
      'Refresh token validated successfully. Returns new Access Token and new Refresh Token.',
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

  @Public()
  @Get('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify user email address using single-use token' })
  @ApiResponse({
    status: 200,
    description: 'Email address verified successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Verification token is invalid, expired, or missing.',
  })
  async verifyEmail(@Query() query: VerifyEmailQueryDto) {
    return this.authService.verifyEmail(query.token);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification link' })
  @ApiResponse({
    status: 200,
    description: 'Verification email dispatched if unverified account exists.',
  })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset 6-digit OTP code sent to registered email',
  })
  @ApiResponse({
    status: 200,
    description:
      'If the email is registered, a password reset OTP has been sent to email.',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reset account password directly using email, OTP, and new password',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully. Active sessions revoked.',
  })
  @ApiBadRequestResponse({
    description:
      'Invalid or expired OTP, or maximum verification attempts exceeded.',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
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
    @Res({ passthrough: true }) res: Response,
    @Body() dto?: RefreshTokenDto,
  ) {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
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

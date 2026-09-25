import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RoleType, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { EmailService } from '../../core/email/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

export interface ClientMetadata {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Register a new user with default USER role and FREE subscription tier, and dispatch verification email.
   */
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    // 1. Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email address already exists.');
    }

    // 2. Fetch or initialize default USER role
    let defaultRole = await this.prisma.role.findUnique({
      where: { name: RoleType.USER },
    });

    if (!defaultRole) {
      defaultRole = await this.prisma.role.create({
        data: {
          name: RoleType.USER,
          description: 'Standard EchoGPT Extension User',
        },
      });
    }

    // 3. Hash password securely
    const saltRounds = this.configService.get<number>('jwt.bcryptSaltRounds', 10);
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    // 4. One-year initial free period for subscription
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    try {
      // 5. Create user record with FREE subscription
      const createdUser = await this.prisma.user.create({
        data: {
          email,
          name: dto.name.trim(),
          password: hashedPassword,
          isEmailVerified: false,
          roleId: defaultRole.id,
          subscriptions: {
            create: {
              plan: SubscriptionPlan.FREE,
              status: SubscriptionStatus.ACTIVE,
              currentPeriodStart: new Date(),
              currentPeriodEnd: oneYearFromNow,
            },
          },
        },
        select: {
          id: true,
          email: true,
          name: true,
          isEmailVerified: true,
          isActive: true,
          role: {
            select: {
              id: true,
              name: true,
            },
          },
          subscriptions: {
            select: {
              id: true,
              plan: true,
              status: true,
              currentPeriodEnd: true,
            },
            take: 1,
          },
          createdAt: true,
        },
      });

      // 6. Generate & store secure email verification token
      const rawVerificationToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawVerificationToken).digest('hex');

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours validity

      await this.prisma.emailVerificationToken.create({
        data: {
          userId: createdUser.id,
          tokenHash,
          expiresAt,
        },
      });

      // 7. Dispatch verification email (non-blocking)
      this.emailService
        .sendVerificationEmail(createdUser.email, rawVerificationToken, createdUser.name || 'User')
        .catch((err) => this.logger.error(`Error sending verification email: ${err.message}`));

      this.logger.log(`Successfully registered new user: ${createdUser.email} [${createdUser.id}]`);

      return {
        success: true,
        message: 'User registered successfully. Please check your email to verify your account.',
        data: createdUser,
      };
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Failed to create user during registration: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to complete user registration.');
    }
  }

  /**
   * Verify user email using single-use verification token.
   */
  async verifyEmail(rawToken: string) {
    if (!rawToken) {
      throw new BadRequestException('Verification token is required.');
    }

    // 1. Hash incoming token
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // 2. Query token record
    const tokenRecord = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new BadRequestException('Invalid or already used verification token.');
    }

    if (tokenRecord.expiresAt < new Date()) {
      await this.prisma.emailVerificationToken.delete({ where: { id: tokenRecord.id } });
      throw new BadRequestException('Verification token has expired. Please request a new verification email.');
    }

    // 3. Mark user email as verified
    await this.prisma.user.update({
      where: { id: tokenRecord.userId },
      data: { isEmailVerified: true },
    });

    // 4. Delete used token
    await this.prisma.emailVerificationToken.delete({
      where: { id: tokenRecord.id },
    });

    this.logger.log(`Verified email address for user: ${tokenRecord.user.email} [${tokenRecord.userId}]`);

    return {
      success: true,
      message: 'Email address verified successfully. You can now use all platform features.',
    };
  }

  /**
   * Resend email verification link.
   */
  async resendVerification(emailInput: string) {
    const email = emailInput.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return {
        success: true,
        message: 'If an unverified account exists for this email, a verification link has been sent.',
      };
    }

    if (user.isEmailVerified) {
      return {
        success: true,
        message: 'This email address is already verified.',
      };
    }

    await this.prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });

    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawVerificationToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    await this.emailService.sendVerificationEmail(user.email, rawVerificationToken, user.name || 'User');

    this.logger.log(`Resent verification email to: ${user.email} [${user.id}]`);

    return {
      success: true,
      message: 'Verification link sent successfully. Please check your inbox.',
    };
  }

  /**
   * Generate 6-digit OTP code stored in Redis with a 5-minute TTL.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Uniform response to avoid account enumeration
    if (!user) {
      return {
        success: true,
        message: 'If an account exists for this email address, a 6-digit OTP code has been sent.',
      };
    }

    // Generate cryptographically secure 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    const otpKey = `password-reset:otp:${email}`;
    const attemptsKey = `password-reset:attempts:${email}`;

    // Store OTP in Redis with 5-minute (300s) TTL
    await this.redisService.set(otpKey, otp, 300);
    await this.redisService.del(attemptsKey);

    // Send OTP via email
    await this.emailService.sendPasswordResetOtpEmail(user.email, otp, user.name || 'User');

    this.logger.log(`Generated and dispatched password reset OTP for: ${user.email}`);

    return {
      success: true,
      message: 'If an account exists for this email address, a 6-digit OTP code has been sent.',
    };
  }

  /**
   * Validate 6-digit OTP code against Redis with rate-limiting attempt protection.
   */
  async verifyResetOtp(dto: VerifyResetOtpDto) {
    const email = dto.email.trim().toLowerCase();
    const otpInput = dto.otp.trim();

    const otpKey = `password-reset:otp:${email}`;
    const attemptsKey = `password-reset:attempts:${email}`;

    // 1. Check rate limit attempts
    const attemptsStr = await this.redisService.get(attemptsKey);
    const attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;

    if (attempts >= 5) {
      throw new BadRequestException('Too many failed OTP attempts. Please request a new password reset code.');
    }

    // 2. Fetch stored OTP from Redis
    const cachedOtp = await this.redisService.get(otpKey);

    if (!cachedOtp) {
      throw new BadRequestException('OTP code has expired or is invalid. Please request a new code.');
    }

    // 3. Compare OTP
    if (cachedOtp !== otpInput) {
      const newAttempts = attempts + 1;
      await this.redisService.set(attemptsKey, newAttempts.toString(), 300);
      throw new BadRequestException(`Invalid OTP code. ${5 - newAttempts} attempts remaining.`);
    }

    // 4. OTP Valid! Clean up OTP & attempts from Redis
    await this.redisService.del(otpKey);
    await this.redisService.del(attemptsKey);

    // 5. Issue single-use temporary password reset token (10-minute TTL in Redis)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenKey = `password-reset:token:${resetToken}`;

    await this.redisService.set(resetTokenKey, email, 600); // 10 minutes

    this.logger.log(`OTP code verified successfully for: ${email}`);

    return {
      success: true,
      message: 'OTP code verified successfully.',
      data: {
        resetToken,
      },
    };
  }

  /**
   * Reset user password using single-use reset token and invalidate all active sessions.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const resetTokenKey = `password-reset:token:${dto.resetToken}`;

    // 1. Retrieve associated email from Redis
    const email = await this.redisService.get(resetTokenKey);

    if (!email) {
      throw new BadRequestException('Reset token is invalid or has expired. Please verify your OTP again.');
    }

    // 2. Single-use token: invalidate immediately
    await this.redisService.del(resetTokenKey);

    // 3. Find user in database
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('User account not found.');
    }

    // 4. Hash new password
    const saltRounds = this.configService.get<number>('jwt.bcryptSaltRounds', 10);
    const hashedPassword = await bcrypt.hash(dto.newPassword, saltRounds);

    // 5. Update password in PostgreSQL
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // 6. Invalidate ALL active sessions across all devices
    await this.prisma.session.updateMany({
      where: { userId: user.id, isRevoked: false },
      data: { isRevoked: true },
    });

    this.logger.log(`Password reset successfully for user: ${email} [${user.id}]. Revoked all sessions.`);

    return {
      success: true,
      message: 'Password reset successfully. All active sessions have been logged out. Please log in with your new password.',
    };
  }

  /**
   * Authenticate user, issue access/refresh tokens, and persist session metadata.
   */
  async login(dto: LoginDto, metadata: ClientMetadata) {
    const email = dto.email.trim().toLowerCase();

    // 1. Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        role: true,
        subscriptions: {
          where: { status: SubscriptionStatus.ACTIVE },
          take: 1,
        },
      },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid email address or password.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated. Please contact support.');
    }

    // 2. Validate password via bcrypt
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email address or password.');
    }

    // 3. Issue Access & Refresh tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role.name);

    // 4. Hash refresh token & record Session entry
    const saltRounds = this.configService.get<number>('jwt.bcryptSaltRounds', 10);
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, saltRounds);

    const refreshExpiryDays = 7;
    const sessionExpiresAt = new Date();
    sessionExpiresAt.setDate(sessionExpiresAt.getDate() + refreshExpiryDays);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        userAgent: metadata.userAgent || 'Unknown Device',
        ipAddress: metadata.ipAddress || '0.0.0.0',
        expiresAt: sessionExpiresAt,
        isRevoked: false,
      },
    });

    this.logger.log(`User logged in successfully: ${user.email} [${user.id}]`);

    return {
      success: true,
      message: 'Login successful.',
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isEmailVerified: user.isEmailVerified,
          isActive: user.isActive,
          role: {
            id: user.role.id,
            name: user.role.name,
          },
          subscription: user.subscriptions[0] || null,
        },
      },
    };
  }

  /**
   * Rotate Refresh Token & Issue new Access Token.
   */
  async refreshToken(dto: RefreshTokenDto, metadata: ClientMetadata) {
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret');

    // 1. Verify Refresh Token JWT signature & payload
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or has expired. Please log in again.');
    }

    if (!payload || !payload.sub || payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token payload.');
    }

    const userId = payload.sub;

    // 2. Fetch User
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account not found or deactivated.');
    }

    // 3. Find active matching session
    const activeSessions = await this.prisma.session.findMany({
      where: {
        userId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
    });

    let matchingSession: any = null;
    for (const session of activeSessions) {
      const isMatch = await bcrypt.compare(dto.refreshToken, session.refreshTokenHash);
      if (isMatch) {
        matchingSession = session;
        break;
      }
    }

    if (!matchingSession) {
      this.logger.warn(`Security Warning: Refresh token reuse attempt detected for user [${userId}]. Revoking all active sessions.`);
      await this.prisma.session.updateMany({
        where: { userId },
        data: { isRevoked: true },
      });
      throw new UnauthorizedException('Refresh token has been revoked or reused.');
    }

    // 4. Generate NEW Access & Refresh Tokens (Token Rotation)
    const tokens = await this.generateTokens(user.id, user.email, user.role.name);

    // 5. Revoke old session
    await this.prisma.session.update({
      where: { id: matchingSession.id },
      data: { isRevoked: true },
    });

    // 6. Record NEW active session
    const saltRounds = this.configService.get<number>('jwt.bcryptSaltRounds', 10);
    const newRefreshTokenHash = await bcrypt.hash(tokens.refreshToken, saltRounds);

    const refreshExpiryDays = 7;
    const sessionExpiresAt = new Date();
    sessionExpiresAt.setDate(sessionExpiresAt.getDate() + refreshExpiryDays);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: newRefreshTokenHash,
        userAgent: metadata.userAgent || matchingSession.userAgent,
        ipAddress: metadata.ipAddress || matchingSession.ipAddress,
        expiresAt: sessionExpiresAt,
        isRevoked: false,
      },
    });

    this.logger.log(`Rotated refresh token successfully for user: ${user.email} [${user.id}]`);

    return {
      success: true,
      message: 'Tokens rotated successfully.',
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };
  }

  /**
   * Revoke active user session(s).
   */
  async logout(userId: string, dto?: RefreshTokenDto) {
    if (dto && dto.refreshToken) {
      const activeSessions = await this.prisma.session.findMany({
        where: { userId, isRevoked: false },
      });

      for (const session of activeSessions) {
        const isMatch = await bcrypt.compare(dto.refreshToken, session.refreshTokenHash);
        if (isMatch) {
          await this.prisma.session.update({
            where: { id: session.id },
            data: { isRevoked: true },
          });
          break;
        }
      }
    } else {
      // Revoke all active sessions for this user
      await this.prisma.session.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      });
    }

    this.logger.log(`Logged out user and revoked active session(s): [${userId}]`);

    return {
      success: true,
      message: 'Logged out successfully.',
    };
  }

  /**
   * Fetch current authenticated user profile.
   */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        isEmailVerified: true,
        isActive: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        subscriptions: {
          select: {
            id: true,
            plan: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
          },
          take: 1,
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User profile not found.');
    }

    return {
      success: true,
      message: 'User profile retrieved successfully.',
      data: user,
    };
  }

  /**
   * Helper method to generate access and refresh JWT tokens.
   */
  private async generateTokens(userId: string, email: string, roleName: string) {
    const accessSecret = this.configService.get<string>('jwt.accessSecret');
    const accessExpiresIn = this.configService.get<string>('jwt.accessExpiresIn', '15m');
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret');
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn', '7d');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, role: roleName },
        { secret: accessSecret, expiresIn: accessExpiresIn as any },
      ),
      this.jwtService.signAsync(
        { sub: userId, email, tokenType: 'refresh' },
        { secret: refreshSecret, expiresIn: refreshExpiresIn as any },
      ),
    ]);

    return { accessToken, refreshToken };
  }
}

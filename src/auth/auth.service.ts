import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
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
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyRegistrationDto } from './dto/verify-registration.dto';
import { ResendRegistrationOtpDto } from './dto/resend-registration-otp.dto';
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
   * 1. Register a new user (Strict OTP Flow):
   * Validates DTO, checks existing email in PostgreSQL, hashes password,
   * stores pending data & hashed OTP in Redis with TTLs, and dispatches OTP email.
   * DOES NOT create User, Session, or Subscription in PostgreSQL.
   */
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    // 1. Check if user already exists in PostgreSQL database
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered.');
    }

    // 2. Hash password securely (never store plain password in Redis)
    const saltRounds = this.configService.get<number>('jwt.bcryptSaltRounds', 10);
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    // 3. Generate a cryptographically secure 6-digit OTP
    const otpNum = crypto.randomInt(100000, 1000000);
    const otpStr = otpNum.toString();
    const otpHash = crypto.createHash('sha256').update(otpStr).digest('hex');

    // 4. Store pending registration data in Redis (10 minutes TTL = 600s)
    await this.redisService.set(
      `pending-registration:${email}`,
      JSON.stringify({
        name: dto.name.trim(),
        email,
        passwordHash,
        createdAt: new Date().toISOString(),
      }),
      600,
    );

    // 5. Store OTP hash & attempts in Redis (5 minutes TTL = 300s)
    await this.redisService.set(
      `registration-otp:${email}`,
      JSON.stringify({
        otpHash,
        attempts: 0,
      }),
      300,
    );

    // 6. Send OTP email using MailService
    this.emailService
      .sendRegistrationOtpEmail(email, otpStr, dto.name.trim())
      .catch((err) => this.logger.error(`Error sending registration OTP email: ${err.message}`));

    this.logger.log(`Generated registration OTP for pending email: ${email}`);

    return {
      success: true,
      message: 'Verification OTP sent to your email',
    };
  }

  /**
   * 2. Verify Registration OTP:
   * Validates OTP from Redis. Upon successful OTP verification, creates User
   * and default FREE subscription in PostgreSQL, sets emailVerified = true,
   * and cleans up Redis pending registration keys.
   */
  async verifyRegistration(dto: VerifyRegistrationDto) {
    const email = dto.email.trim().toLowerCase();

    // 1. Double check PostgreSQL to prevent duplicate registration
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered.');
    }

    // 2. Fetch pending registration data from Redis
    const pendingDataStr = await this.redisService.get(`pending-registration:${email}`);
    if (!pendingDataStr) {
      throw new BadRequestException('Pending registration expired or not found. Please register again.');
    }
    const pendingData = JSON.parse(pendingDataStr);

    // 3. Fetch stored OTP data from Redis
    const otpDataStr = await this.redisService.get(`registration-otp:${email}`);
    if (!otpDataStr) {
      throw new BadRequestException('Invalid or expired OTP');
    }
    const otpData = JSON.parse(otpDataStr);

    // 4. Check for brute-force attempts limit (Max 5 attempts)
    if (otpData.attempts >= 5) {
      await this.redisService.del(`registration-otp:${email}`);
      throw new BadRequestException('Maximum verification attempts exceeded. Please request a new OTP.');
    }

    // 5. Hash incoming OTP and compare
    const inputOtpHash = crypto.createHash('sha256').update(dto.otp.trim()).digest('hex');
    if (inputOtpHash !== otpData.otpHash) {
      otpData.attempts += 1;
      const remainingTtl = await this.redisService.ttl(`registration-otp:${email}`);
      const ttlToUse = remainingTtl > 0 ? remainingTtl : 300;
      await this.redisService.set(`registration-otp:${email}`, JSON.stringify(otpData), ttlToUse);
      throw new BadRequestException('Invalid or expired OTP');
    }

    // 6. Fetch or initialize default USER role
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

    // 7. One-year initial free period for subscription
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    try {
      // 8. Create User and FREE Subscription in PostgreSQL (OTP verified!)
      const createdUser = await this.prisma.user.create({
        data: {
          email,
          name: pendingData.name,
          password: pendingData.passwordHash,
          isEmailVerified: true,
          isActive: true,
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
          createdAt: true,
        },
      });

      // 9. Clean up temporary registration data from Redis
      await this.redisService.del(`pending-registration:${email}`);
      await this.redisService.del(`registration-otp:${email}`);
      await this.redisService.del(`resend-otp-cooldown:${email}`);

      // 10. Send Welcome Email
      this.emailService
        .sendWelcomeEmail(createdUser.email, createdUser.name || 'User')
        .catch((err) => this.logger.error(`Error sending welcome email: ${err.message}`));

      this.logger.log(`User created in PostgreSQL after OTP verification: ${createdUser.email} [${createdUser.id}]`);

      return {
        success: true,
        message: 'Registration verified and completed successfully',
        data: createdUser,
      };
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Email is already registered.');
      }
      this.logger.error(`Registration completion error for ${email}: ${error.message}`);
      throw new InternalServerErrorException('Could not complete account creation.');
    }
  }

  /**
   * 3. Resend Registration OTP:
   * Generates a new OTP for an existing pending registration with rate-limiting cooldown.
   */
  async resendRegistrationOtp(dto: ResendRegistrationOtpDto) {
    const email = dto.email.trim().toLowerCase();

    // 1. Check if user already exists in PostgreSQL
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered.');
    }

    // 2. Check rate-limit cooldown (60 seconds)
    const isCooldownActive = await this.redisService.get(`resend-otp-cooldown:${email}`);
    if (isCooldownActive) {
      throw new HttpException('Please wait 60 seconds before requesting another OTP', HttpStatus.TOO_MANY_REQUESTS);
    }

    // 3. Check if pending registration exists in Redis
    const pendingDataStr = await this.redisService.get(`pending-registration:${email}`);
    if (!pendingDataStr) {
      throw new BadRequestException('No pending registration found for this email. Please register again.');
    }
    const pendingData = JSON.parse(pendingDataStr);

    // 4. Generate new secure 6-digit OTP
    const otpNum = crypto.randomInt(100000, 1000000);
    const otpStr = otpNum.toString();
    const otpHash = crypto.createHash('sha256').update(otpStr).digest('hex');

    // 5. Replace OTP in Redis (5 mins = 300s) and reset attempts
    await this.redisService.set(
      `registration-otp:${email}`,
      JSON.stringify({
        otpHash,
        attempts: 0,
      }),
      300,
    );

    // 6. Reset pending registration TTL to 10 mins (600s)
    await this.redisService.set(`pending-registration:${email}`, pendingDataStr, 600);

    // 7. Set 60-second resend cooldown
    await this.redisService.set(`resend-otp-cooldown:${email}`, 'true', 60);

    // 8. Dispatch new OTP email
    this.emailService
      .sendRegistrationOtpEmail(email, otpStr, pendingData.name)
      .catch((err) => this.logger.error(`Error resending registration OTP email: ${err.message}`));

    return {
      success: true,
      message: 'New verification OTP sent to your email',
    };
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

    // 5. Send Welcome Email
    this.emailService
      .sendWelcomeEmail(tokenRecord.user.email, tokenRecord.user.name || 'User')
      .catch((err) => this.logger.error(`Error sending welcome email: ${err.message}`));

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

    await this.redisService.set(otpKey, otp, 300);
    await this.redisService.del(attemptsKey);

    await this.emailService.sendPasswordResetEmail(user.email, otp, user.name || 'User');

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

    const attemptsStr = await this.redisService.get(attemptsKey);
    const attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;

    if (attempts >= 5) {
      throw new BadRequestException('Too many failed OTP attempts. Please request a new password reset code.');
    }

    const cachedOtp = await this.redisService.get(otpKey);

    if (!cachedOtp) {
      throw new BadRequestException('OTP code has expired or is invalid. Please request a new code.');
    }

    if (cachedOtp !== otpInput) {
      const newAttempts = attempts + 1;
      await this.redisService.set(attemptsKey, newAttempts.toString(), 300);
      throw new BadRequestException(`Invalid OTP code. ${5 - newAttempts} attempts remaining.`);
    }

    await this.redisService.del(otpKey);
    await this.redisService.del(attemptsKey);

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenKey = `password-reset:token:${resetToken}`;

    await this.redisService.set(resetTokenKey, email, 600);

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

    const email = await this.redisService.get(resetTokenKey);

    if (!email) {
      throw new BadRequestException('Reset token is invalid or has expired. Please verify your OTP again.');
    }

    await this.redisService.del(resetTokenKey);

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('User account not found.');
    }

    const saltRounds = this.configService.get<number>('jwt.bcryptSaltRounds', 10);
    const hashedPassword = await bcrypt.hash(dto.newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    await this.prisma.session.updateMany({
      where: { userId: user.id, isRevoked: false },
      data: { isRevoked: true },
    });

    // Send confirmation email
    this.emailService
      .sendPasswordResetSuccessEmail(user.email, user.name || 'User')
      .catch((err) => this.logger.error(`Error sending password reset success email: ${err.message}`));

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

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email address or password.');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role.name);

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

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account not found or deactivated.');
    }

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

    const tokens = await this.generateTokens(user.id, user.email, user.role.name);

    await this.prisma.session.update({
      where: { id: matchingSession.id },
      data: { isRevoked: true },
    });

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

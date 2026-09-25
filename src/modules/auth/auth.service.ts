import {
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
import { PrismaService } from '../../core/database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

export interface ClientMetadata {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Register a new user with default USER role and FREE subscription tier.
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

      this.logger.log(`Successfully registered new user: ${createdUser.email} [${createdUser.id}]`);

      return {
        success: true,
        message: 'User registered successfully.',
        data: createdUser,
      };
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Failed to create user during registration: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to complete user registration.');
    }
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

    // Reuse detection: if matching session is not found, token may have been stolen or revoked. Revoke all sessions.
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

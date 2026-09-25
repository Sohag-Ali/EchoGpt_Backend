import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoleType, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../core/database/prisma.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
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
}

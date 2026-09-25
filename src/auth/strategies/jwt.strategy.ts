import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => {
          return req?.cookies?.accessToken || null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret') || 'default-secret-key',
    });
  }

  /**
   * Passport automatically invokes this method after validating the JWT signature and expiration.
   * Loads and validates the user record from PostgreSQL database.
   */
  async validate(payload: JwtPayload) {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid or malformed authentication token.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
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
          },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User associated with this token no longer exists.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account has been deactivated.');
    }

    return user;
  }
}

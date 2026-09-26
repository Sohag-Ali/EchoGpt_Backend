import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoleType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Safe fields selector for User responses
   */
  private get safeUserSelect() {
    return {
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
      subscription: {
        select: {
          id: true,
          plan: true,
          status: true,
          monthlyLimit: true,
          usedRequests: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    };
  }

  /**
   * 1. GET /users/me - Get basic account profile
   */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.safeUserSelect,
    });

    if (!user) {
      throw new NotFoundException('User profile not found.');
    }

    const roleName = typeof user.role === 'string' ? user.role : user.role?.name;

    return {
      success: true,
      message: 'Profile fetched successfully',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: roleName,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  /**
   * 2. GET /users/me/profile - Get complete user account + UserProfile information
   */
  async getMeProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        isEmailVerified: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        profile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            bio: true,
            profileImage: true,
            dateOfBirth: true,
            gender: true,
            country: true,
            city: true,
            address: true,
            website: true,
            github: true,
            linkedin: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found.');
    }

    const roleName = typeof user.role === 'string' ? user.role : user.role?.name;

    return {
      success: true,
      message: 'Profile fetched successfully',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: roleName,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        profile: user.profile || null,
      },
    };
  }

  /**
   * 3. PATCH /users/me/profile - Create or Update UserProfile (upsert)
   */
  async updateMyProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User account not found.');
    }

    // Extract profile fields from DTO
    const {
      firstName,
      lastName,
      phone,
      bio,
      profileImage,
      dateOfBirth,
      gender,
      country,
      city,
      address,
      website,
      github,
      linkedin,
    } = dto;

    // Construct update object with only defined fields (preserving existing data)
    const profileFields: any = {};
    if (firstName !== undefined) profileFields.firstName = firstName;
    if (lastName !== undefined) profileFields.lastName = lastName;
    if (phone !== undefined) profileFields.phone = phone;
    if (bio !== undefined) profileFields.bio = bio;
    if (profileImage !== undefined) profileFields.profileImage = profileImage;
    if (dateOfBirth !== undefined)
      profileFields.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    if (gender !== undefined) profileFields.gender = gender;
    if (country !== undefined) profileFields.country = country;
    if (city !== undefined) profileFields.city = city;
    if (address !== undefined) profileFields.address = address;
    if (website !== undefined) profileFields.website = website;
    if (github !== undefined) profileFields.github = github;
    if (linkedin !== undefined) profileFields.linkedin = linkedin;

    // Upsert UserProfile record for this user
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        ...profileFields,
      },
      update: profileFields,
    });

    this.logger.log(`User [${userId}] updated profile data.`);

    return this.getMeProfile(userId);
  }

  /**
   * 4. PATCH /users/me/password - Change own password
   */
  async changeMyPassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('User account or password record not found.');
    }

    // 1. Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Incorrect current password.');
    }

    // 2. Prevent same password
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password cannot be the same as the current password.');
    }

    // 3. Hash new password
    const saltRounds = this.configService.get<number>('jwt.bcryptSaltRounds', 10);
    const newHashedPassword = await bcrypt.hash(dto.newPassword, saltRounds);

    // 4. Update in PostgreSQL
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: newHashedPassword },
    });

    // 5. Invalidate existing active sessions/refresh tokens
    await this.prisma.session.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });

    this.logger.log(`Password changed successfully for user [${userId}]. Revoked active sessions.`);

    return {
      success: true,
      message: 'Password changed successfully',
    };
  }

  /**
   * 5. PATCH /users/me/deactivate - Self account deactivation
   */
  async deactivateMyAccount(userId: string, dto: DeactivateAccountDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('User account or password record not found.');
    }

    // 1. Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Incorrect password.');
    }

    // 2. Admin Self-Protection Check
    if (user.role && user.role.name === RoleType.ADMIN) {
      const activeAdminCount = await this.prisma.user.count({
        where: {
          role: { name: RoleType.ADMIN },
          isActive: true,
        },
      });

      if (activeAdminCount <= 1) {
        throw new ConflictException('Cannot deactivate or delete the last active administrator.');
      }
    }

    // 3. Deactivate user account (soft deactivation)
    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    // 4. Revoke active sessions
    await this.prisma.session.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });

    this.logger.log(`Account deactivated by user self-action: [${userId}]`);

    return {
      success: true,
      message: 'Account deactivated successfully',
    };
  }

  /**
   * 6. GET /users/admin - Admin: Get users with pagination, search & filters
   */
  async adminGetUsers(query: QueryUsersDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search) {
      const searchTerm = query.search.trim();
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    if (query.role) {
      where.role = { name: query.role };
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          ...this.safeUserSelect,
          profile: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              country: true,
              city: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      success: true,
      message: 'Users fetched successfully',
      data: {
        users,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  /**
   * 7. GET /users/admin/:id - Admin: Get specific user details
   */
  async adminGetUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...this.safeUserSelect,
        profile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return {
      success: true,
      message: 'User details fetched successfully',
      data: user,
    };
  }

  /**
   * 8. PATCH /users/admin/:id - Admin: Update user fields (role, isActive, name)
   */
  async adminUpdateUser(targetUserId: string, dto: AdminUpdateUserDto) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { role: true },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found.');
    }

    const isCurrentAdmin = targetUser.role && targetUser.role.name === RoleType.ADMIN;
    const willBeDeactivated = dto.isActive === false;
    const willBeDemoted = dto.role && dto.role !== RoleType.ADMIN;

    // Admin Self-Protection Check
    if (isCurrentAdmin && (willBeDeactivated || willBeDemoted)) {
      const activeAdminCount = await this.prisma.user.count({
        where: {
          role: { name: RoleType.ADMIN },
          isActive: true,
        },
      });

      if (activeAdminCount <= 1) {
        throw new ConflictException('Cannot deactivate or demote the last active administrator.');
      }
    }

    let roleId = targetUser.roleId;
    if (dto.role) {
      let roleRecord = await this.prisma.role.findUnique({
        where: { name: dto.role },
      });

      if (!roleRecord) {
        roleRecord = await this.prisma.role.create({
          data: { name: dto.role },
        });
      }
      roleId = roleRecord.id;
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.role && { roleId }),
      },
      select: this.safeUserSelect,
    });

    // If account deactivated by admin, revoke session
    if (dto.isActive === false) {
      await this.prisma.session.updateMany({
        where: { userId: targetUserId, isRevoked: false },
        data: { isRevoked: true },
      });
    }

    this.logger.log(`Admin updated user [${targetUserId}]: role=${dto.role}, isActive=${dto.isActive}`);

    return {
      success: true,
      message: 'User updated successfully',
      data: updatedUser,
    };
  }

  /**
   * 9. DELETE /users/admin/:id - Admin: Delete user with safe transaction cascade
   */
  async adminDeleteUser(targetUserId: string, currentAdminId: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { role: true },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found.');
    }

    // Admin Self-Protection Check
    if (targetUser.role && targetUser.role.name === RoleType.ADMIN) {
      const activeAdminCount = await this.prisma.user.count({
        where: {
          role: { name: RoleType.ADMIN },
          isActive: true,
        },
      });

      if (activeAdminCount <= 1) {
        throw new ConflictException('Cannot deactivate or delete the last active administrator.');
      }
    }

    // Transactional safe cascade deletion of all user relations
    await this.prisma.$transaction(async (tx) => {
      await tx.userProfile.deleteMany({ where: { userId: targetUserId } });
      await tx.payment.deleteMany({ where: { userId: targetUserId } });
      await tx.session.deleteMany({ where: { userId: targetUserId } });
      await tx.subscription.deleteMany({ where: { userId: targetUserId } });
      await tx.chat.deleteMany({ where: { userId: targetUserId } });
      await tx.webSearch.deleteMany({ where: { userId: targetUserId } });
      await tx.apiUsageLog.deleteMany({ where: { userId: targetUserId } });
      await tx.emailVerificationToken.deleteMany({ where: { userId: targetUserId } });
      await tx.passwordResetToken.deleteMany({ where: { userId: targetUserId } });
      await tx.user.delete({ where: { id: targetUserId } });
    });

    this.logger.log(`Admin [${currentAdminId}] deleted user [${targetUserId}] and all associated records.`);

    return {
      success: true,
      message: 'User deleted successfully',
    };
  }

  /**
   * 10. GET /users/me/usage-logs - Get authenticated user's API usage logs with pagination
   */
  async getMeUsageLogs(userId: string, page = 1, limit = 20) {
    const pageNum = Number(page) || 1;
    const limitNum = Math.min(Number(limit) || 20, 100);
    const skip = (pageNum - 1) * limitNum;

    const [total, items] = await Promise.all([
      this.prisma.apiUsageLog.count({ where: { userId } }),
      this.prisma.apiUsageLog.findMany({
        where: { userId },
        select: {
          id: true,
          endpoint: true,
          requestType: true,
          status: true,
          modelName: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          estimatedCost: true,
          latencyMs: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    return {
      success: true,
      message: 'User API usage logs fetched successfully',
      data: {
        items,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    };
  }
}


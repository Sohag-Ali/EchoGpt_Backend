import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/services/encryption.service';
import { CreateAIProviderDto } from './dto/create-ai-provider.dto';
import { UpdateAIProviderDto } from './dto/update-ai-provider.dto';

@Injectable()
export class ProvidersService {
  private readonly logger = new Logger(ProvidersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Internal helper to sanitize and format AIProvider record for public/admin responses.
   * Never exposes raw or encrypted API keys.
   */
  private formatProvider(provider: any) {
    return {
      id: provider.id,
      name: provider.name,
      type: provider.providerType,
      modelName: provider.modelName,
      baseUrl: provider.baseUrl,
      isEnabled: provider.isActive,
      isDefault: provider.isDefault,
      costPer1kInput: provider.costPer1kInput,
      costPer1kOutput: provider.costPer1kOutput,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  /**
   * 1. Create a new AI Provider (ADMIN only)
   */
  async createProvider(dto: CreateAIProviderDto) {
    const existingCount = await this.prisma.aIProvider.count();
    const isDefault = existingCount === 0;

    const encryptedApiKey = this.encryptionService.encrypt(dto.apiKey);

    const provider = await this.prisma.aIProvider.create({
      data: {
        name: dto.name,
        providerType: dto.type,
        encryptedApiKey,
        modelName: dto.modelName || 'default',
        baseUrl: dto.baseUrl,
        isActive: dto.isEnabled ?? true,
        isDefault,
        costPer1kInput: dto.costPer1kInput ?? 0,
        costPer1kOutput: dto.costPer1kOutput ?? 0,
      },
    });

    this.logger.log(
      `AI Provider [${provider.name}] (${provider.providerType}) created successfully by admin. ID: ${provider.id}, Default: ${isDefault}`,
    );

    return {
      success: true,
      message: 'AI provider created successfully',
      data: this.formatProvider(provider),
    };
  }

  /**
   * 2. Get All Providers (ADMIN only)
   */
  async getAllProviders() {
    const providers = await this.prisma.aIProvider.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      message: 'AI providers retrieved successfully',
      data: providers.map((p) => this.formatProvider(p)),
    };
  }

  /**
   * 3. Get Active Providers List
   */
  async getActiveProviders() {
    const providers = await this.prisma.aIProvider.findMany({
      where: { isActive: true },
      orderBy: { isDefault: 'desc' },
    });

    return {
      success: true,
      message: 'Active AI providers retrieved successfully',
      data: providers.map((p) => this.formatProvider(p)),
    };
  }

  /**
   * 4. Get Provider By ID (ADMIN only)
   */
  async getProviderById(id: string) {
    const provider = await this.prisma.aIProvider.findUnique({
      where: { id },
    });

    if (!provider) {
      throw new NotFoundException(`AI Provider with ID [${id}] not found.`);
    }

    return {
      success: true,
      message: 'AI provider retrieved successfully',
      data: this.formatProvider(provider),
    };
  }

  /**
   * 5. Update Provider (ADMIN only)
   */
  async updateProvider(id: string, dto: UpdateAIProviderDto) {
    const provider = await this.prisma.aIProvider.findUnique({
      where: { id },
    });

    if (!provider) {
      throw new NotFoundException(`AI Provider with ID [${id}] not found.`);
    }

    const updateData: any = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.type !== undefined) updateData.providerType = dto.type;
    if (dto.modelName !== undefined) updateData.modelName = dto.modelName;
    if (dto.baseUrl !== undefined) updateData.baseUrl = dto.baseUrl;
    if (dto.costPer1kInput !== undefined)
      updateData.costPer1kInput = dto.costPer1kInput;
    if (dto.costPer1kOutput !== undefined)
      updateData.costPer1kOutput = dto.costPer1kOutput;

    if (dto.apiKey !== undefined && dto.apiKey.trim() !== '') {
      updateData.encryptedApiKey = this.encryptionService.encrypt(dto.apiKey);
    }

    if (dto.isEnabled !== undefined) {
      updateData.isActive = dto.isEnabled;
      // Safety rule: A disabled provider cannot remain default
      if (!dto.isEnabled && provider.isDefault) {
        updateData.isDefault = false;
        this.logger.log(
          `Disabled default provider [${id}]. Reset isDefault to false.`,
        );
      }
    }

    const updated = await this.prisma.aIProvider.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`AI Provider [${id}] updated successfully.`);

    return {
      success: true,
      message: 'AI provider updated successfully',
      data: this.formatProvider(updated),
    };
  }

  /**
   * 6. Toggle Provider Enabled / Disabled (ADMIN only)
   */
  async toggleProvider(id: string) {
    const provider = await this.prisma.aIProvider.findUnique({
      where: { id },
    });

    if (!provider) {
      throw new NotFoundException(`AI Provider with ID [${id}] not found.`);
    }

    const newIsActive = !provider.isActive;
    const updateData: any = { isActive: newIsActive };

    // Safety rule: If disabling the current default provider, remove default flag
    if (!newIsActive && provider.isDefault) {
      updateData.isDefault = false;
      this.logger.log(
        `Disabling active default provider [${id}]. Reset isDefault to false.`,
      );
    }

    const updated = await this.prisma.aIProvider.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(
      `AI Provider [${id}] toggled status to ${newIsActive ? 'ENABLED' : 'DISABLED'}.`,
    );

    return {
      success: true,
      message: `AI provider ${newIsActive ? 'enabled' : 'disabled'} successfully`,
      data: this.formatProvider(updated),
    };
  }

  /**
   * 7. Set Provider as Default (ADMIN only)
   */
  async setDefaultProvider(id: string) {
    const provider = await this.prisma.aIProvider.findUnique({
      where: { id },
    });

    if (!provider) {
      throw new NotFoundException(`AI Provider with ID [${id}] not found.`);
    }

    if (!provider.isActive) {
      throw new BadRequestException(
        'Only enabled providers can be set as the default provider.',
      );
    }

    // Atomic Prisma Transaction: Unset existing default and set new default
    const [_, updated] = await this.prisma.$transaction([
      this.prisma.aIProvider.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.aIProvider.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);

    this.logger.log(
      `Set AI Provider [${id}] (${provider.name}) as default provider.`,
    );

    return {
      success: true,
      message: 'Default AI provider set successfully',
      data: this.formatProvider(updated),
    };
  }

  /**
   * 8. Delete Provider (ADMIN only)
   */
  async deleteProvider(id: string) {
    const provider = await this.prisma.aIProvider.findUnique({
      where: { id },
    });

    if (!provider) {
      throw new NotFoundException(`AI Provider with ID [${id}] not found.`);
    }

    if (provider.isDefault) {
      throw new BadRequestException(
        'Cannot delete the default AI provider. Please set another provider as default first.',
      );
    }

    // Relation checks to prevent orphaned data or DB foreign key errors
    const chatsCount = await this.prisma.chat.count({
      where: { providerId: id },
    });
    const logsCount = await this.prisma.apiUsageLog.count({
      where: { providerId: id },
    });

    if (chatsCount > 0 || logsCount > 0) {
      throw new BadRequestException(
        `Cannot delete provider [${provider.name}] because it has existing chat or usage history (${chatsCount} chats, ${logsCount} usage logs). Please disable it instead.`,
      );
    }

    await this.prisma.aIProvider.delete({
      where: { id },
    });

    this.logger.log(`Deleted AI Provider [${id}] (${provider.name}).`);

    return {
      success: true,
      message: 'AI provider deleted successfully',
    };
  }
}

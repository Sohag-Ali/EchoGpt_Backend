import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RoleType } from '@prisma/client';
import { ProvidersService } from './providers.service';
import { AiProviderHealthService } from './services/ai-provider-health.service';
import { CreateAIProviderDto } from './dto/create-ai-provider.dto';
import { UpdateAIProviderDto } from './dto/update-ai-provider.dto';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('AI Providers')
@ApiBearerAuth('JWT-auth')
@Controller('providers')
export class ProvidersController {
  constructor(
    private readonly providersService: ProvidersService,
    private readonly healthService: AiProviderHealthService,
  ) {}

  @Post()
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new AI provider (ADMIN only)',
    description:
      'Creates a new AI provider, encrypting the API key at rest using AES-256-GCM. Never returns the API key.',
  })
  @ApiResponse({
    status: 201,
    description: 'AI provider created successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid input DTO data or duplicate provider registration.',
  })
  @ApiForbiddenResponse({
    description: 'Access denied. Requires ADMIN role.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token missing or invalid.',
  })
  async createProvider(@Body() dto: CreateAIProviderDto) {
    return this.providersService.createProvider(dto);
  }

  @Get()
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all registered AI providers metadata (ADMIN only)',
    description:
      'Retrieves metadata for all registered providers. API keys are completely omitted.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of registered AI providers metadata.',
  })
  @ApiForbiddenResponse({
    description: 'Access denied. Requires ADMIN role.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token missing or invalid.',
  })
  async getAllProviders() {
    return this.providersService.getAllProviders();
  }

  @Get(':id')
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get AI provider metadata by ID (ADMIN only)',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique UUID of the AI provider',
  })
  @ApiResponse({
    status: 200,
    description: 'AI provider metadata fetched successfully.',
  })
  @ApiNotFoundResponse({
    description: 'AI provider not found.',
  })
  @ApiForbiddenResponse({
    description: 'Access denied. Requires ADMIN role.',
  })
  async getProviderById(@Param('id') id: string) {
    return this.providersService.getProviderById(id);
  }

  @Patch(':id')
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Controlled update of an AI provider (ADMIN only)',
    description:
      'Allows updating name, engine type, API key, model name, base URL, and costs. If API key is updated, it is re-encrypted.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique UUID of the AI provider',
  })
  @ApiResponse({
    status: 200,
    description: 'AI provider updated successfully.',
  })
  @ApiNotFoundResponse({
    description: 'AI provider not found.',
  })
  @ApiForbiddenResponse({
    description: 'Access denied. Requires ADMIN role.',
  })
  async updateProvider(
    @Param('id') id: string,
    @Body() dto: UpdateAIProviderDto,
  ) {
    return this.providersService.updateProvider(id, dto);
  }

  @Patch(':id/toggle')
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Toggle provider enabled/disabled status (ADMIN only)',
    description:
      'Enables or disables an AI provider. Disabling a default provider automatically revokes default status.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique UUID of the AI provider',
  })
  @ApiResponse({
    status: 200,
    description: 'AI provider toggle processed successfully.',
  })
  @ApiNotFoundResponse({
    description: 'AI provider not found.',
  })
  @ApiForbiddenResponse({
    description: 'Access denied. Requires ADMIN role.',
  })
  async toggleProvider(@Param('id') id: string) {
    return this.providersService.toggleProvider(id);
  }

  @Patch(':id/default')
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set an enabled AI provider as default (ADMIN only)',
    description:
      'Sets the target enabled provider as default and unsets the previous default provider atomically.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique UUID of the AI provider',
  })
  @ApiResponse({
    status: 200,
    description: 'Default AI provider updated successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Target provider is disabled and cannot be set as default.',
  })
  @ApiNotFoundResponse({
    description: 'AI provider not found.',
  })
  @ApiForbiddenResponse({
    description: 'Access denied. Requires ADMIN role.',
  })
  async setDefaultProvider(@Param('id') id: string) {
    return this.providersService.setDefaultProvider(id);
  }

  @Delete(':id')
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an unused AI provider (ADMIN only)',
    description:
      'Deletes an AI provider if it has no associated chat or usage history and is not currently default.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique UUID of the AI provider',
  })
  @ApiResponse({
    status: 200,
    description: 'AI provider deleted successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Provider is default or has historical references and cannot be deleted.',
  })
  @ApiNotFoundResponse({
    description: 'AI provider not found.',
  })
  @ApiForbiddenResponse({
    description: 'Access denied. Requires ADMIN role.',
  })
  async deleteProvider(@Param('id') id: string) {
    return this.providersService.deleteProvider(id);
  }

  @Get(':id/health')
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Perform active health check on target AI provider (ADMIN only)',
    description:
      'Decrypts API key in memory, sends a ping request to the provider gateway, measures latency, and returns HEALTHY or UNHEALTHY without exposing key details.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique UUID of the AI provider',
  })
  @ApiResponse({
    status: 200,
    description: 'Health check result returned successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Provider is disabled or missing configuration.',
  })
  @ApiNotFoundResponse({
    description: 'AI provider not found.',
  })
  @ApiForbiddenResponse({
    description: 'Access denied. Requires ADMIN role.',
  })
  async checkHealth(@Param('id') id: string) {
    return this.healthService.checkHealth(id);
  }
}

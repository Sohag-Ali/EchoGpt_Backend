import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user active subscription details' })
  @ApiResponse({
    status: 200,
    description: 'Subscription fetched successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token or HttpOnly cookie missing, expired, or invalid.',
  })
  @ApiNotFoundResponse({
    description: 'Subscription record not found.',
  })
  async getMySubscription(@CurrentUser('id') userId: string) {
    return this.subscriptionsService.getMySubscription(userId);
  }

  @Get('usage')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current subscription request limits and usage' })
  @ApiResponse({
    status: 200,
    description: 'Subscription usage retrieved successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token or HttpOnly cookie missing, expired, or invalid.',
  })
  @ApiNotFoundResponse({
    description: 'Subscription record not found.',
  })
  async getSubscriptionUsage(@CurrentUser('id') userId: string) {
    return this.subscriptionsService.getSubscriptionUsage(userId);
  }

  @Post('upgrade')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Initiate subscription upgrade (payment required)' })
  @ApiResponse({
    status: 200,
    description: 'Upgrade initiated. Payment confirmation is required.',
  })
  @ApiConflictResponse({
    description: 'User is already on the PREMIUM plan.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token or HttpOnly cookie missing, expired, or invalid.',
  })
  async upgradeSubscription(@CurrentUser('id') userId: string) {
    return this.subscriptionsService.upgradeSubscription(userId);
  }

  @Post('downgrade')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Downgrade subscription plan to FREE' })
  @ApiResponse({
    status: 200,
    description: 'Subscription downgraded to FREE successfully.',
  })
  @ApiBadRequestResponse({
    description: 'User is already on the FREE plan.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token or HttpOnly cookie missing, expired, or invalid.',
  })
  async downgradeSubscription(@CurrentUser('id') userId: string) {
    return this.subscriptionsService.downgradeSubscription(userId);
  }
}

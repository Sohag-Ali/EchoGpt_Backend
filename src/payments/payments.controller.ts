import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ExecutePaymentDto } from './dto/execute-payment.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Verify & execute bKash payment server-side, upgrading subscription to PREMIUM',
  })
  @ApiResponse({
    status: 200,
    description:
      'Payment verified and executed successfully. Subscription upgraded to PREMIUM.',
  })
  @ApiBadRequestResponse({
    description: 'Payment execution failed with bKash gateway.',
  })
  @ApiForbiddenResponse({
    description: 'User is not authorized to confirm this payment.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token or HttpOnly cookie missing, expired, or invalid.',
  })
  async executePayment(
    @CurrentUser('id') userId: string,
    @Body() dto: ExecutePaymentDto,
  ) {
    return this.paymentsService.executePayment(userId, dto);
  }

  @Get('bkash/callback')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'bKash Checkout redirect callback handler (Public)' })
  @ApiResponse({
    status: 200,
    description: 'bKash callback processed.',
  })
  async bkashCallbackGet(
    @Query('paymentID') paymentID: string,
    @Query('status') status: string,
  ) {
    return this.paymentsService.handleBkashCallback(paymentID, status);
  }

  @Post('bkash/callback')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'bKash Checkout POST callback handler (Public)' })
  @ApiResponse({
    status: 200,
    description: 'bKash callback processed.',
  })
  async bkashCallbackPost(
    @Body('paymentID') paymentID: string,
    @Body('status') status: string,
  ) {
    return this.paymentsService.handleBkashCallback(paymentID, status);
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user payment history' })
  @ApiResponse({
    status: 200,
    description: 'User payment history retrieved successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized access.',
  })
  async getMyPayments(@CurrentUser('id') userId: string) {
    return this.paymentsService.getMyPayments(userId);
  }
}

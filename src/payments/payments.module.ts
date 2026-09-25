import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { BkashService } from './bkash.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, BkashService],
  exports: [PaymentsService, BkashService],
})
export class PaymentsModule {}

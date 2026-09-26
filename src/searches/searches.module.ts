import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SearchesController } from './searches.controller';
import { SearchesService } from './searches.service';
import { WebSearchProviderService } from './providers/web-search-provider.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [ConfigModule, SubscriptionsModule],
  controllers: [SearchesController],
  providers: [SearchesService, WebSearchProviderService],
  exports: [SearchesService, WebSearchProviderService],
})
export class SearchesModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SearchesController } from './searches.controller';
import { SearchesService } from './searches.service';
import { WebSearchProviderService } from './providers/web-search-provider.service';
import { SearchCacheService } from './services/search-cache.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [ConfigModule, SubscriptionsModule],
  controllers: [SearchesController],
  providers: [SearchesService, WebSearchProviderService, SearchCacheService],
  exports: [SearchesService, WebSearchProviderService, SearchCacheService],
})
export class SearchesModule {}

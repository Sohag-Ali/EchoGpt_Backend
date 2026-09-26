import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { WebSearchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { WebSearchProviderService } from './providers/web-search-provider.service';
import { SearchCacheService } from './services/search-cache.service';
import { SearchDto } from './dto/search.dto';
import {
  RecentSearchesQueryDto,
  SearchHistoryQueryDto,
} from './dto/search-query.dto';

@Injectable()
export class SearchesService {
  private readonly logger = new Logger(SearchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webSearchProvider: WebSearchProviderService,
    private readonly searchCacheService: SearchCacheService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * 1. POST /api/v1/search - Execute Web Search with Redis Caching
   */
  async executeSearch(userId: string, dto: SearchDto) {
    const query = (dto.query || '').trim();

    if (!query) {
      throw new BadRequestException('Search query is required and cannot be empty.');
    }

    // 1. Enforce Subscription Usage Limit pre-execution gate
    await this.subscriptionsService.enforceUsageLimit(userId);

    const startTime = Date.now();
    let cacheHit = false;

    // 2. Check Redis Cache First
    let searchResult = await this.searchCacheService.get(query);

    if (searchResult) {
      cacheHit = true;
    } else {
      // 3. Redis MISS -> Call External Search Provider
      searchResult = await this.webSearchProvider.search(query, {
        limit: 10,
      });

      // Cache successful response asynchronously
      await this.searchCacheService.set(query, searchResult);
    }

    const latencyMs = Date.now() - startTime;

    // 4. Save Search History for Authenticated User
    const record = await this.prisma.webSearch.create({
      data: {
        userId,
        query,
        results: searchResult.results as any,
        status: WebSearchStatus.COMPLETED,
        latencyMs,
      },
    });

    // 5. Increment Subscription Usage
    await this.subscriptionsService.incrementUsage(userId, 1);

    // 6. Log API Usage Audit with Cache Indicator
    await this.prisma.apiUsageLog.create({
      data: {
        userId,
        modelName: `web-search-engine${cacheHit ? ' (cache)' : ''}`,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: cacheHit ? 0.0 : 0.001,
        endpoint: '/api/v1/search',
        latencyMs,
      },
    });

    this.logger.log(
      `Web Search completed [${cacheHit ? 'CACHE HIT' : 'CACHE MISS'}] for user [${userId}] query: "${query}" in ${latencyMs}ms. Results: ${searchResult.results.length}`,
    );

    return {
      success: true,
      message: 'Search completed successfully',
      data: {
        id: record.id,
        query: record.query,
        results: searchResult.results,
        cacheHit,
        createdAt: record.createdAt,
      },
    };
  }

  /**
   * 2. GET /api/v1/search/history - Paginated User Search History
   */
  async getUserSearchHistory(userId: string, query: SearchHistoryQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.webSearch.count({
        where: { userId },
      }),
      this.prisma.webSearch.findMany({
        where: { userId },
        select: {
          id: true,
          query: true,
          results: true,
          status: true,
          latencyMs: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      success: true,
      message: 'Search history fetched successfully',
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  /**
   * 3. GET /api/v1/search/recent - Unique Recent User Searches
   */
  async getRecentSearches(userId: string, query: RecentSearchesQueryDto) {
    const limit = query.limit || 10;

    const recentSearches = await this.prisma.webSearch.findMany({
      where: { userId },
      select: {
        query: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 3, // Over-fetch to deduplicate in-memory
    });

    const uniqueMap = new Map<string, Date>();
    for (const item of recentSearches) {
      if (!uniqueMap.has(item.query)) {
        uniqueMap.set(item.query, item.createdAt);
      }
      if (uniqueMap.size >= limit) break;
    }

    const data = Array.from(uniqueMap.entries()).map(([q, createdAt]) => ({
      query: q,
      createdAt,
    }));

    return {
      success: true,
      message: 'Recent searches fetched successfully',
      data,
    };
  }

  /**
   * 4. GET /api/v1/search/suggestions - User Search Autocomplete Suggestions
   */
  async getSearchSuggestions(userId: string, qPrefix?: string) {
    const prefix = (qPrefix || '').trim();

    if (!prefix || prefix.length < 1) {
      return {
        success: true,
        message: 'Search suggestions fetched successfully',
        data: [],
      };
    }

    const matches = await this.prisma.webSearch.findMany({
      where: {
        userId,
        query: {
          contains: prefix,
          mode: 'insensitive',
        },
      },
      select: {
        query: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const uniqueSuggestions = Array.from(
      new Set(matches.map((m) => m.query)),
    ).slice(0, 10);

    return {
      success: true,
      message: 'Search suggestions fetched successfully',
      data: uniqueSuggestions,
    };
  }
}

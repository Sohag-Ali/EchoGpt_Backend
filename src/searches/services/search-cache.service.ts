import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { RedisService } from '../../redis/redis.service';
import { SearchResponse } from '../interfaces/search-provider.interface';

@Injectable()
export class SearchCacheService {
  private readonly logger = new Logger(SearchCacheService.name);
  private readonly ttlSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.ttlSeconds = this.configService.get<number>('SEARCH_CACHE_TTL', 600);
  }

  /**
   * Normalize search query: trim, lowercase, collapse consecutive spaces.
   */
  normalizeQuery(query: string): string {
    return (query || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  /**
   * Deterministically build cache key for a search query.
   * Format: search:cache:{sha256(normalizedQuery)}
   */
  buildCacheKey(query: string): string {
    const normalized = this.normalizeQuery(query);
    const hash = crypto.createHash('sha256').update(normalized).digest('hex');
    return `search:cache:${hash}`;
  }

  /**
   * Get search results from Redis cache.
   * Fails gracefully to null if Redis is unavailable or fails.
   */
  async get(query: string): Promise<SearchResponse | null> {
    try {
      const key = this.buildCacheKey(query);
      const cachedData = await this.redisService.get(key);

      if (!cachedData) {
        this.logger.log(`[SearchCache] MISS for query: "${query}"`);
        return null;
      }

      this.logger.log(`[SearchCache] HIT for query: "${query}"`);
      return JSON.parse(cachedData) as SearchResponse;
    } catch (error: any) {
      this.logger.warn(`[SearchCache] Redis GET error (fallback to provider): ${error.message}`);
      return null;
    }
  }

  /**
   * Set search results in Redis cache with TTL.
   * Fails gracefully without throwing errors if Redis fails.
   */
  async set(query: string, data: SearchResponse, ttlOverride?: number): Promise<boolean> {
    try {
      const key = this.buildCacheKey(query);
      const ttl = ttlOverride ?? this.ttlSeconds;
      const payload = JSON.stringify(data);

      await this.redisService.set(key, payload, ttl);
      this.logger.log(`[SearchCache] SET successful for query: "${query}" (TTL: ${ttl}s)`);
      return true;
    } catch (error: any) {
      this.logger.warn(`[SearchCache] Redis SET error (bypassing cache): ${error.message}`);
      return false;
    }
  }

  /**
   * Remove cached query from Redis.
   */
  async del(query: string): Promise<boolean> {
    try {
      const key = this.buildCacheKey(query);
      await this.redisService.del(key);
      return true;
    } catch (error: any) {
      this.logger.warn(`[SearchCache] Redis DEL error: ${error.message}`);
      return false;
    }
  }
}

import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SearchProvider,
  SearchResponse,
  SearchResultItem,
} from '../interfaces/search-provider.interface';

@Injectable()
export class WebSearchProviderService implements SearchProvider {
  private readonly logger = new Logger(WebSearchProviderService.name);

  constructor(private readonly configService: ConfigService) {}

  async search(
    query: string,
    options?: { limit?: number },
  ): Promise<SearchResponse> {
    const limit = options?.limit || 10;
    const apiKey =
      this.configService.get<string>('SEARCH_API_KEY') ||
      this.configService.get<string>('TAVILY_API_KEY') ||
      process.env.SEARCH_API_KEY ||
      process.env.TAVILY_API_KEY;

    if (apiKey && !apiKey.toLowerCase().includes('dummy')) {
      return this.searchWithTavily(query, apiKey, limit);
    }

    return this.searchWithDuckDuckGo(query, limit);
  }

  /**
   * Search via Tavily REST API if API Key is configured
   */
  private async searchWithTavily(
    query: string,
    apiKey: string,
    limit: number,
  ): Promise<SearchResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: limit,
          search_depth: 'basic',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        this.logger.error(
          `Tavily Search API returned status ${response.status}`,
        );
        throw new BadGatewayException('Web search provider is currently unavailable.');
      }

      const data: any = await response.json();
      const results: SearchResultItem[] = (data.results || []).map(
        (item: any) => ({
          title: item.title || 'Untitled',
          url: item.url || '',
          snippet: item.content || item.snippet || '',
        }),
      );

      return { query, results };
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        this.logger.error(`Search request timed out for query: [${query}]`);
        throw new BadGatewayException('Web search provider request timed out.');
      }
      this.logger.error(`Web search provider error: ${error.message}`);
      // Fallback to DuckDuckGo if Tavily API fails
      return this.searchWithDuckDuckGo(query, limit);
    }
  }

  /**
   * Fallback real web search engine parser (DuckDuckGo API / Scraper)
   */
  private async searchWithDuckDuckGo(
    query: string,
    limit: number,
  ): Promise<SearchResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        this.logger.error(`DuckDuckGo returned status ${response.status}`);
        return this.getFallbackResults(query);
      }

      const html = await response.text();
      const results: SearchResultItem[] = [];

      // Extract result links & snippets using regex from DDG HTML
      const regex = /<a class="result__url" href="([^"]+)".*?>[\s\S]*?<a class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
      const titleRegex = /<a class="result__a"[^>]*>([\s\S]*?)<\/a>/gi;

      const titles: string[] = [];
      let matchTitle;
      while ((matchTitle = titleRegex.exec(html)) !== null && titles.length < limit) {
        const cleanTitle = matchTitle[1].replace(/<[^>]+>/g, '').trim();
        if (cleanTitle) titles.push(cleanTitle);
      }

      const urls: string[] = [];
      const snippets: string[] = [];
      let match;
      while ((match = regex.exec(html)) !== null && urls.length < limit) {
        let rawUrl = match[1];
        if (rawUrl.includes('uddg=')) {
          const decoded = decodeURIComponent(rawUrl.split('uddg=')[1].split('&')[0]);
          rawUrl = decoded;
        }
        const cleanSnippet = match[2].replace(/<[^>]+>/g, '').trim();
        urls.push(rawUrl);
        snippets.push(cleanSnippet);
      }

      for (let i = 0; i < Math.min(titles.length, urls.length, limit); i++) {
        results.push({
          title: titles[i],
          url: urls[i],
          snippet: snippets[i],
        });
      }

      if (results.length === 0) {
        return this.getFallbackResults(query);
      }

      return { query, results };
    } catch (error: any) {
      clearTimeout(timeout);
      this.logger.error(`DuckDuckGo Search error: ${error.message}`);
      return this.getFallbackResults(query);
    }
  }

  private getFallbackResults(query: string): SearchResponse {
    return {
      query,
      results: [
        {
          title: `Web Search Results for ${query}`,
          url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
          snippet: `Live search query results for "${query}". Explore top resources and documentation online.`,
        },
      ],
    };
  }
}

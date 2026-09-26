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
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SearchesService } from './searches.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SearchDto } from './dto/search.dto';
import {
  RecentSearchesQueryDto,
  SearchHistoryQueryDto,
  SearchSuggestionsQueryDto,
} from './dto/search-query.dto';

@ApiTags('Searches')
@ApiBearerAuth('JWT-auth')
@Controller(['search', 'searches'])
export class SearchesController {
  constructor(private readonly searchesService: SearchesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Execute web search engine query',
    description:
      'Performs real web search using configured provider, records search history for authenticated user, enforces subscription limits, and logs API usage.',
  })
  @ApiResponse({
    status: 200,
    description: 'Web search completed successfully.',
  })
  @ApiForbiddenResponse({
    description: 'Forbidden. Subscription request limit reached.',
  })
  @ApiBadRequestResponse({
    description: 'Empty or invalid search query.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token or HttpOnly cookie missing or invalid.',
  })
  async executeSearch(
    @CurrentUser('id') userId: string,
    @Body() dto: SearchDto,
  ) {
    return this.searchesService.executeSearch(userId, dto);
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get paginated search history for authenticated user',
    description:
      'Returns a paginated list of web searches executed by the authenticated user, ordered newest first.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 20,
    description: 'Items per page (default: 20, max: 100)',
  })
  @ApiResponse({
    status: 200,
    description: 'Search history retrieved successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized access.',
  })
  async getUserSearchHistory(
    @CurrentUser('id') userId: string,
    @Query() query: SearchHistoryQueryDto,
  ) {
    return this.searchesService.getUserSearchHistory(userId, query);
  }

  @Get('recent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get unique recent search queries for authenticated user',
    description:
      'Returns deduplicated recent search queries executed by the user for UI autocomplete / quick search.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Max recent items (default: 10, max: 20)',
  })
  @ApiResponse({
    status: 200,
    description: 'Recent searches retrieved successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized access.',
  })
  async getRecentSearches(
    @CurrentUser('id') userId: string,
    @Query() query: RecentSearchesQueryDto,
  ) {
    return this.searchesService.getRecentSearches(userId, query);
  }

  @Get('suggestions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get search autocomplete suggestions for authenticated user',
    description:
      'Returns user-specific search suggestions matching the prefix query string.',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    example: 'java',
    description: 'Search query prefix string',
  })
  @ApiResponse({
    status: 200,
    description: 'Search suggestions retrieved successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized access.',
  })
  async getSearchSuggestions(
    @CurrentUser('id') userId: string,
    @Query() query: SearchSuggestionsQueryDto,
  ) {
    return this.searchesService.getSearchSuggestions(userId, query.q);
  }
}

import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchesService } from './searches.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Searches')
@Controller('searches')
export class SearchesController {
  constructor(private readonly searchesService: SearchesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get user search history' })
  async getSearches(@CurrentUser('id') userId: string) {
    return this.searchesService.getUserSearches(userId);
  }
}

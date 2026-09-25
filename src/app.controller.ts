import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class AppController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Backend Health Check' })
  @ApiResponse({
    status: 200,
    description: 'Backend service is up and running.',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2026-09-25T09:17:18.000Z' },
        service: { type: 'string', example: 'EchoGPT Backend API' },
        version: { type: 'string', example: '1.0.0' },
      },
    },
  })
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'EchoGPT Backend API',
      version: '1.0.0',
    };
  }
}

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { TestValidationDto } from './common/dto/test-validation.dto';

@ApiTags('Health & System Testing')
@Controller()
export class AppController {
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Backend Health Check' })
  @ApiResponse({
    status: 200,
    description: 'Backend service is up and running.',
  })
  getHealth() {
    return {
      success: true,
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'EchoGPT Backend API',
      version: '1.0.0',
    };
  }

  @Public()
  @Post('test-validation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test Request Validation Pipeline' })
  testValidation(@Body() dto: TestValidationDto) {
    return {
      success: true,
      message: 'Request payload passed validation successfully.',
      data: dto,
    };
  }

  @Public()
  @Get('test-errors/unauthorized')
  @ApiOperation({ summary: 'Demonstrate Unauthorized Error (401)' })
  testUnauthorized() {
    throw new UnauthorizedException('Authentication token is missing or expired.');
  }

  @Public()
  @Get('test-errors/forbidden')
  @ApiOperation({ summary: 'Demonstrate Forbidden Error (403)' })
  testForbidden() {
    throw new ForbiddenException('You do not have permission to access this resource.');
  }

  @Public()
  @Get('test-errors/not-found')
  @ApiOperation({ summary: 'Demonstrate Not Found Error (404)' })
  testNotFound() {
    throw new NotFoundException('The requested resource was not found.');
  }

  @Public()
  @Get('test-errors/internal')
  @ApiOperation({ summary: 'Demonstrate Internal Server Error (500)' })
  testInternalError() {
    throw new Error('Simulated database connection crash or unexpected runtime failure.');
  }
}

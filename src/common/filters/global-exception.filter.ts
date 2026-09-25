import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

export interface ErrorResponseBody {
  success: boolean;
  statusCode: number;
  message: string | string[];
  errors?: any;
  path: string;
  timestamp: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction = process.env.NODE_ENV === 'production';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errors: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resObj = exceptionResponse as Record<string, any>;
        message = resObj.message || exception.message;
        errors = resObj.errors || resObj.error || undefined;
      } else if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled Exception at [${request.method} ${request.url}]: ${exception.message}`,
        exception.stack,
      );
      // Mask internal exception messages in production
      message = isProduction ? 'Internal server error' : exception.message;
    } else {
      this.logger.error(
        `Unknown Exception thrown at [${request.method} ${request.url}]`,
        JSON.stringify(exception),
      );
      message = 'Internal server error';
    }

    if (status >= 500) {
      this.logger.error(`[${request.method}] ${request.url} - Status ${status}`);
    } else {
      this.logger.warn(`[${request.method}] ${request.url} - Status ${status}`);
    }

    const responseBody: ErrorResponseBody = {
      success: false,
      statusCode: status,
      message,
      ...(errors !== undefined && { errors }),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(responseBody);
  }
}

// Backward compatibility alias
export { GlobalExceptionFilter as HttpExceptionFilter };

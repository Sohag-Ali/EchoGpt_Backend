import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      const errorMessage =
        info?.name === 'TokenExpiredError'
          ? 'Authentication token has expired. Please log in again.'
          : info?.name === 'JsonWebTokenError'
            ? 'Invalid authentication token signature.'
            : err?.message || 'Authentication token is required to access this resource.';

      throw err || new UnauthorizedException(errorMessage);
    }
    return user;
  }
}

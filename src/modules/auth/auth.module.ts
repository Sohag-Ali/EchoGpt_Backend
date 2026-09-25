import { Module } from '@nestjs/common';
import { AuthModule as CoreAuthModule } from '../../core/auth/auth.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [CoreAuthModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}

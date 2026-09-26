import { Global, Module } from '@nestjs/common';
import { UsageLogsService } from './usage-logs.service';

@Global()
@Module({
  providers: [UsageLogsService],
  exports: [UsageLogsService],
})
export class UsageLogsModule {}

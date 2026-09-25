import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { EmailTemplateService } from './template.service';

@Global()
@Module({
  providers: [EmailTemplateService, MailService],
  exports: [MailService, EmailTemplateService],
})
export class MailModule {}

// Backward compatibility alias
export { MailModule as EmailModule };

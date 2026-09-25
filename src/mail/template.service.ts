import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmailTemplateService {
  private readonly logger = new Logger(EmailTemplateService.name);
  private readonly templateDir: string;

  constructor() {
    // Resolve template directory relative to root project structure
    this.templateDir = path.join(process.cwd(), 'src', 'templates', 'email');
  }

  /**
   * Load an HTML template file and replace dynamic placeholders like {{key}}.
   */
  renderTemplate(templateName: string, variables: Record<string, string>): string {
    const fileName = templateName.endsWith('.html') ? templateName : `${templateName}.html`;
    const filePath = path.join(this.templateDir, fileName);

    try {
      if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');

        Object.entries(variables).forEach(([key, value]) => {
          const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
          content = content.replace(regex, value || '');
        });

        return content;
      }
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Error loading email template [${fileName}]: ${error.message}`);
    }

    // Dynamic Fallback HTML if template file cannot be loaded
    return this.renderFallbackTemplate(templateName, variables);
  }

  private renderFallbackTemplate(templateName: string, variables: Record<string, string>): string {
    const name = variables.name || 'User';
    if (templateName.includes('verification')) {
      return `<h2>Welcome ${name}!</h2><p>Please verify your email: <a href="${variables.verificationUrl}">Verify Email</a></p>`;
    }
    if (templateName.includes('forgot-password')) {
      return `<h2>Hello ${name}</h2><p>Your password reset OTP code is: <strong>${variables.otp}</strong> (Expires in ${variables.expiresIn}).</p>`;
    }
    if (templateName.includes('password-reset-success')) {
      return `<h2>Hello ${name}</h2><p>Your password has been reset successfully. All active sessions have been logged out.</p>`;
    }
    return `<h2>Hello ${name}</h2><p>Welcome to EchoGPT!</p>`;
  }
}

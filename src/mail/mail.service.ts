import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailTemplateService } from './template.service';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend | null = null;

  /* Legacy Nodemailer Transporter (commented out for potential rollback)
  private transporter: any | null = null;
  */

  constructor(
    private readonly configService: ConfigService,
    private readonly templateService: EmailTemplateService,
  ) { }

  onModuleInit() {
    const apiKey =
      this.configService.get<string>('resend.apiKey') ||
      process.env.RESEND_API_KEY;

    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log('Resend Email Client initialized successfully');
    } else {
      this.logger.warn(
        'RESEND_API_KEY credentials not configured. Email messages will be logged to console in dev mode.',
      );
    }

    /* Legacy Nodemailer Transporter Setup (commented out for potential rollback)
    const smtpHost = this.configService.get<string>(
      'smtp.host',
      'smtp.gmail.com',
    );
    const smtpPort = this.configService.get<number>('smtp.port', 587);
    const smtpUser = this.configService.get<string>('smtp.user');
    const smtpPassword = this.configService.get<string>('smtp.password');

    if (smtpUser && smtpPassword) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      });
      this.logger.log(
        `SMTP Email Transporter initialized for [${smtpHost}:${smtpPort}] user: ${smtpUser}`,
      );
    } else {
      this.logger.warn(
        'SMTP credentials not configured. Email messages will be logged to console in dev mode.',
      );
    }
    */
  }

  /**
   * Send Registration 6-Digit OTP code.
   */
  async sendRegistrationOtpEmail(toEmail: string, otp: string, name: string) {
    const htmlContent = this.templateService.renderTemplate(
      'registration-otp',
      {
        name,
        otp,
        expiresIn: '5 minutes',
      },
    );

    await this.dispatchEmail(
      toEmail,
      'Your EchoGPT Account Registration Verification OTP',
      htmlContent,
    );
  }

  /**
   * Send Email Verification link to user.
   */
  async sendVerificationEmail(
    toEmail: string,
    verificationToken: string,
    name: string,
  ) {
    const frontendUrl = this.configService.get<string>(
      'app.frontendUrl',
      'http://localhost:3000',
    );
    const verificationUrl = `${frontendUrl}/verify-email?token=${verificationToken}`;

    const htmlContent = this.templateService.renderTemplate(
      'verification-email',
      {
        name,
        verificationUrl,
        expiresIn: '24 hours',
      },
    );

    await this.dispatchEmail(
      toEmail,
      'Verify your EchoGPT account',
      htmlContent,
    );
  }

  /**
   * Send Password Reset 6-Digit OTP code.
   */
  async sendPasswordResetEmail(toEmail: string, otp: string, name: string) {
    const htmlContent = this.templateService.renderTemplate('forgot-password', {
      name,
      otp,
      expiresIn: '5 minutes',
    });

    await this.dispatchEmail(
      toEmail,
      'Your EchoGPT Password Reset Verification Code',
      htmlContent,
    );
  }

  /**
   * Send Password Reset Success notification.
   */
  async sendPasswordResetSuccessEmail(toEmail: string, name: string) {
    const htmlContent = this.templateService.renderTemplate(
      'password-reset-success',
      {
        name,
      },
    );

    await this.dispatchEmail(
      toEmail,
      'EchoGPT Password Reset Successful',
      htmlContent,
    );
  }

  /**
   * Send Welcome Email to verified user.
   */
  async sendWelcomeEmail(toEmail: string, name: string) {
    const htmlContent = this.templateService.renderTemplate('welcome-email', {
      name,
    });

    await this.dispatchEmail(
      toEmail,
      'Welcome to EchoGPT!',
      htmlContent,
    );
  }

  /**
   * Internal helper to dispatch email via Resend API or log to dev console.
   */
  private async dispatchEmail(
    to: string,
    subject: string,
    html: string,
  ) {
    if (this.resend) {
      try {
        // TODO: Change 'EchoGPT <noreply@mail.sohagali.me>' to a verified custom domain sender (e.g. 'EchoGPT <noreply@yourdomain.com>') before going fully live.
        // onboarding@resend.dev only allows sending to the Resend account owner's email during testing.
        const { data, error } = await this.resend.emails.send({
          from: 'EchoGPT <noreply@mail.sohagali.me>',
          to,
          subject,
          html,
        });

        if (error) {
          this.logger.error(
            `Failed to send email [${subject}] to ${to} via Resend API: ${error.name} - ${error.message}`,
          );
          throw new Error(`Resend API error: ${error.message}`);
        }

        this.logger.log(
          `Dispatched email [${subject}] to: ${to} (Resend ID: ${data?.id})`,
        );
      } catch (err) {
        const error = err as Error;
        this.logger.error(
          `Failed to send email [${subject}] to ${to}: ${error.message}`,
        );
        throw error;
      }
    } else {
      this.logger.log(`[DEV MODE EMAIL] Subject: "${subject}" | To: ${to}`);
    }
  }
}

// Backward compatibility alias
export { MailService as EmailService };

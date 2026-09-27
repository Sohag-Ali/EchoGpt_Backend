import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailTemplateService } from './template.service';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly templateService: EmailTemplateService,
  ) {}

  onModuleInit() {
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
  }

  /**
   * Send Registration 6-Digit OTP code.
   */
  async sendRegistrationOtpEmail(toEmail: string, otp: string, name: string) {
    const sender = this.configService.get<string>(
      'smtp.sender',
      'noreply@echogpt.io',
    );

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
      sender,
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
    const sender = this.configService.get<string>(
      'smtp.sender',
      'noreply@echogpt.io',
    );

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
      sender,
    );
  }

  /**
   * Send Password Reset 6-Digit OTP code.
   */
  async sendPasswordResetEmail(toEmail: string, otp: string, name: string) {
    const sender = this.configService.get<string>(
      'smtp.sender',
      'noreply@echogpt.io',
    );

    const htmlContent = this.templateService.renderTemplate('forgot-password', {
      name,
      otp,
      expiresIn: '5 minutes',
    });

    await this.dispatchEmail(
      toEmail,
      'Your EchoGPT Password Reset Verification Code',
      htmlContent,
      sender,
    );
  }

  /**
   * Send Password Reset Success notification.
   */
  async sendPasswordResetSuccessEmail(toEmail: string, name: string) {
    const sender = this.configService.get<string>(
      'smtp.sender',
      'noreply@echogpt.io',
    );

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
      sender,
    );
  }

  /**
   * Send Welcome Email to verified user.
   */
  async sendWelcomeEmail(toEmail: string, name: string) {
    const sender = this.configService.get<string>(
      'smtp.sender',
      'noreply@echogpt.io',
    );

    const htmlContent = this.templateService.renderTemplate('welcome-email', {
      name,
    });

    await this.dispatchEmail(
      toEmail,
      'Welcome to EchoGPT!',
      htmlContent,
      sender,
    );
  }

  /**
   * Internal helper to dispatch email via SMTP transporter or log to dev console.
   */
  private async dispatchEmail(
    to: string,
    subject: string,
    html: string,
    sender: string,
  ) {
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: `"EchoGPT" <${sender}>`,
          to,
          subject,
          html,
        });
        this.logger.log(`Dispatched email [${subject}] to: ${to}`);
      } catch (err) {
        const error = err as Error;
        this.logger.error(
          `Failed to send email [${subject}] to ${to}: ${error.message}`,
        );
      }
    } else {
      this.logger.log(`[DEV MODE EMAIL] Subject: "${subject}" | To: ${to}`);
    }
  }
}

// Backward compatibility alias
export { MailService as EmailService };

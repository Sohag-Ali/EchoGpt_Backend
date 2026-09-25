import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const smtpUser = this.configService.get<string>('smtp.user');
    const smtpPassword = this.configService.get<string>('smtp.password');

    if (smtpUser && smtpPassword) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      });
      this.logger.log(`SMTP Email Transporter initialized for: ${smtpUser}`);
    } else {
      this.logger.warn('SMTP credentials not configured. Verification links and OTPs will be logged to console in dev mode.');
    }
  }

  /**
   * Send Email Verification link to newly registered user.
   */
  async sendVerificationEmail(toEmail: string, rawToken: string, name: string) {
    const frontendUrl = this.configService.get<string>('app.frontendUrl', 'http://localhost:3000');
    const verificationUrl = `${frontendUrl}/verify-email?token=${rawToken}`;
    const sender = this.configService.get<string>('smtp.sender', 'noreply@echogpt.io');

    const subject = 'Verify your EchoGPT account';
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Welcome to EchoGPT, ${name}!</h2>
        <p>Thank you for registering. Please verify your email address to activate your account features.</p>
        <div style="margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Verify Email Address
          </a>
        </div>
        <p style="font-size: 12px; color: #666;">Or copy and paste this link into your browser: <br>${verificationUrl}</p>
        <p style="font-size: 12px; color: #999;">This verification link will expire in 24 hours.</p>
      </div>
    `;

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: `"EchoGPT" <${sender}>`,
          to: toEmail,
          subject,
          html: htmlContent,
        });
        this.logger.log(`Sent verification email to: ${toEmail}`);
      } catch (err) {
        const error = err as Error;
        this.logger.error(`Failed to send verification email to ${toEmail}: ${error.message}`);
      }
    } else {
      this.logger.log(`[DEV MODE EMAIL] Verification link for ${toEmail}: ${verificationUrl}`);
    }
  }

  /**
   * Send Password Reset 6-Digit OTP code.
   */
  async sendPasswordResetOtpEmail(toEmail: string, otp: string, name: string) {
    const sender = this.configService.get<string>('smtp.sender', 'noreply@echogpt.io');
    const subject = 'Your EchoGPT Password Reset Verification Code';

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Password Reset Request</h2>
        <p>Hello ${name},</p>
        <p>You requested to reset your EchoGPT account password. Use the 6-digit verification code below to proceed:</p>
        <div style="margin: 25px 0; background-color: #F3F4F6; padding: 16px; border-radius: 8px; text-align: center; letter-spacing: 6px; font-size: 28px; font-weight: bold; color: #4F46E5;">
          ${otp}
        </div>
        <p style="font-size: 12px; color: #666;">This code is valid for <strong>5 minutes</strong>. If you did not request this code, please ignore this email.</p>
      </div>
    `;

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: `"EchoGPT Security" <${sender}>`,
          to: toEmail,
          subject,
          html: htmlContent,
        });
        this.logger.log(`Sent password reset OTP email to: ${toEmail}`);
      } catch (err) {
        const error = err as Error;
        this.logger.error(`Failed to send password reset OTP email to ${toEmail}: ${error.message}`);
      }
    } else {
      this.logger.log(`[DEV MODE EMAIL] Password Reset OTP for ${toEmail}: ${otp}`);
    }
  }
}

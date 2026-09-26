import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyBuffer: Buffer;

  constructor(private readonly configService: ConfigService) {
    const rawKey =
      this.configService.get<string>('ai.encryptionKey') ||
      process.env.AI_PROVIDER_ENCRYPTION_KEY ||
      process.env.JWT_ACCESS_SECRET ||
      'echogpt-fallback-32-byte-secret-key-default!';

    // Derive a fixed 32-byte (256-bit) Buffer using SHA-256
    this.keyBuffer = crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Encrypt plaintext string using AES-256-GCM.
   * Returns formatted string: ivHex:authTagHex:encryptedHex
   */
  encrypt(plainText: string): string {
    if (!plainText) return '';

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.keyBuffer, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt cipher string (ivHex:authTagHex:encryptedHex) to plaintext.
   */
  decrypt(cipherText: string): string {
    if (!cipherText) return '';

    const parts = cipherText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted ciphertext format.');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.keyBuffer, iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

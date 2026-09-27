export default () => ({
  app: {
    environment: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '5000', 10),
    apiPrefix: process.env.API_PREFIX || 'api/v1',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    user: process.env.REDIS_USER || 'default',
    password: process.env.REDIS_PASSWORD || undefined,
  },
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    sender: process.env.EMAIL_SENDER || '',
  },
  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    googleGeminiApiKey: process.env.GOOGLE_GEMINI_API_KEY || '',
    encryptionKey:
      process.env.AI_PROVIDER_ENCRYPTION_KEY ||
      process.env.JWT_ACCESS_SECRET ||
      'echogpt-default-encryption-secret-32-chars-long!',
  },
  bkash: {
    baseUrl:
      process.env.BKASH_BASE_URL ||
      'https://tokenized.sandbox.bka.sh/v1.2.0-beta',
    username: process.env.BKASH_USERNAME || '',
    password: process.env.BKASH_PASSWORD || '',
    appKey: process.env.BKASH_APP_KEY || '',
    appSecret: process.env.BKASH_APP_SECRET || '',
    callbackUrl:
      process.env.BKASH_CALLBACK_URL ||
      'http://localhost:5000/api/v1/payments/bkash/callback',
    premiumPrice: parseFloat(process.env.BKASH_PREMIUM_PRICE || '500'),
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
});

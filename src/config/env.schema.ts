import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // Node Environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  // Application Server & API
  PORT: Joi.number().default(5000),
  API_PREFIX: Joi.string().default('api/v1'),
  FRONTEND_URL: Joi.string().default('http://localhost:3000'),

  // PostgreSQL Database Connection
  DATABASE_URL: Joi.string().required().messages({
    'any.required': 'DATABASE_URL environment variable is required for Prisma database connection.',
  }),

  // JWT Authentication Secrets & Expirations
  JWT_ACCESS_SECRET: Joi.string().required().messages({
    'any.required': 'JWT_ACCESS_SECRET environment variable is required.',
  }),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().required().messages({
    'any.required': 'JWT_REFRESH_SECRET environment variable is required.',
  }),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  BCRYPT_SALT_ROUNDS: Joi.number().default(10),

  // Redis Connection Credentials
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_USER: Joi.string().default('default'),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  // SMTP Email Server Config
  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().allow('').optional(),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASSWORD: Joi.string().allow('').optional(),
  EMAIL_SENDER: Joi.string().allow('').optional(),

  // Database Seed Credentials
  ADMIN_NAME: Joi.string().allow('').optional(),
  ADMIN_EMAIL: Joi.string().allow('').optional(),
  ADMIN_PASSWORD: Joi.string().allow('').optional(),
  USER_NAME: Joi.string().allow('').optional(),
  USER_EMAIL: Joi.string().allow('').optional(),
  USER_PASSWORD: Joi.string().allow('').optional(),

  // AI Provider Integration Keys
  OPENAI_API_KEY: Joi.string().allow('').optional(),
  ANTHROPIC_API_KEY: Joi.string().allow('').optional(),
  GOOGLE_GEMINI_API_KEY: Joi.string().allow('').optional(),
  AI_PROVIDER_ENCRYPTION_KEY: Joi.string().allow('').optional(),

  // bKash Payment Gateway Credentials
  BKASH_BASE_URL: Joi.string().allow('').optional(),
  BKASH_USERNAME: Joi.string().allow('').optional(),
  BKASH_PASSWORD: Joi.string().allow('').optional(),
  BKASH_APP_KEY: Joi.string().allow('').optional(),
  BKASH_APP_SECRET: Joi.string().allow('').optional(),
  BKASH_CALLBACK_URL: Joi.string().allow('').optional(),
  BKASH_PREMIUM_PRICE: Joi.number().default(500),

  // Search Provider & Cache Configuration
  SEARCH_API_KEY: Joi.string().allow('').optional(),
  SEARCH_API_BASE_URL: Joi.string().allow('').optional(),
  SEARCH_CACHE_TTL: Joi.number().default(600),
});

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) throw new Error(`Missing required env: ${key}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  appName: process.env.APP_NAME ?? 'Kashmiri Daal Chawal',
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  apiUrl: process.env.API_URL ?? 'http://localhost:4000',
  port: Number(process.env.API_PORT ?? 4000),
  databaseUrl: required('DATABASE_URL', 'postgresql://kdc:kdc_secret@localhost:5432/kashmiri_daal_chawal'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-in-production-32'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-in-production-32'),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  /** Comma-separated list, e.g. http://localhost:3000,http://localhost:3001 */
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000,http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 900000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 200),
  defaultBranchId: process.env.DEFAULT_BRANCH_ID ?? 'a0000000-0000-4000-8000-000000000001',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
  },
};

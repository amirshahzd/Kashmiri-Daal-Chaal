import { describe, it, expect, afterEach, vi } from 'vitest';

// Prevent the real .env files from contaminating these tests.
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
}));

describe('Environment configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('ENV-001: loads valid environment variables', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test_db');
    vi.stubEnv('JWT_ACCESS_SECRET', 'test-access-secret-123456789012345678');
    vi.stubEnv('JWT_REFRESH_SECRET', 'test-refresh-secret-123456789012345678');
    vi.stubEnv('PORT', '5000');

    vi.resetModules();

    const { env } = await import('../src/config/env');

    expect(env.databaseUrl).toBe(
      'postgresql://test:test@localhost:5432/test_db'
    );
    expect(env.port).toBe(5000);
    expect(env.jwtAccessSecret).toBe(
      'test-access-secret-123456789012345678'
    );
  });

  it('ENV-002: uses the default database URL when DATABASE_URL is missing', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATABASE_URL', 'temporary-test-value');

    delete process.env.DATABASE_URL;

    vi.resetModules();

    const { env } = await import('../src/config/env');

    expect(env.databaseUrl).toBe(
      'postgresql://kdc:kdc_secret@localhost:5432/kashmiri_daal_chawal'
    );
  });

  it('ENV-003: rejects missing DATABASE_URL in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'temporary-test-value');

    delete process.env.DATABASE_URL;

    vi.resetModules();

    await expect(
      import('../src/config/env')
    ).rejects.toThrow('Missing required env: DATABASE_URL');
  });
});
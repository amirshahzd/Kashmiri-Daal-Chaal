import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

vi.mock('../src/config/db', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), connect: vi.fn() },
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

describe('API health', () => {
  it('GET /health returns ok', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects unauthenticated dashboard', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/dashboard');
    expect(res.status).toBe(401);
  });
});

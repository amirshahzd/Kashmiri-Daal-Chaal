import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';

vi.mock('../../src/config/db', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: vi.fn(),
  },
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

function percentile(samples: number[], pct: number) {
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function hammer(url: string, connections: number, durationMs: number) {
  const samples: number[] = [];
  let errors = 0;
  const started = Date.now();

  async function worker() {
    while (Date.now() - started < durationMs) {
      const t0 = performance.now();
      const response = await fetch(url);
      samples.push(performance.now() - t0);
      if (response.status >= 500) errors += 1;
    }
  }

  await Promise.all(Array.from({ length: connections }, () => worker()));
  return { samples, errors };
}

describe('API performance budget', () => {
  it('keeps health and menu p95 under 200ms with no server errors', async () => {
    const app = createApp();
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No port');
    const base = `http://127.0.0.1:${address.port}`;

    try {
      for (const path of ['/health', '/api/v1/menu/items']) {
        const { samples, errors } = await hammer(`${base}${path}`, 20, 3000);
        const p95 = percentile(samples, 95);
        console.log(`${path} n=${samples.length} p95=${p95.toFixed(1)}ms errors=${errors}`);
        expect(errors).toBe(0);
        expect(p95).toBeLessThan(200);
        expect(samples.length).toBeGreaterThan(20);
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  }, 20000);
});

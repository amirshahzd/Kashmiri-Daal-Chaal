import { createApp } from './app';
import { env } from './config/env';
import { pool } from './config/db';

async function main() {
  const app = createApp();
  try {
    await pool.query('SELECT 1');
    console.log('✓ PostgreSQL connected');
  } catch (err) {
    console.warn('⚠ PostgreSQL not reachable yet — API will still start:', (err as Error).message);
  }

  app.listen(env.port, () => {
    console.log(`🍳 ${env.appName} API listening on :${env.port}`);
    console.log(`   Health: http://localhost:${env.port}/health`);
    console.log(`   Base:   http://localhost:${env.port}/api/v1`);
  });

  // Ensure default admin exists for file-store mode
  void import('./services/auth.service').then((m) => m.ensureDefaultStaffAccounts()).catch(() => undefined);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';

async function migrate() {
  const migrationsDir = path.resolve(__dirname, '../../../database/migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const file of files) {
    const applied = await pool.query(`SELECT 1 FROM schema_migrations WHERE filename = $1`, [file]);
    if (applied.rowCount) {
      console.log(`skip  ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`apply ${file}`);
    await pool.query(sql);
    await pool.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file]);
  }

  console.log('Migrations complete');
  await pool.end();
}

migrate().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});

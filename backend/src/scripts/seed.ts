import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db';

async function seed() {
  const seedsDir = path.resolve(__dirname, '../../../database/seeds');
  const files = fs.readdirSync(seedsDir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    console.log(`seed ${file}`);
    const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
    await pool.query(sql);
  }

  // Replace demo password hashes with real bcrypt(Password123!)
  const hash = await bcrypt.hash('Password123!', 12);
  await pool.query(
    `UPDATE users SET password_hash = $1
     WHERE email IN (
       'owner@kashmiridaalchawal.pk',
       'manager@kashmiridaalchawal.pk',
       'owner@kashmiridaalchawal.co.uk',
       'manager@kashmiridaalchawal.co.uk',
       'customer@example.com'
     )`,
    [hash]
  );

  console.log('Seed complete. Demo login: owner@kashmiridaalchawal.pk / Password123!');
  await pool.end();
}

seed().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});

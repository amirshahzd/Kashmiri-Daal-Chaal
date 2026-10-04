import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

vi.mock('../src/config/db', () => ({
  pool: {
    query: vi.fn().mockRejectedValue(new Error('database offline')),
    connect: vi.fn(),
  },
  query: vi.fn().mockRejectedValue(new Error('database offline')),
}));

const storePath = path.resolve(process.cwd(), 'data', 'auth-store.json');

function resetStore() {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(
    storePath,
    JSON.stringify({ users: [], customers: [], refresh_tokens: [], password_resets: [] })
  );
}

const customer = {
  email: 'route-customer@example.com',
  password: 'password123',
  firstName: 'Route',
  lastName: 'Customer',
  phone: '03001234567',
};

describe('auth routes', () => {
  beforeEach(() => {
    resetStore();
  });

  it('rejects an invalid registration', async () => {
    const res = await request(createApp()).post('/api/v1/auth/register').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('registers, logs in, and reads the profile', async () => {
    const app = createApp();
    const registered = await request(app).post('/api/v1/auth/register').send(customer);
    expect(registered.status).toBe(201);
    expect(registered.body.data.accessToken).toEqual(expect.any(String));

    const loggedIn = await request(app).post('/api/v1/auth/login').send({
      email: customer.email,
      password: customer.password,
    });
    expect(loggedIn.status).toBe(200);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loggedIn.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(customer.email);
  }, 20000);

  it('rejects /me without a token and a login with the wrong password', async () => {
    const app = createApp();
    await request(app).post('/api/v1/auth/register').send(customer);
    const missing = await request(app).get('/api/v1/auth/me');
    expect(missing.status).toBe(401);
    const bad = await request(app).post('/api/v1/auth/login').send({
      email: customer.email,
      password: 'wrong-password',
    });
    expect(bad.status).toBe(401);
  }, 20000);
});

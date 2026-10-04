import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/env', () => ({
  env: {
    jwtAccessSecret: 'test-access-secret',
    jwtRefreshSecret: 'test-refresh-secret',
    jwtAccessExpires: '15m',
    jwtRefreshExpires: '7d',
  },
}));

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  parseExpiryToMs,
  type AccessPayload,
} from '../src/utils/jwt';

const sampleUser = {
  id: 'user-1',
  email: 'someone@example.com',
  roles: ['customer'],
  permissions: ['order:read', 'order:create'],
  branchId: 'branch-1',
  firstName: 'Some',
  lastName: 'One',
} as unknown as Parameters<typeof signAccessToken>[0];

describe('signAccessToken / verifyAccessToken', () => {
  it('signs a token that verifies and carries the expected payload', () => {
    const token = signAccessToken(sampleUser);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // header.payload.signature

    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('someone@example.com');
    expect(payload.roles).toEqual(['customer']);
    expect(payload.permissions).toEqual(['order:read', 'order:create']);
    expect(payload.branchId).toBe('branch-1');
    expect(payload.firstName).toBe('Some');
    expect(payload.lastName).toBe('One');
  });

  it('omits branchId when the user has none', () => {
    const token = signAccessToken({ ...sampleUser, branchId: undefined });
    const payload = verifyAccessToken(token);
    expect(payload.branchId).toBeUndefined();
  });

  it('rejects a token signed with a different secret', () => {
    const foreign = jwt.sign({ sub: 'x' }, 'some-other-secret');
    expect(() => verifyAccessToken(foreign)).toThrow();
  });

  it('rejects a token signed with the refresh secret', () => {
    const refresh = signRefreshToken('user-1');
    expect(() => verifyAccessToken(refresh)).toThrow();
  });
});

describe('signRefreshToken / verifyRefreshToken', () => {
  it('signs and verifies a refresh token', () => {
    const token = signRefreshToken('user-2');
    const payload = verifyRefreshToken(token);

    expect(payload.sub).toBe('user-2');
  });

  it('rejects a refresh token signed with the access secret', () => {
    const access = signAccessToken(sampleUser);
    expect(() => verifyRefreshToken(access)).toThrow();
  });

  it('sets typ=refresh in the raw payload', () => {
    const token = signRefreshToken('user-3');
    const decoded = jwt.decode(token) as { sub: string; typ: string; iat: number; exp: number };

    expect(decoded.sub).toBe('user-3');
    expect(decoded.typ).toBe('refresh');
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });
});

describe('hashToken', () => {
  it('produces a stable SHA-256 hex digest', () => {
    const input = 'abc123';
    const expected = crypto.createHash('sha256').update(input).digest('hex');

    expect(hashToken(input)).toBe(expected);
    expect(hashToken(input)).toBe(expected); // deterministic
    expect(hashToken(input)).toHaveLength(64); // sha-256 hex = 64 chars
  });

  it('produces different hashes for different inputs', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('parseExpiryToMs', () => {
  it('parses seconds', () => {
    expect(parseExpiryToMs('30s')).toBe(30 * 1000);
  });

  it('parses minutes', () => {
    expect(parseExpiryToMs('15m')).toBe(15 * 60_000);
  });

  it('parses hours', () => {
    expect(parseExpiryToMs('2h')).toBe(2 * 3_600_000);
  });

  it('parses days', () => {
    expect(parseExpiryToMs('7d')).toBe(7 * 86_400_000);
  });

  it('falls back to 7 days for an unparseable value', () => {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(parseExpiryToMs('')).toBe(sevenDays);
    expect(parseExpiryToMs('not-a-duration')).toBe(sevenDays);
    expect(parseExpiryToMs('15x')).toBe(sevenDays);     // invalid unit
    expect(parseExpiryToMs('m15')).toBe(sevenDays);     // wrong order
    expect(parseExpiryToMs('15')).toBe(sevenDays);      // no unit
  });
});
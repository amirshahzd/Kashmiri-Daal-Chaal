import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { AuthUser } from '../types';

export interface AccessPayload {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  branchId?: string;
  firstName: string;
  lastName: string;
}

export function signAccessToken(user: AuthUser): string {
  const payload: AccessPayload = {
    sub: user.id,
    email: user.email,
    roles: user.roles,
    permissions: user.permissions,
    branchId: user.branchId,
    firstName: user.firstName,
    lastName: user.lastName,
  };
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: env.jwtAccessExpires } as jwt.SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: 'refresh' }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpires,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.jwtRefreshSecret) as { sub: string };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function parseExpiryToMs(expires: string): number {
  const match = expires.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2];
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
  return n * mult;
}

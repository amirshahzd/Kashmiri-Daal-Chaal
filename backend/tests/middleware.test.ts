import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  authenticate,
  errorHandler,
  optionalAuth,
  requirePermission,
  requireRoles,
  validate,
} from '../src/middleware';
import { AppError } from '../src/utils/errors';
import { signAccessToken } from '../src/utils/jwt';
import type { AuthUser, AuthedRequest } from '../src/types';

function user(roles: AuthUser['roles'], permissions: string[] = []): AuthUser {
  return {
    id: 'user-1',
    email: 'owner@example.com',
    firstName: 'A',
    lastName: 'B',
    roles,
    permissions,
    branchId: 'branch-1',
  };
}

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe('middleware', () => {
  it('rejects a missing token and accepts a bearer token', () => {
    const next = vi.fn() as NextFunction;
    const req = { headers: {}, cookies: {} } as AuthedRequest;
    authenticate(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));

    const okNext = vi.fn() as NextFunction;
    const token = signAccessToken(user(['owner'], ['orders.read']));
    const authed = { headers: { authorization: `Bearer ${token}` }, cookies: {} } as AuthedRequest;
    authenticate(authed, mockRes(), okNext);
    expect(authed.user?.email).toBe('owner@example.com');
    expect(okNext).toHaveBeenCalledWith();
  });

  it('accepts an access token from the cookie and ignores a bad optional token', () => {
    const token = signAccessToken(user(['customer']));
    const req = { headers: {}, cookies: { access_token: token } } as AuthedRequest;
    const next = vi.fn() as NextFunction;
    authenticate(req, mockRes(), next);
    expect(req.user?.roles).toEqual(['customer']);

    const optional = { headers: { authorization: 'Bearer not-a-token' }, cookies: {} } as AuthedRequest;
    const optionalNext = vi.fn() as NextFunction;
    optionalAuth(optional, mockRes(), optionalNext);
    expect(optional.user).toBeUndefined();
    expect(optionalNext).toHaveBeenCalledWith();
  });

  it('enforces roles and permissions, with an owner bypass', () => {
    const next = vi.fn() as NextFunction;
    const owner = { user: user(['owner'], []) } as AuthedRequest;
    requireRoles('manager')(owner, mockRes(), next);
    expect(next).toHaveBeenCalledWith();

    const denied = vi.fn() as NextFunction;
    requireRoles('manager')({ user: user(['cashier']) } as AuthedRequest, mockRes(), denied);
    expect((denied.mock.calls[0][0] as AppError).statusCode).toBe(403);

    const missing = vi.fn() as NextFunction;
    requirePermission('payroll.write')({ user: user(['cashier'], ['orders.read']) } as AuthedRequest, mockRes(), missing);
    expect((missing.mock.calls[0][0] as AppError).statusCode).toBe(403);
  });

  it('returns 400 for an invalid body and formats errors', () => {
    const next = vi.fn() as NextFunction;
    const req = { body: {} } as Request;
    validate(z.object({ email: z.string().email() }))(req, mockRes(), next);
    expect((next.mock.calls[0][0] as AppError).code).toBe('VALIDATION_ERROR');

    const res = mockRes();
    errorHandler(new AppError(404, 'MISSING', 'Gone'), {} as Request, res, vi.fn());
    expect(res.statusCode).toBe(404);

    const generic = mockRes();
    errorHandler(new Error('boom'), {} as Request, generic, vi.fn());
    expect(generic.statusCode).toBe(500);
  });
});

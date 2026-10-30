import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { AppError, ok, created } from '../src/utils/errors';

/**
 * Minimal fake Express Response whose .status() returns itself
 * (so it's chainable: res.status(200).json(body))
 */
function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('AppError', () => {
  it('stores statusCode, code and message', () => {
    const err = new AppError(400, 'BAD_INPUT', 'Bad input');

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe('AppError');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_INPUT');
    expect(err.message).toBe('Bad input');
    expect(err.details).toBeUndefined();
  });

  it('stores optional details when provided', () => {
    const details = { field: 'email', reason: 'invalid' };
    const err = new AppError(422, 'VALIDATION', 'Invalid payload', details);

    expect(err.details).toEqual(details);
  });
});

describe('ok', () => {
  it('writes { success: true, data } with status 200 by default', () => {
    const res = makeRes();
    const payload = { id: 1, name: 'Daal Chawal' };

    ok(res, payload);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: payload });
  });

  it('uses a custom status code when provided', () => {
    const res = makeRes();

    ok(res, { a: 1 }, 202);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { a: 1 } });
  });

  it('includes meta when provided', () => {
    const res = makeRes();
    const data = [{ id: 1 }];
    const meta = { page: 1, total: 10 };

    ok(res, data, 200, meta);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data,
      meta,
    });
  });

  it('omits the meta key entirely when not provided', () => {
    const res = makeRes();

    ok(res, { x: 1 });

    const body = vi.mocked(res.json).mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['success', 'data']);
    expect('meta' in body).toBe(false);
  });
});

describe('created', () => {
  it('delegates to ok() with status 201', () => {
    const res = makeRes();
    const payload = { id: 'new-1' };

    created(res, payload);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: payload });
  });
});
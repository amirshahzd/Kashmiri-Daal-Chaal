import { Response } from 'express';
import { ApiSuccess } from '../types';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function ok<T>(res: Response, data: T, status = 200, meta?: Record<string, unknown>) {
  const body: ApiSuccess<T> = { success: true, data, ...(meta ? { meta } : {}) };
  return res.status(status).json(body);
}

export function created<T>(res: Response, data: T) {
  return ok(res, data, 201);
}

import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { AppError } from '../utils/errors';
import { verifyAccessToken } from '../utils/jwt';
import { AuthedRequest, RoleName } from '../types';

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      return next(
        new AppError(400, 'VALIDATION_ERROR', 'Invalid request data', parsed.error.flatten())
      );
    }
    (req as Request & { validated: unknown }).validated = parsed.data;
    Object.assign(req[source], parsed.data);
    next();
  };
}

export function authenticate(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.access_token;
  if (!token) return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      roles: payload.roles as RoleName[],
      permissions: payload.permissions,
      branchId: payload.branchId,
    };
    next();
  } catch {
    next(new AppError(401, 'TOKEN_INVALID', 'Invalid or expired access token'));
  }
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.access_token;
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      roles: payload.roles as RoleName[],
      permissions: payload.permissions,
      branchId: payload.branchId,
    };
  } catch {
    /* ignore */
  }
  next();
}

export function requireRoles(...roles: RoleName[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
    if (req.user.roles.includes('owner')) return next();
    const ok = roles.some((r) => req.user!.roles.includes(r));
    if (!ok) return next(new AppError(403, 'FORBIDDEN', 'Insufficient role privileges'));
    next();
  };
}

export function requirePermission(...perms: string[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
    if (req.user.roles.includes('owner')) return next();
    const ok = perms.some((p) => req.user!.permissions.includes(p));
    if (!ok) return next(new AppError(403, 'FORBIDDEN', 'Missing required permission'));
    next();
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  console.error(err);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}

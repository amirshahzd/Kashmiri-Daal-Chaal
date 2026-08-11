import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, authenticate, optionalAuth, validate } from '../middleware';
import * as authService from '../services/auth.service';
import { ok } from '../utils/errors';
import { env } from '../config/env';
import { AuthedRequest } from '../types';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().min(7).max(30),
  dateOfBirth: z.string().optional().or(z.literal('')),
  addressLine1: z.string().max(255).optional().or(z.literal('')),
  addressLine2: z.string().max(255).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  postcode: z.string().max(20).optional().or(z.literal('')),
  country: z.string().max(100).optional().or(z.literal('')),
  marketingOptIn: z.boolean().optional(),
});

const createUserSchema = z.object({
  email: z.string().min(2).max(100), // login user id (or email)
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().min(7).max(30),
  dateOfBirth: z.string().optional().or(z.literal('')),
  addressLine1: z.string().max(255).optional().or(z.literal('')),
  addressLine2: z.string().max(255).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  postcode: z.string().max(20).optional().or(z.literal('')),
  country: z.string().max(100).optional().or(z.literal('')),
  marketingOptIn: z.boolean().optional(),
  accountType: z.enum([
    'customer',
    'owner',
    'manager',
    'cashier',
    'kitchen',
    'delivery',
    'employee',
    'admin',
  ]),
});

const loginSchema = z.object({
  /** User id or email — accept either field name for compatibility */
  email: z.string().min(1).optional(),
  loginId: z.string().min(1).optional(),
  password: z.string().min(1),
}).refine((d) => Boolean((d.loginId || d.email || '').trim()), {
  message: 'User id is required',
  path: ['loginId'],
});

const updateLoginSchema = z.object({
  userId: z.string().min(1),
  newLoginId: z.string().min(2).max(100).optional().or(z.literal('')),
  newPassword: z.string().min(8).max(128).optional().or(z.literal('')),
  currentPassword: z.string().optional().or(z.literal('')),
});

router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.registerCustomer(req.body);
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: env.cookieSecure,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return ok(
      res,
      {
        ...result,
        message: 'Your account has been created successfully. You are now signed in.',
      },
      201
    );
  })
);

/** Admin creates a user and assigns portal access level. */
router.post(
  '/create-user',
  optionalAuth,
  validate(createUserSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await authService.createUserByAdmin(req.body, req.user);
    return ok(res, result, 201);
  })
);

/** Change user id / password for one account only (self or admin for others). */
router.post(
  '/update-login',
  optionalAuth,
  validate(updateLoginSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { userId, newLoginId, newPassword, currentPassword } = req.body as {
      userId: string;
      newLoginId?: string;
      newPassword?: string;
      currentPassword?: string;
    };
    const result = await authService.updateUserLoginDetails(
      userId,
      {
        newLoginId: newLoginId || undefined,
        newPassword: newPassword || undefined,
        currentPassword: currentPassword || undefined,
      },
      req.user
    );
    return ok(res, result);
  })
);

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const loginId = String(req.body.loginId || req.body.email || '').trim();
    const result = await authService.login(loginId, req.body.password, {
      ip: req.ip,
      ua: req.get('user-agent') ?? undefined,
    });
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: env.cookieSecure,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return ok(res, result);
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.body.refreshToken || req.cookies?.refresh_token;
    const result = await authService.refresh(token);
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: env.cookieSecure,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return ok(res, result);
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await authService.logout(req.body.refreshToken || req.cookies?.refresh_token);
    res.clearCookie('refresh_token');
    return ok(res, { message: 'Logged out' });
  })
);

router.post(
  '/forgot-password',
  validate(z.object({ email: z.string().email() })),
  asyncHandler(async (req, res) => {
    return ok(res, await authService.requestPasswordReset(req.body.email));
  })
);

router.post(
  '/reset-password',
  validate(z.object({ token: z.string().min(10), password: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    return ok(res, await authService.resetPassword(req.body.token, req.body.password));
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    return ok(res, { user: req.user });
  })
);

/** List registered accounts (staff view). */
router.get(
  '/accounts',
  asyncHandler(async (_req, res) => {
    return ok(res, await authService.listAccounts());
  })
);

export default router;

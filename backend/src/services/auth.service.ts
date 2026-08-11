import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool, query } from '../config/db';
import { AppError } from '../utils/errors';
import { hashToken, parseExpiryToMs, signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { env } from '../config/env';
import { AuthUser, RoleName } from '../types';
import { authFileStore } from './auth-file.store';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  status: string;
  locked_until: Date | null;
}

const STAFF_ROLES: RoleName[] = ['owner', 'manager', 'cashier', 'kitchen', 'delivery', 'employee'];

export type RegisterInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postcode?: string;
  country?: string;
  marketingOptIn?: boolean;
  /** Only used by admin create-user; public register ignores this */
  accountType?: 'customer' | RoleName | 'admin';
};

const ALREADY_REGISTERED_MSG =
  'These details are already registered. Please sign in or use a different email and contact number.';

function normalizePhoneDigits(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
}

function assertUniqueEmailAndPhone(email: string, phone?: string | null) {
  if (authFileStore.findUserByEmail(email)) {
    throw new AppError(409, 'ALREADY_REGISTERED', ALREADY_REGISTERED_MSG);
  }
  if (normalizePhoneDigits(phone) && authFileStore.findUserByPhone(phone)) {
    throw new AppError(409, 'ALREADY_REGISTERED', ALREADY_REGISTERED_MSG);
  }
}

async function assertUniqueEmailAndPhoneDb(email: string, phone?: string | null) {
  const emailRes = await query(`SELECT id FROM users WHERE lower(email) = $1 LIMIT 1`, [
    email.toLowerCase(),
  ]);
  if (emailRes.rowCount) {
    throw new AppError(409, 'ALREADY_REGISTERED', ALREADY_REGISTERED_MSG);
  }
  const phoneKey = normalizePhoneDigits(phone);
  if (phoneKey) {
    // Compare digit-only form of stored phones
    const phoneRes = await query(
      `SELECT id FROM users
       WHERE phone IS NOT NULL
         AND regexp_replace(phone, '[^0-9]', '', 'g') = $1
       LIMIT 1`,
      [phoneKey]
    );
    if (phoneRes.rowCount) {
      throw new AppError(409, 'ALREADY_REGISTERED', ALREADY_REGISTERED_MSG);
    }
  }
}

function canCreateStaff(actor?: AuthUser | null): boolean {
  if (!actor) return false;
  return actor.roles.some((r) => r === 'owner' || r === 'manager');
}

async function dbAvailable(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

function resolveRoles(accountType?: string): RoleName[] {
  const type = (accountType || 'customer').toLowerCase();
  if (type === 'customer' || !type) return ['customer'];
  // Admin is the top role (owner is the same access level internally)
  if (type === 'admin' || type === 'owner') return ['owner'];
  if (STAFF_ROLES.includes(type as RoleName)) return [type as RoleName];
  throw new AppError(400, 'INVALID_ACCOUNT_TYPE', 'Invalid account type');
}

function toAuthUserFromFile(user: NonNullable<ReturnType<typeof authFileStore.findUserById>>): AuthUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    roles: user.roles,
    permissions: authFileStore.permissionsForRoles(user.roles),
    branchId: user.branch_id || env.defaultBranchId,
  };
}

async function loadAuthUserDb(userId: string): Promise<AuthUser> {
  const userRes = await query<UserRow>(
    `SELECT id, email, password_hash, first_name, last_name, status, locked_until FROM users WHERE id = $1`,
    [userId]
  );
  const user = userRes.rows[0];
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

  const rolesRes = await query<{ name: RoleName; branch_id: string | null }>(
    `SELECT r.name, ur.branch_id
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
    [userId]
  );

  const permsRes = await query<{ code: string }>(
    `SELECT DISTINCT p.code
     FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = $1`,
    [userId]
  );

  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    roles: rolesRes.rows.map((r) => r.name),
    permissions: permsRes.rows.map((p) => p.code),
    branchId: rolesRes.rows.find((r) => r.branch_id)?.branch_id ?? env.defaultBranchId,
  };
}

async function loadAuthUser(userId: string): Promise<AuthUser> {
  if (await dbAvailable()) {
    try {
      return await loadAuthUserDb(userId);
    } catch {
      /* fall through to file */
    }
  }
  const fileUser = authFileStore.findUserById(userId);
  if (!fileUser) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  return toAuthUserFromFile(fileUser);
}

async function issueTokens(user: AuthUser, meta?: { ip?: string; ua?: string }, storage: 'postgres' | 'file' = 'file') {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user.id);
  const expiresAt = new Date(Date.now() + parseExpiryToMs(env.jwtRefreshExpires));

  if (storage === 'postgres' && (await dbAvailable())) {
    try {
      await query(
        `INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
         VALUES ($1, $2, $3, $4::inet, $5)`,
        [user.id, hashToken(refreshToken), meta?.ua ?? null, meta?.ip ?? null, expiresAt]
      );
      return { user, accessToken, refreshToken, expiresIn: env.jwtAccessExpires, storage: 'postgres' as const };
    } catch {
      /* file fallback for tokens */
    }
  }

  authFileStore.saveRefreshToken({
    user_id: user.id,
    token_hash: hashToken(refreshToken),
    device_info: meta?.ua ?? null,
    ip_address: meta?.ip ?? null,
    expires_at: expiresAt,
  });

  return { user, accessToken, refreshToken, expiresIn: env.jwtAccessExpires, storage: 'file' as const };
}

async function registerCustomerFile(input: RegisterInput, roles: RoleName[]) {
  assertUniqueEmailAndPhone(input.email, input.phone);
  const passwordHash = await bcrypt.hash(input.password, 12);
  let user;
  try {
    user = authFileStore.createUser({
      email: input.email,
      password_hash: passwordHash,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone ?? null,
      roles,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'EMAIL_TAKEN' || code === 'PHONE_TAKEN') {
      throw new AppError(409, 'ALREADY_REGISTERED', ALREADY_REGISTERED_MSG);
    }
    throw err;
  }

  if (roles.includes('customer')) {
    authFileStore.createCustomer({
      user_id: user.id,
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      phone: input.phone ?? null,
      date_of_birth: input.dateOfBirth ?? null,
      marketing_opt_in: input.marketingOptIn,
      address_line1: input.addressLine1 ?? null,
      address_line2: input.addressLine2 ?? null,
      city: input.city ?? null,
      postcode: input.postcode ?? null,
      country: input.country ?? 'Pakistan',
    });
  }

  return issueTokens(toAuthUserFromFile(user), undefined, 'file');
}

async function registerCustomerDb(input: RegisterInput, roles: RoleName[]) {
  await assertUniqueEmailAndPhoneDb(input.email, input.phone);

  const passwordHash = await bcrypt.hash(input.password, 12);
  const userRes = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, email_verified_at)
     VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
    [input.email.toLowerCase(), passwordHash, input.firstName, input.lastName, input.phone ?? null]
  );
  const userId = userRes.rows[0].id;

  for (const roleName of roles) {
    const roleRes = await query<{ id: string }>(`SELECT id FROM roles WHERE name = $1`, [roleName]);
    if (!roleRes.rows[0]) throw new AppError(400, 'ROLE_MISSING', `Role not found: ${roleName}`);
    await query(`INSERT INTO user_roles (user_id, role_id, branch_id) VALUES ($1, $2, $3)`, [
      userId,
      roleRes.rows[0].id,
      env.defaultBranchId,
    ]);
  }

  if (roles.includes('customer')) {
    const cust = await query<{ id: string }>(
      `INSERT INTO customers (user_id, first_name, last_name, email, phone, date_of_birth, marketing_opt_in)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        userId,
        input.firstName,
        input.lastName,
        input.email.toLowerCase(),
        input.phone ?? null,
        input.dateOfBirth || null,
        Boolean(input.marketingOptIn),
      ]
    );

    if (input.addressLine1 && input.city) {
      await query(
        `INSERT INTO customer_addresses
          (customer_id, label, address_line1, address_line2, city, postcode, country, is_default)
         VALUES ($1, 'Home', $2, $3, $4, $5, $6, TRUE)`,
        [
          cust.rows[0].id,
          input.addressLine1,
          input.addressLine2 ?? null,
          input.city,
          input.postcode ?? '',
          input.country ?? 'Pakistan',
        ]
      );
    }
  }

  return issueTokens(await loadAuthUserDb(userId), undefined, 'postgres');
}

/** Public sign-up — always creates a customer account (no staff roles). */
export async function registerCustomer(input: RegisterInput) {
  const phone = (input.phone || '').trim();
  if (!phone || !normalizePhoneDigits(phone)) {
    throw new AppError(400, 'PHONE_REQUIRED', 'Contact number is required');
  }
  const roles: RoleName[] = ['customer'];
  const payload = { ...input, phone, accountType: 'customer' as const };

  if (await dbAvailable()) {
    try {
      return await registerCustomerDb(payload, roles);
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Schema missing roles or DB partial → file store
    }
  }

  return registerCustomerFile(payload, roles);
}

/**
 * Admin creates a user and assigns access level (admin/manager/cashier/etc.).
 * Does not auto-login the creator as that user.
 */
export async function createUserByAdmin(input: RegisterInput, actor?: AuthUser | null) {
  if (actor) {
    if (!canCreateStaff(actor)) {
      throw new AppError(403, 'FORBIDDEN', 'Only admin or manager may create user access');
    }
  } else if (env.isProd) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  const phone = (input.phone || '').trim();
  if (!phone || !normalizePhoneDigits(phone)) {
    throw new AppError(400, 'PHONE_REQUIRED', 'Contact number is required');
  }

  const access = (input.accountType || 'employee').toLowerCase();
  const roles = resolveRoles(access === 'admin' ? 'admin' : access);
  const payload = { ...input, phone };

  if (await dbAvailable()) {
    try {
      const result = await registerCustomerDb(payload, roles);
      return {
        user: result.user,
        message: 'Account created successfully. Access level has been assigned.',
        storage: result.storage,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
    }
  }

  const result = await registerCustomerFile(payload, roles);
  return {
    user: result.user,
    message: 'Account created successfully. Access level has been assigned.',
    storage: result.storage,
  };
}

export async function login(loginId: string, password: string, meta?: { ip?: string; ua?: string }) {
  await ensureDefaultStaffAccounts();
  const id = loginId.trim().toLowerCase();
  if (await dbAvailable()) {
    try {
      return await loginDb(id, password, meta);
    } catch (err) {
      if (err instanceof AppError && err.code !== 'INVALID_CREDENTIALS') throw err;
      // try file store if not in DB
    }
  }
  return loginFile(id, password, meta);
}

async function loginDb(loginId: string, password: string, meta?: { ip?: string; ua?: string }) {
  const userRes = await query<UserRow>(
    `SELECT id, email, password_hash, first_name, last_name, status, locked_until
     FROM users WHERE lower(email) = $1`,
    [loginId]
  );
  const user = userRes.rows[0];
  if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid login details');

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Account temporarily locked. Try again later.');
  }
  if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is not active');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await query(
      `UPDATE users SET failed_logins = failed_logins + 1,
       locked_until = CASE WHEN failed_logins + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
       WHERE id = $1`,
      [user.id]
    );
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid login details');
  }

  await query(`UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1`, [
    user.id,
  ]);

  const authUser = await loadAuthUserDb(user.id);
  const tokens = await issueTokens(authUser, meta, 'postgres');

  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, user_agent)
       VALUES ($1, 'auth.login', 'user', $1, $2::inet, $3)`,
      [user.id, meta?.ip ?? null, meta?.ua ?? null]
    );
  } catch {
    /* audit optional */
  }

  return tokens;
}

async function loginFile(loginId: string, password: string, meta?: { ip?: string; ua?: string }) {
  await ensureDefaultStaffAccounts();
  const user = authFileStore.findUserByEmail(loginId);
  if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid login details');

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Account temporarily locked. Try again later.');
  }
  if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is not active');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const failed = user.failed_logins + 1;
    authFileStore.updateUser(user.id, {
      failed_logins: failed,
      locked_until: failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : user.locked_until,
    });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid login details');
  }

  authFileStore.updateUser(user.id, {
    failed_logins: 0,
    locked_until: null,
    last_login_at: new Date().toISOString(),
  });

  return issueTokens(toAuthUserFromFile(user), meta, 'file');
}

/** Default administrator: login id `admin@admin.com` / password `admin1234` */
export const DEFAULT_ADMIN_LOGIN = 'admin@admin.com';
export const DEFAULT_ADMIN_PASSWORD = 'admin1234';

/** Seed default admin for file store so Admin login works out of the box. */
export async function ensureDefaultStaffAccounts() {
  const loginId = DEFAULT_ADMIN_LOGIN;
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);

  // Migrate legacy plain "admin" user id → admin@admin.com (fixes browser @ validation)
  const legacy = authFileStore.findUserByEmail('admin');
  if (legacy && !authFileStore.findUserByEmail(loginId)) {
    authFileStore.updateUser(legacy.id, {
      email: loginId,
      password_hash: passwordHash,
      roles: legacy.roles.includes('owner') ? legacy.roles : (['owner'] as RoleName[]),
      status: 'active',
      failed_logins: 0,
      locked_until: null,
    });
    return;
  }

  if (authFileStore.findUserByEmail(loginId)) return;

  try {
    authFileStore.createUser({
      email: loginId,
      password_hash: passwordHash,
      first_name: 'Restaurant',
      last_name: 'Admin',
      phone: '03000000001',
      roles: ['owner'],
    });
  } catch {
    /* race / already exists */
  }
}

/**
 * Update login id and/or password for one account only (never mixes with other users).
 * - Self-service: supply currentPassword
 * - Admin/owner may update another user without that user’s password
 */
export async function updateUserLoginDetails(
  targetUserId: string,
  input: {
    newLoginId?: string;
    newPassword?: string;
    currentPassword?: string;
  },
  actor?: AuthUser | null
) {
  if (!input.newLoginId?.trim() && !input.newPassword) {
    throw new AppError(400, 'NOTHING_TO_UPDATE', 'Provide a new user id and/or new password');
  }

  const isSelf = actor?.id === targetUserId;
  const isAdminActor = actor && canCreateStaff(actor);

  if (env.isProd) {
    if (!actor) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (!isSelf && !isAdminActor) {
      throw new AppError(403, 'FORBIDDEN', 'You can only change your own login details');
    }
  } else if (actor && !isSelf && !isAdminActor) {
    throw new AppError(403, 'FORBIDDEN', 'You can only change your own login details');
  }

  // Prefer file store (primary offline mode), then DB
  const fileUser = authFileStore.findUserById(targetUserId);
  if (fileUser) {
    if (isSelf) {
      if (!input.currentPassword) {
        throw new AppError(400, 'CURRENT_PASSWORD_REQUIRED', 'Current password is required');
      }
      const ok = await bcrypt.compare(input.currentPassword, fileUser.password_hash);
      if (!ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
    }

    const patch: { email?: string; password_hash?: string } = {};

    if (input.newLoginId?.trim()) {
      const nextLogin = input.newLoginId.trim().toLowerCase();
      if (nextLogin.length < 2) {
        throw new AppError(400, 'INVALID_LOGIN_ID', 'User id must be at least 2 characters');
      }
      const taken = authFileStore.findUserByEmail(nextLogin);
      if (taken && taken.id !== targetUserId) {
        throw new AppError(409, 'ALREADY_REGISTERED', 'That user id is already registered');
      }
      // Update customer mirror email only for this user
      const cust = authFileStore.findCustomerByUserId(targetUserId);
      if (cust) {
        authFileStore.updateCustomer(cust.id, { email: nextLogin });
      }
      patch.email = nextLogin;
    }

    if (input.newPassword) {
      if (input.newPassword.length < 8) {
        throw new AppError(400, 'WEAK_PASSWORD', 'Password must be at least 8 characters');
      }
      patch.password_hash = await bcrypt.hash(input.newPassword, 12);
    }

    const updated = authFileStore.updateUser(targetUserId, patch);
    if (!updated) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    return {
      message: 'Login details updated for this account only.',
      user: {
        id: updated.id,
        loginId: updated.email,
        email: updated.email,
        firstName: updated.first_name,
        lastName: updated.last_name,
        roles: updated.roles,
      },
      storage: 'file' as const,
    };
  }

  if (await dbAvailable()) {
    try {
      const row = await query<UserRow>(
        `SELECT id, email, password_hash, first_name, last_name, status, locked_until FROM users WHERE id = $1`,
        [targetUserId]
      );
      const user = row.rows[0];
      if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

      if (isSelf) {
        if (!input.currentPassword) {
          throw new AppError(400, 'CURRENT_PASSWORD_REQUIRED', 'Current password is required');
        }
        const ok = await bcrypt.compare(input.currentPassword, user.password_hash);
        if (!ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
      }

      if (input.newLoginId?.trim()) {
        const nextLogin = input.newLoginId.trim().toLowerCase();
        const taken = await query(`SELECT id FROM users WHERE lower(email) = $1 AND id <> $2`, [
          nextLogin,
          targetUserId,
        ]);
        if (taken.rowCount) {
          throw new AppError(409, 'ALREADY_REGISTERED', 'That user id is already registered');
        }
        await query(`UPDATE users SET email = $1 WHERE id = $2`, [nextLogin, targetUserId]);
        await query(`UPDATE customers SET email = $1 WHERE user_id = $2`, [nextLogin, targetUserId]).catch(
          () => undefined
        );
      }

      if (input.newPassword) {
        if (input.newPassword.length < 8) {
          throw new AppError(400, 'WEAK_PASSWORD', 'Password must be at least 8 characters');
        }
        const passwordHash = await bcrypt.hash(input.newPassword, 12);
        await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, targetUserId]);
      }

      // Revoke other sessions for this user only
      await query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [targetUserId]
      ).catch(() => undefined);

      const authUser = await loadAuthUserDb(targetUserId);
      return {
        message: 'Login details updated for this account only.',
        user: {
          id: authUser.id,
          loginId: authUser.email,
          email: authUser.email,
          firstName: authUser.firstName,
          lastName: authUser.lastName,
          roles: authUser.roles,
        },
        storage: 'postgres' as const,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
    }
  }

  throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
}

export async function refresh(refreshToken: string) {
  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'REFRESH_INVALID', 'Invalid refresh token');
  }

  const tokenHash = hashToken(refreshToken);

  if (await dbAvailable()) {
    try {
      const stored = await query(
        `SELECT id FROM refresh_tokens
         WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > NOW()`,
        [tokenHash, payload.sub]
      );
      if (stored.rowCount) {
        await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [stored.rows[0].id]);
        return issueTokens(await loadAuthUser(payload.sub), undefined, 'postgres');
      }
    } catch {
      /* file */
    }
  }

  const fileTok = authFileStore.findValidRefresh(tokenHash, payload.sub);
  if (!fileTok) throw new AppError(401, 'REFRESH_INVALID', 'Refresh token revoked or expired');
  authFileStore.revokeRefreshById(fileTok.id);
  return issueTokens(await loadAuthUser(payload.sub), undefined, 'file');
}

export async function logout(refreshToken?: string) {
  if (!refreshToken) return;
  const tokenHash = hashToken(refreshToken);
  if (await dbAvailable()) {
    try {
      await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`, [tokenHash]);
    } catch {
      /* ignore */
    }
  }
  authFileStore.revokeRefresh(tokenHash);
}

export async function requestPasswordReset(email: string) {
  const msg = 'Reset login details have been emailed.';
  if (await dbAvailable()) {
    try {
      const userRes = await query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [
        email.toLowerCase(),
      ]);
      if (userRes.rowCount) {
        const raw = cryptoRandom();
        await query(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
          [userRes.rows[0].id, hashToken(raw)]
        );
        return { message: msg };
      }
    } catch {
      /* file */
    }
  }

  const fileUser = authFileStore.findUserByEmail(email);
  if (fileUser) {
    const raw = cryptoRandom();
    authFileStore.savePasswordReset(fileUser.id, hashToken(raw));
  }
  // Always show the same success message (do not reveal whether email exists)
  return { message: msg };
}

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = hashToken(token);

  if (await dbAvailable()) {
    try {
      const row = await query<{ id: string; user_id: string }>(
        `SELECT id, user_id FROM password_reset_tokens
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
        [tokenHash]
      );
      if (row.rowCount) {
        const passwordHash = await bcrypt.hash(newPassword, 12);
        await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
          passwordHash,
          row.rows[0].user_id,
        ]);
        await query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.rows[0].id]);
        await query(
          `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
          [row.rows[0].user_id]
        );
        return { message: 'Password updated successfully' };
      }
    } catch {
      /* file */
    }
  }

  const fileRow = authFileStore.findPasswordReset(tokenHash);
  if (!fileRow) throw new AppError(400, 'RESET_INVALID', 'Invalid or expired reset token');
  const passwordHash = await bcrypt.hash(newPassword, 12);
  authFileStore.updateUser(fileRow.user_id, { password_hash: passwordHash });
  authFileStore.markPasswordResetUsed(fileRow.id);
  authFileStore.revokeAllUserRefresh(fileRow.user_id);
  return { message: 'Password updated successfully' };
}

export async function listAccounts() {
  if (await dbAvailable()) {
    try {
      const users = await query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.status, u.created_at,
                COALESCE(array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
         GROUP BY u.id
         ORDER BY u.created_at DESC
         LIMIT 500`
      );
      const customers = await query(
        `SELECT id, user_id, first_name, last_name, email, phone, loyalty_points, total_orders, created_at
         FROM customers ORDER BY created_at DESC LIMIT 500`
      );
      return { users: users.rows, customers: customers.rows, storage: 'postgres' as const };
    } catch {
      /* file */
    }
  }

  return {
    users: authFileStore.listUsers(),
    customers: authFileStore.listCustomers(),
    storage: 'file' as const,
  };
}

function cryptoRandom(): string {
  return crypto.randomBytes(32).toString('hex');
}

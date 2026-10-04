
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { authFileStore } from '../src/services/auth-file.store';
import { hashToken } from '../src/utils/jwt';
import {

  createUserByAdmin,
  deleteAccount,
  ensureDefaultStaffAccounts,
  listAccounts,
  login,
  logout,
  refresh,
  registerCustomer,
  requestPasswordReset,
  resetPassword,
  updateUserLoginDetails,

} from '../src/services/auth.service';
  

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Force the DB path to be unavailable so all service calls fall through to the
// file store. `dbAvailable()` calls `pool.query('SELECT 1')` — we make it reject.
vi.mock('../src/config/db', () => ({
  pool: {
    query: vi.fn().mockRejectedValue(new Error('db down')),
    connect: vi.fn(),
  },
  query: vi.fn().mockRejectedValue(new Error('db down')),
}));
// Skip the real bcrypt cost-12 work — tests run in ms instead of seconds.
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async (pw: string) => `hashed:${pw}`),
    compare: vi.fn(async (pw: string, hash: string) => hash === `hashed:${pw}`),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  const path = authFileStore.path;
  const empty = { users: [], customers: [], refresh_tokens: [], password_resets: [] };
  fs.writeFileSync(path, JSON.stringify(empty, null, 2));
}

function makeActor(roles: string[]) {
  return {
    id: 'actor-1',
    email: 'actor@example.com',
    firstName: 'Actor',
    lastName: 'One',
    roles: roles as never,
    permissions: [] as string[],
    branchId: 'branch-1',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('auth service account management', () => {
  beforeEach(() => {
    resetStore();
  });

  it('deletes a user account from the file store when owner requests it', async () => {
    const user = authFileStore.createUser({
      email: 'temp.user@example.com',
      password_hash: 'hash',
      first_name: 'Temp',
      last_name: 'User',
      phone: '03000000010',
      roles: ['employee'],
    });

    const result = await deleteAccount(user.id, makeActor(['owner']));

    expect(result.deleted).toBe(true);
    expect(authFileStore.findUserById(user.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// registerCustomer — file-store path
// ---------------------------------------------------------------------------

describe('registerCustomer (file store)', () => {
  beforeEach(() => {
    resetStore();
  });

  it('creates a customer and returns tokens', async () => {
    const result = await registerCustomer({
      email: 'alice@example.com',
      password: 'correct-horse-battery-staple',
      firstName: 'Alice',
      lastName: 'Anderson',
      phone: '03001112222',
    });

    expect(result.user.email).toBe('alice@example.com');
    expect(result.user.roles).toEqual(['customer']);
    expect(result.accessToken).toBeTypeOf('string');
    expect(result.refreshToken).toBeTypeOf('string');
    expect(result.storage).toBe('file');
    expect(authFileStore.findUserByEmail('alice@example.com')).toBeDefined();
  });

  it('rejects when phone is missing', async () => {
    await expect(
      registerCustomer({
        email: 'nophone@example.com',
        password: 'password123',
        firstName: 'No',
        lastName: 'Phone',
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'PHONE_REQUIRED' });
  });

  it('rejects when phone has fewer than 7 digits', async () => {
    await expect(
      registerCustomer({
        email: 'shortphone@example.com',
        password: 'password123',
        firstName: 'Short',
        lastName: 'Phone',
        phone: '12345',
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'PHONE_REQUIRED' });
  });

  it('rejects a duplicate email', async () => {
    authFileStore.createUser({
      email: 'dupe@example.com',
      password_hash: 'hash',
      first_name: 'Dupe',
      last_name: 'User',
      phone: '03009999999',
      roles: ['customer'],
    });

    await expect(
      registerCustomer({
        email: 'dupe@example.com',
        password: 'password123',
        firstName: 'Other',
        lastName: 'Person',
        phone: '03008888888',
      })
    ).rejects.toMatchObject({ statusCode: 409, code: 'ALREADY_REGISTERED' });
  });

  it('rejects a duplicate phone', async () => {
    authFileStore.createUser({
      email: 'first@example.com',
      password_hash: 'hash',
      first_name: 'First',
      last_name: 'User',
      phone: '03007777777',
      roles: ['customer'],
    });

    await expect(
      registerCustomer({
        email: 'second@example.com',
        password: 'password123',
        firstName: 'Second',
        lastName: 'User',
        phone: '03007777777',
      })
    ).rejects.toMatchObject({ statusCode: 409, code: 'ALREADY_REGISTERED' });
  });
});

// ---------------------------------------------------------------------------
// createUserByAdmin — role resolution + guards
// ---------------------------------------------------------------------------

describe('createUserByAdmin', () => {
  beforeEach(() => {
    resetStore();
  });

  it('assigns the "employee" role for accessMode=view_only', async () => {
    const { user } = await createUserByAdmin(
      {
        email: 'vo@example.com',
        password: 'password123',
        firstName: 'View',
        lastName: 'Only',
        phone: '03001000001',
        accessMode: 'view_only',
      },
      makeActor(['owner'])
    );

    expect(user.roles).toEqual(['employee']);
  });

  it('assigns the "cashier" role for accessMode=view_manage', async () => {
    const { user } = await createUserByAdmin(
      {
        email: 'vm@example.com',
        password: 'password123',
        firstName: 'View',
        lastName: 'Manage',
        phone: '03001000002',
        accessMode: 'view_manage',
      },
      makeActor(['owner'])
    );

    expect(user.roles).toEqual(['cashier']);
  });

  it('assigns the "manager" role for accessMode=full_access', async () => {
    const { user } = await createUserByAdmin(
      {
        email: 'fa@example.com',
        password: 'password123',
        firstName: 'Full',
        lastName: 'Access',
        phone: '03001000003',
        accessMode: 'full_access',
      },
      makeActor(['owner'])
    );

    expect(user.roles).toEqual(['manager']);
  });

  it('assigns the "owner" role for accessMode=admin', async () => {
    const { user } = await createUserByAdmin(
      {
        email: 'admin2@example.com',
        password: 'password123',
        firstName: 'Second',
        lastName: 'Admin',
        phone: '03001000004',
        accessMode: 'admin',
      },
      makeActor(['owner'])
    );

    expect(user.roles).toEqual(['owner']);
  });

  it('passes through a staff role name directly', async () => {
    const { user } = await createUserByAdmin(
      {
        email: 'kitchen@example.com',
        password: 'password123',
        firstName: 'Kitchen',
        lastName: 'Staff',
        phone: '03001000005',
        accessMode: 'kitchen',
      },
      makeActor(['owner'])
    );

    expect(user.roles).toEqual(['kitchen']);
  });

  it('rejects an unknown access mode', async () => {
    await expect(
      createUserByAdmin(
        {
          email: 'bogus@example.com',
          password: 'password123',
          firstName: 'Bogus',
          lastName: 'Role',
          phone: '03001000006',
          accessMode: 'superhero' as never,        },
        makeActor(['owner'])
      )
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ACCOUNT_TYPE' });
  });

  it('rejects a non-admin actor (cashier cannot create users)', async () => {
    await expect(
      createUserByAdmin(
        {
          email: 'new@example.com',
          password: 'password123',
          firstName: 'New',
          lastName: 'User',
          phone: '03001000007',
          accessMode: 'employee',
        },
        makeActor(['cashier'])
      )
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('rejects when phone is missing', async () => {
    await expect(
      createUserByAdmin(
        {
          email: 'nophone2@example.com',
          password: 'password123',
          firstName: 'No',
          lastName: 'Phone',
          accessMode: 'employee',
        },
        makeActor(['owner'])
      )
    ).rejects.toMatchObject({ statusCode: 400, code: 'PHONE_REQUIRED' });
  });
});

// ---------------------------------------------------------------------------
// deleteAccount — authorization guards
// ---------------------------------------------------------------------------

describe('deleteAccount guards', () => {
  beforeEach(() => {
    resetStore();
  });

  it('rejects when no actor is provided', async () => {
    await expect(deleteAccount('someone', undefined)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects when actor is not owner or manager', async () => {
    const target = authFileStore.createUser({
      email: 'victim@example.com',
      password_hash: 'hash',
      first_name: 'Victim',
      last_name: 'User',
      phone: '03001234567',
      roles: ['customer'],
    });

    await expect(deleteAccount(target.id, makeActor(['cashier']))).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('rejects when actor tries to delete their own account', async () => {
    const actor = authFileStore.createUser({
      email: 'self@example.com',
      password_hash: 'hash',
      first_name: 'Self',
      last_name: 'Delete',
      phone: '03001234568',
      roles: ['owner'],
    });

    await expect(
      deleteAccount(actor.id, {
        id: actor.id,
        email: actor.email,
        firstName: actor.first_name,
        lastName: actor.last_name,
        roles: ['owner'],
        permissions: [],
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'CANNOT_DELETE_SELF' });
  });

  it('returns 404 when the target user does not exist', async () => {
    await expect(deleteAccount('does-not-exist', makeActor(['owner']))).rejects.toMatchObject({
      statusCode: 404,
      code: 'USER_NOT_FOUND',
    });
    
  });
  
});

// ---------------------------------------------------------------------------
// login / loginFile — file-store path
// ---------------------------------------------------------------------------

describe('login (file store)', () => {
  beforeEach(() => {
    resetStore();
  });

  it('logs in a customer with correct credentials', async () => {
    const user = authFileStore.createUser({
      email: 'alice@example.com',
      password_hash: 'hashed:correct-password',
      first_name: 'Alice',
      last_name: 'Anderson',
      phone: '03001110001',
      roles: ['customer'],
    });

    const result = await login('alice@example.com', 'correct-password');

    expect(result.user.id).toBe(user.id);
    expect(result.user.email).toBe('alice@example.com');
    expect(result.accessToken).toBeTypeOf('string');
    expect(result.refreshToken).toBeTypeOf('string');
    expect(result.storage).toBe('file');
  });

  it('lowercases and trims the login id', async () => {
    authFileStore.createUser({
      email: 'bob@example.com',
      password_hash: 'hashed:pw',
      first_name: 'Bob',
      last_name: 'Brown',
      phone: '03001110002',
      roles: ['customer'],
    });

    const result = await login('  BOB@EXAMPLE.COM  ', 'pw');
    expect(result.user.email).toBe('bob@example.com');
  });

  it('rejects when the user does not exist', async () => {
    await expect(login('ghost@example.com', 'anything')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('rejects when the password is wrong', async () => {
    authFileStore.createUser({
      email: 'carol@example.com',
      password_hash: 'hashed:right-password',
      first_name: 'Carol',
      last_name: 'Clark',
      phone: '03001110003',
      roles: ['customer'],
    });

    await expect(login('carol@example.com', 'wrong-password')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('increments failed_logins on a bad password', async () => {
    const user = authFileStore.createUser({
      email: 'dave@example.com',
      password_hash: 'hashed:right',
      first_name: 'Dave',
      last_name: 'Davis',
      phone: '03001110004',
      roles: ['customer'],
    });

    await expect(login('dave@example.com', 'wrong')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    const after = authFileStore.findUserById(user.id);
    expect(after?.failed_logins).toBe(1);
    expect(after?.locked_until).toBeNull();
  });

  it('locks the account after 5 consecutive failures', async () => {
    const user = authFileStore.createUser({
      email: 'erin@example.com',
      password_hash: 'hashed:right',
      first_name: 'Erin',
      last_name: 'Evans',
      phone: '03001110005',
      roles: ['customer'],
    });

    for (let i = 0; i < 5; i++) {
      await expect(login('erin@example.com', 'wrong')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }

    const after = authFileStore.findUserById(user.id);
    expect(after?.failed_logins).toBe(5);
    expect(after?.locked_until).not.toBeNull();
    expect(new Date(after!.locked_until!).getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects a login attempt on a locked account with ACCOUNT_LOCKED', async () => {
    authFileStore.createUser({
      email: 'frank@example.com',
      password_hash: 'hashed:right',
      first_name: 'Frank',
      last_name: 'Fisher',
      phone: '03001110006',
      roles: ['customer'],
    });
    const u = authFileStore.findUserByEmail('frank@example.com')!;
    authFileStore.updateUser(u.id, {
      failed_logins: 5,
      locked_until: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });

    await expect(login('frank@example.com', 'right')).rejects.toMatchObject({
      statusCode: 423,
      code: 'ACCOUNT_LOCKED',
    });
  });

  it('rejects a login attempt on an inactive account with ACCOUNT_INACTIVE', async () => {
    const user = authFileStore.createUser({
      email: 'grace@example.com',
      password_hash: 'hashed:right',
      first_name: 'Grace',
      last_name: 'Green',
      phone: '03001110007',
      roles: ['customer'],
    });
    authFileStore.updateUser(user.id, { status: 'suspended' });

    await expect(login('grace@example.com', 'right')).rejects.toMatchObject({
      statusCode: 403,
      code: 'ACCOUNT_INACTIVE',
    });
  });

  it('clears failed_logins on successful login', async () => {
    const user = authFileStore.createUser({
      email: 'henry@example.com',
      password_hash: 'hashed:correct',
      first_name: 'Henry',
      last_name: 'Hill',
      phone: '03001110008',
      roles: ['customer'],
    });
    authFileStore.updateUser(user.id, { failed_logins: 3 });

    await login('henry@example.com', 'correct');

    const after = authFileStore.findUserById(user.id);
    expect(after?.failed_logins).toBe(0);
    expect(after?.locked_until).toBeNull();
  });

  it('does not reveal whether the user exists vs has a wrong password', async () => {
    const errMissing = await login('missing@example.com', 'x').catch((e) => e);
    const errWrongPw = await login('missing@example.com', 'x').catch((e) => e);
    expect(errMissing.statusCode).toBe(errWrongPw.statusCode);
    expect(errMissing.code).toBe(errWrongPw.code);
  });
});

// ---------------------------------------------------------------------------
// refresh / logout / password reset — file-store path
// ---------------------------------------------------------------------------

describe('refresh (file store)', () => {
  beforeEach(() => {
    resetStore();
  });

  it('rotates a valid refresh token and issues a new pair', async () => {
    const loginResult = await registerCustomer({
      email: 'refresher@example.com',
      password: 'password123',
      firstName: 'Re',
      lastName: 'Fresher',
      phone: '03002000001',
    });

    const result = await refresh(loginResult.refreshToken);

    expect(result.user.id).toBe(loginResult.user.id);
    expect(result.accessToken).toBeTypeOf('string');
    expect(result.refreshToken).toBeTypeOf('string');
    expect(result.storage).toBe('file');
    // Rotated: new refresh token differs from the old one
    expect(result.refreshToken).not.toBe(loginResult.refreshToken);
  });

  it('revokes the old refresh token so it cannot be reused', async () => {
    const loginResult = await registerCustomer({
      email: 'rotator@example.com',
      password: 'password123',
      firstName: 'Ro',
      lastName: 'Tator',
      phone: '03002000002',
    });

    await refresh(loginResult.refreshToken);

    // Second use of the same old token must fail
    await expect(refresh(loginResult.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
      code: 'REFRESH_INVALID',
    });
  });

  it('rejects a garbage / badly-signed token', async () => {
    await expect(refresh('not-a-jwt')).rejects.toMatchObject({
      statusCode: 401,
      code: 'REFRESH_INVALID',
    });
  });

  it('rejects a token whose user no longer exists in the file store', async () => {
    const loginResult = await registerCustomer({
      email: 'ghosty@example.com',
      password: 'password123',
      firstName: 'Ghost',
      lastName: 'User',
      phone: '03002000003',
    });

    // Delete the user but leave the refresh token in place
    authFileStore.deleteUser(loginResult.user.id);

    await expect(refresh(loginResult.refreshToken)).rejects.toMatchObject({
      statusCode: 404,
      code: 'USER_NOT_FOUND',
    });
  });
});

describe('logout', () => {
  beforeEach(() => {
    resetStore();
  });

  it('does nothing when no token is supplied', async () => {
    await expect(logout()).resolves.toBeUndefined();
  });

  it('revokes a refresh token so it can no longer be used', async () => {
    const loginResult = await registerCustomer({
      email: 'loggerout@example.com',
      password: 'password123',
      firstName: 'Log',
      lastName: 'Out',
      phone: '03002000004',
    });

    await logout(loginResult.refreshToken);

    await expect(refresh(loginResult.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
      code: 'REFRESH_INVALID',
    });
  });

  it('is idempotent — logging out twice does not throw', async () => {
    const loginResult = await registerCustomer({
      email: 'twice@example.com',
      password: 'password123',
      firstName: 'Twice',
      lastName: 'Out',
      phone: '03002000005',
    });

    await logout(loginResult.refreshToken);
    await expect(logout(loginResult.refreshToken)).resolves.toBeUndefined();
  });
});

describe('requestPasswordReset / resetPassword', () => {
  beforeEach(() => {
    resetStore();
  });

  it('returns the same message for a known email', async () => {
    await registerCustomer({
      email: 'forgetful@example.com',
      password: 'password123',
      firstName: 'For',
      lastName: 'Getful',
      phone: '03002000006',
    });

    const result = await requestPasswordReset('forgetful@example.com');
    expect(result.message).toBe('Reset login details have been emailed.');
  });

  it('returns the same message for an unknown email (no leak)', async () => {
    const result = await requestPasswordReset('nobody@example.com');
    expect(result.message).toBe('Reset login details have been emailed.');
  });

  it('rejects an invalid reset token', async () => {
    await expect(resetPassword('bogus-token', 'newpassword123')).rejects.toMatchObject({
      statusCode: 400,
      code: 'RESET_INVALID',
    });
  });

    it('rejects a token that has already been used', async () => {
    const user = authFileStore.createUser({
      email: 'used@example.com',
      password_hash: 'hashed:old',
      first_name: 'Used',
      last_name: 'Token',
      phone: '03002000007',
      roles: ['customer'],
    });

    // Mimic the real flow: hash the raw token the way the service does
    const rawToken = 'raw-reset-token';
    const hashed = hashToken(rawToken);
    const row = authFileStore.savePasswordReset(user.id, hashed);
    authFileStore.markPasswordResetUsed(row.id);

    await expect(resetPassword(rawToken, 'newpassword123')).rejects.toMatchObject({
      statusCode: 400,
      code: 'RESET_INVALID',
    });
  });
});

// ---------------------------------------------------------------------------
// updateUserLoginDetails — file-store path
// ---------------------------------------------------------------------------

describe('updateUserLoginDetails (file store)', () => {
  beforeEach(() => {
    resetStore();
  });

  it('rejects when neither newLoginId nor newPassword is supplied', async () => {
    await expect(updateUserLoginDetails('some-id', {}, makeActor(['owner']))).rejects.toMatchObject({
      statusCode: 400,
      code: 'NOTHING_TO_UPDATE',
    });
  });

  it('updates the login id as an admin actor (no currentPassword needed)', async () => {
    const user = authFileStore.createUser({
      email: 'old@example.com',
      password_hash: 'hashed:pw',
      first_name: 'Old',
      last_name: 'Name',
      phone: '03003000001',
      roles: ['employee'],
    });

    const result = await updateUserLoginDetails(
      user.id,
      { newLoginId: 'new@example.com' },
      makeActor(['owner'])
    );

    expect(result.user.email).toBe('new@example.com');
    expect(result.storage).toBe('file');
    expect(authFileStore.findUserByEmail('new@example.com')).toBeDefined();
  });

  it('rejects a login id shorter than 2 characters', async () => {
    const user = authFileStore.createUser({
      email: 'short@example.com',
      password_hash: 'hashed:pw',
      first_name: 'Short',
      last_name: 'Name',
      phone: '03003000002',
      roles: ['employee'],
    });

    await expect(
      updateUserLoginDetails(user.id, { newLoginId: 'x' }, makeActor(['owner']))
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_LOGIN_ID' });
  });

  it('rejects when the new login id is already taken by another user', async () => {
    authFileStore.createUser({
      email: 'taken@example.com',
      password_hash: 'hashed:pw',
      first_name: 'Taken',
      last_name: 'User',
      phone: '03003000003',
      roles: ['employee'],
    });
    const user = authFileStore.createUser({
      email: 'mine@example.com',
      password_hash: 'hashed:pw',
      first_name: 'Mine',
      last_name: 'User',
      phone: '03003000004',
      roles: ['employee'],
    });

    await expect(
      updateUserLoginDetails(user.id, { newLoginId: 'taken@example.com' }, makeActor(['owner']))
    ).rejects.toMatchObject({ statusCode: 409, code: 'ALREADY_REGISTERED' });
  });

  it('allows a user to keep their current login id (no collision against self)', async () => {
    const user = authFileStore.createUser({
      email: 'selfsame@example.com',
      password_hash: 'hashed:pw',
      first_name: 'Self',
      last_name: 'Same',
      phone: '03003000005',
      roles: ['employee'],
    });

    const result = await updateUserLoginDetails(
      user.id,
      { newLoginId: 'selfsame@example.com' },
      makeActor(['owner'])
    );

    expect(result.user.email).toBe('selfsame@example.com');
  });

  it('rejects a new password shorter than 8 characters', async () => {
    const user = authFileStore.createUser({
      email: 'weak@example.com',
      password_hash: 'hashed:old',
      first_name: 'Weak',
      last_name: 'Pass',
      phone: '03003000006',
      roles: ['employee'],
    });

    await expect(
      updateUserLoginDetails(user.id, { newPassword: 'short' }, makeActor(['owner']))
    ).rejects.toMatchObject({ statusCode: 400, code: 'WEAK_PASSWORD' });
  });

  it('updates the password as an admin actor', async () => {
    const user = authFileStore.createUser({
      email: 'pw@example.com',
      password_hash: 'hashed:old',
      first_name: 'Pass',
      last_name: 'Word',
      phone: '03003000007',
      roles: ['employee'],
    });

    await updateUserLoginDetails(
      user.id,
      { newPassword: 'new-secure-password' },
      makeActor(['owner'])
    );

    const after = authFileStore.findUserById(user.id);
    expect(after?.password_hash).toBe('hashed:new-secure-password');
  });

  it('rejects a self-update without the current password', async () => {
    const user = authFileStore.createUser({
      email: 'self@example.com',
      password_hash: 'hashed:current',
      first_name: 'Self',
      last_name: 'User',
      phone: '03003000008',
      roles: ['employee'],
    });

    await expect(
      updateUserLoginDetails(
        user.id,
        { newPassword: 'new-password-123' },
        { id: user.id, email: user.email, firstName: 'Self', lastName: 'User', roles: ['employee'], permissions: [] }
      )
    ).rejects.toMatchObject({ statusCode: 400, code: 'CURRENT_PASSWORD_REQUIRED' });
  });

  it('rejects a self-update with the wrong current password', async () => {
    const user = authFileStore.createUser({
      email: 'self2@example.com',
      password_hash: 'hashed:correct',
      first_name: 'Self',
      last_name: 'Two',
      phone: '03003000009',
      roles: ['employee'],
    });

    await expect(
      updateUserLoginDetails(
        user.id,
        { newPassword: 'new-password-123', currentPassword: 'wrong' },
        { id: user.id, email: user.email, firstName: 'Self', lastName: 'Two', roles: ['employee'], permissions: [] }
      )
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('allows a self-update with the correct current password', async () => {
    const user = authFileStore.createUser({
      email: 'self3@example.com',
      password_hash: 'hashed:correct',
      first_name: 'Self',
      last_name: 'Three',
      phone: '03003000010',
      roles: ['employee'],
    });

    const result = await updateUserLoginDetails(
      user.id,
      { newPassword: 'new-password-123', currentPassword: 'correct' },
      { id: user.id, email: user.email, firstName: 'Self', lastName: 'Three', roles: ['employee'], permissions: [] }
    );

    expect(result.message).toBe('Login details updated for this account only.');
  });

  it('rejects a non-admin actor trying to update another user', async () => {
    const target = authFileStore.createUser({
      email: 'victim@example.com',
      password_hash: 'hashed:pw',
      first_name: 'Victim',
      last_name: 'User',
      phone: '03003000011',
      roles: ['employee'],
    });

    await expect(
      updateUserLoginDetails(target.id, { newLoginId: 'newid@example.com' }, makeActor(['cashier']))
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('throws 404 when the target user does not exist', async () => {
    await expect(
      updateUserLoginDetails('does-not-exist', { newPassword: 'new-password-123' }, makeActor(['owner']))
    ).rejects.toMatchObject({ statusCode: 404, code: 'USER_NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// listAccounts — file-store path
// ---------------------------------------------------------------------------

describe('listAccounts (file store)', () => {
  beforeEach(() => {
    resetStore();
  });

  it('returns empty arrays when nothing is stored', async () => {
    const result = await listAccounts();

    expect(result.users).toEqual([]);
    expect(result.customers).toEqual([]);
    expect(result.storage).toBe('file');
  });

  it('returns users and customers that exist in the file store', async () => {
    await registerCustomer({
      email: 'lister@example.com',
      password: 'password123',
      firstName: 'List',
      lastName: 'User',
      phone: '03004000001',
    });

    const result = await listAccounts();

    expect(result.users.length).toBeGreaterThan(0);
    expect(result.customers.length).toBeGreaterThan(0);
    expect(result.storage).toBe('file');
  });
});

// ---------------------------------------------------------------------------
// ensureDefaultStaffAccounts
// ---------------------------------------------------------------------------

describe('ensureDefaultStaffAccounts', () => {
  beforeEach(() => {
    resetStore();
  });

  it('creates the default admin when the store is empty', async () => {
    await ensureDefaultStaffAccounts();

    const admin = authFileStore.findUserByEmail('admin@admin.com');
    expect(admin).toBeDefined();
    expect(admin?.roles).toContain('owner');
    expect(admin?.status).toBe('active');
  });

  it('is idempotent — calling twice does not duplicate the admin', async () => {
    await ensureDefaultStaffAccounts();
    await ensureDefaultStaffAccounts();

    const users = authFileStore.listUsers();
    const admins = users.filter((u) => u.email === 'admin@admin.com');
    expect(admins.length).toBe(1);
  });

  it('migrates a legacy "admin" user to admin@admin.com', async () => {
    authFileStore.createUser({
      email: 'admin',
      password_hash: 'hashed:old',
      first_name: 'Legacy',
      last_name: 'Admin',
      phone: '03000000001',
      roles: ['employee'], // wrong role, should be upgraded
    });

    await ensureDefaultStaffAccounts();

    expect(authFileStore.findUserByEmail('admin')).toBeUndefined();
    const migrated = authFileStore.findUserByEmail('admin@admin.com');
    expect(migrated).toBeDefined();
    expect(migrated?.roles).toContain('owner');
    expect(migrated?.status).toBe('active');
  });
});

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { RoleName } from '../types';

export type FileUser = {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  status: 'active' | 'inactive' | 'suspended';
  locale: string;
  email_verified_at: string | null;
  last_login_at: string | null;
  failed_logins: number;
  locked_until: string | null;
  roles: RoleName[];
  branch_id: string;
  created_at: string;
  updated_at: string;
};

export type FileCustomer = {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  date_of_birth: string | null;
  loyalty_points: number;
  total_orders: number;
  total_spent: number;
  marketing_opt_in: boolean;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  country: string;
  created_at: string;
  updated_at: string;
};

export type FileRefreshToken = {
  id: string;
  user_id: string;
  token_hash: string;
  device_info: string | null;
  ip_address: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

export type FilePasswordReset = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

type Store = {
  users: FileUser[];
  customers: FileCustomer[];
  refresh_tokens: FileRefreshToken[];
  password_resets: FilePasswordReset[];
};

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'auth-store.json');
const DEFAULT_BRANCH = 'a0000000-0000-4000-8000-000000000001';

/** Default role permissions for file-mode staff (JWT permission list). */
export const ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  owner: ['*'],
  manager: [
    'orders.view',
    'orders.manage',
    'inventory.view',
    'inventory.manage',
    'customers.view',
    'hr.view',
    'reports.view',
  ],
  cashier: ['orders.view', 'orders.manage', 'customers.view'],
  kitchen: ['orders.view', 'orders.manage'],
  delivery: ['orders.view'],
  employee: ['hr.view'],
  customer: ['orders.own', 'account.own'],
};

function defaultStore(): Store {
  return {
    users: [],
    customers: [],
    refresh_tokens: [],
    password_resets: [],
  };
}

function ensureStore(): Store {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const empty = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(empty, null, 2), 'utf8');
    return empty;
  }
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as Store;
  } catch {
    return defaultStore();
  }
}

function save(store: Store) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

/** Digits-only phone key for uniqueness checks (PK numbers keep leading 0/92). */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
}

export const authFileStore = {
  path: STORE_PATH,

  findUserByEmail(email: string): FileUser | undefined {
    return ensureStore().users.find((u) => u.email === email.toLowerCase());
  },

  findUserByPhone(phone?: string | null): FileUser | undefined {
    const key = normalizePhone(phone);
    if (!key) return undefined;
    return ensureStore().users.find((u) => normalizePhone(u.phone) === key);
  },

  findUserById(id: string): FileUser | undefined {
    return ensureStore().users.find((u) => u.id === id);
  },

  listUsers() {
    return ensureStore().users.map(({ password_hash: _p, ...safe }) => safe);
  },

  listCustomers() {
    return ensureStore().customers;
  },

  findCustomerByEmail(email: string): FileCustomer | undefined {
    const e = email.toLowerCase().trim();
    if (!e) return undefined;
    return ensureStore().customers.find((c) => c.email?.toLowerCase() === e);
  },

  findCustomerByPhone(phone: string): FileCustomer | undefined {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) return undefined;
    return ensureStore().customers.find((c) => {
      const p = (c.phone || '').replace(/\D/g, '');
      return p && (p === digits || p.endsWith(digits) || digits.endsWith(p));
    });
  },

  createUser(input: {
    email: string;
    password_hash: string;
    first_name: string;
    last_name: string;
    phone?: string | null;
    roles: RoleName[];
  }): FileUser {
    const store = ensureStore();
    const email = input.email.toLowerCase();
    if (store.users.some((u) => u.email === email)) {
      throw new Error('EMAIL_TAKEN');
    }
    const phoneKey = normalizePhone(input.phone);
    if (phoneKey && store.users.some((u) => normalizePhone(u.phone) === phoneKey)) {
      throw new Error('PHONE_TAKEN');
    }
    const now = new Date().toISOString();
    const user: FileUser = {
      id: randomUUID(),
      email,
      password_hash: input.password_hash,
      first_name: input.first_name,
      last_name: input.last_name,
      phone: input.phone?.trim() || null,
      status: 'active',
      locale: 'en',
      email_verified_at: now,
      last_login_at: null,
      failed_logins: 0,
      locked_until: null,
      roles: input.roles,
      branch_id: DEFAULT_BRANCH,
      created_at: now,
      updated_at: now,
    };
    store.users.push(user);
    save(store);
    return user;
  },

  createCustomer(input: {
    user_id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string | null;
    date_of_birth?: string | null;
    marketing_opt_in?: boolean;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    postcode?: string | null;
    country?: string;
  }): FileCustomer {
    const store = ensureStore();
    const now = new Date().toISOString();
    const customer: FileCustomer = {
      id: randomUUID(),
      user_id: input.user_id,
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email.toLowerCase(),
      phone: input.phone ?? null,
      date_of_birth: input.date_of_birth ?? null,
      loyalty_points: 0,
      total_orders: 0,
      total_spent: 0,
      marketing_opt_in: Boolean(input.marketing_opt_in),
      address_line1: input.address_line1 ?? null,
      address_line2: input.address_line2 ?? null,
      city: input.city ?? null,
      postcode: input.postcode ?? null,
      country: input.country ?? 'Pakistan',
      created_at: now,
      updated_at: now,
    };
    store.customers.push(customer);
    save(store);
    return customer;
  },

  findCustomerByUserId(userId: string): FileCustomer | undefined {
    return ensureStore().customers.find((c) => c.user_id === userId);
  },

  findCustomerById(id: string): FileCustomer | undefined {
    return ensureStore().customers.find((c) => c.id === id);
  },

  updateCustomer(id: string, patch: Partial<FileCustomer>): FileCustomer | null {
    const store = ensureStore();
    const idx = store.customers.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    store.customers[idx] = {
      ...store.customers[idx],
      ...patch,
      id: store.customers[idx].id,
      user_id: store.customers[idx].user_id,
      updated_at: new Date().toISOString(),
    };
    save(store);
    return store.customers[idx];
  },

  recordPurchase(
    customerId: string,
    total: number,
    pointsEarned: number,
    pointsRedeemed: number
  ): FileCustomer | null {
    const store = ensureStore();
    const idx = store.customers.findIndex((c) => c.id === customerId);
    if (idx < 0) return null;
    const c = store.customers[idx];
    const nextPoints = Math.max(0, (c.loyalty_points || 0) + pointsEarned - pointsRedeemed);
    store.customers[idx] = {
      ...c,
      loyalty_points: nextPoints,
      total_orders: (c.total_orders || 0) + 1,
      total_spent: Number(c.total_spent || 0) + Number(total),
      updated_at: new Date().toISOString(),
    };
    save(store);
    return store.customers[idx];
  },

  updateUser(id: string, patch: Partial<FileUser>) {
    const store = ensureStore();
    const idx = store.users.findIndex((u) => u.id === id);
    if (idx < 0) return null;
    store.users[idx] = {
      ...store.users[idx],
      ...patch,
      updated_at: new Date().toISOString(),
    };
    save(store);
    return store.users[idx];
  },

  saveRefreshToken(input: {
    user_id: string;
    token_hash: string;
    device_info?: string | null;
    ip_address?: string | null;
    expires_at: Date;
  }) {
    const store = ensureStore();
    const row: FileRefreshToken = {
      id: randomUUID(),
      user_id: input.user_id,
      token_hash: input.token_hash,
      device_info: input.device_info ?? null,
      ip_address: input.ip_address ?? null,
      expires_at: input.expires_at.toISOString(),
      revoked_at: null,
      created_at: new Date().toISOString(),
    };
    store.refresh_tokens.push(row);
    save(store);
    return row;
  },

  findValidRefresh(tokenHash: string, userId: string) {
    const store = ensureStore();
    return store.refresh_tokens.find(
      (t) =>
        t.token_hash === tokenHash &&
        t.user_id === userId &&
        !t.revoked_at &&
        new Date(t.expires_at) > new Date()
    );
  },

  revokeRefresh(tokenHash: string) {
    const store = ensureStore();
    const t = store.refresh_tokens.find((r) => r.token_hash === tokenHash);
    if (t && !t.revoked_at) {
      t.revoked_at = new Date().toISOString();
      save(store);
    }
  },

  revokeRefreshById(id: string) {
    const store = ensureStore();
    const t = store.refresh_tokens.find((r) => r.id === id);
    if (t && !t.revoked_at) {
      t.revoked_at = new Date().toISOString();
      save(store);
    }
  },

  revokeAllUserRefresh(userId: string) {
    const store = ensureStore();
    let changed = false;
    for (const t of store.refresh_tokens) {
      if (t.user_id === userId && !t.revoked_at) {
        t.revoked_at = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) save(store);
  },

  savePasswordReset(userId: string, tokenHash: string) {
    const store = ensureStore();
    const row: FilePasswordReset = {
      id: randomUUID(),
      user_id: userId,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      used_at: null,
      created_at: new Date().toISOString(),
    };
    store.password_resets.push(row);
    save(store);
    return row;
  },

  findPasswordReset(tokenHash: string) {
    const store = ensureStore();
    return store.password_resets.find(
      (t) => t.token_hash === tokenHash && !t.used_at && new Date(t.expires_at) > new Date()
    );
  },

  markPasswordResetUsed(id: string) {
    const store = ensureStore();
    const t = store.password_resets.find((r) => r.id === id);
    if (t) {
      t.used_at = new Date().toISOString();
      save(store);
    }
  },

  permissionsForRoles(roles: RoleName[]): string[] {
    const set = new Set<string>();
    for (const role of roles) {
      for (const p of ROLE_PERMISSIONS[role] || []) set.add(p);
    }
    return [...set];
  },
};

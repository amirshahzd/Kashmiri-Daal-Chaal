/** File-store suppliers when Postgres is offline. */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export type FileSupplier = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  postcode: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'suppliers-store.json');

function ensure(): FileSupplier[] {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, '[]', 'utf8');
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as FileSupplier[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save(rows: FileSupplier[]) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(rows, null, 2), 'utf8');
}

export const supplierFileStore = {
  list(): FileSupplier[] {
    return ensure().sort((a, b) => a.name.localeCompare(b.name));
  },

  create(input: {
    name: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    postcode?: string | null;
    notes?: string | null;
  }): FileSupplier {
    const rows = ensure();
    const now = new Date().toISOString();
    const row: FileSupplier = {
      id: randomUUID(),
      name: input.name.trim(),
      contact_name: input.contactName?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      phone: input.phone?.trim() || null,
      city: input.city?.trim() || null,
      postcode: input.postcode?.trim() || null,
      notes: input.notes?.trim() || null,
      created_at: now,
      updated_at: now,
    };
    rows.unshift(row);
    save(rows);
    return row;
  },
};

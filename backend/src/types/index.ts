import { Request } from 'express';

export type RoleName =
  | 'owner'
  | 'manager'
  | 'cashier'
  | 'kitchen'
  | 'delivery'
  | 'employee'
  | 'customer';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: RoleName[];
  permissions: string[];
  branchId?: string;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

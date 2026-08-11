const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

type ApiResult<T> = { success: true; data: T } | { success: false; error: { message: string; code?: string; details?: unknown } };

export class ApiError extends Error {
  code?: string;
  status: number;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check that the API is running.', 0, 'NETWORK');
  }

  let body: ApiResult<T> | null = null;
  try {
    body = (await res.json()) as ApiResult<T>;
  } catch {
    throw new ApiError(res.ok ? 'Empty response from server' : `Request failed (${res.status})`, res.status);
  }

  if (!res.ok || !body.success) {
    const errBody = body && 'success' in body && body.success === false ? body.error : undefined;
    throw new ApiError(errBody?.message || 'Request failed', res.status, errBody?.code);
  }
  return body.data;
}

export { API_URL };

import { useAuth } from './stores';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function errorMessage(body: unknown) {
  if (!body || typeof body !== 'object') return 'Request failed';
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join(' ');
  if (typeof message === 'string') return message;
  return 'Request failed';
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(options.headers);
  const token = useAuth.getState().accessToken;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { ...options, headers, credentials: 'include' });
  if (response.status === 401 && retry && !path.startsWith('/api/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) return api<T>(path, options, false);
    useAuth.getState().clear();
    throw new ApiError(401, 'Session expired');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, errorMessage(body));
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function refreshSession() {
  const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
  if (!response.ok) return false;
  const data = (await response.json()) as {
    accessToken: string;
    user: NonNullable<ReturnType<typeof useAuth.getState>['user']>;
  };
  useAuth.getState().setSession(data);
  return true;
}

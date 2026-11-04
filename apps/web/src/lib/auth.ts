// ============================================================
// DROP LOGISTICS — Client-side Auth Utilities
// ============================================================

import type { User, Role } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4000';
const TOKEN_KEY = 'drop_token';

// ── Token Storage ─────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

// middleware.ts runs on the server and can only see cookies, not
// localStorage — so the token must be mirrored into a cookie of the same
// name, or every navigation gets bounced back to /auth/login even after a
// successful API login. 7 days matches the server's JWT_EXPIRES_IN default.
const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function setToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  try {
    document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${TOKEN_MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch {}
}

export function removeToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
  try {
    document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
  } catch {}
}

// ── API Calls ─────────────────────────────────────────────────

// Returns { user, token } or throws with the server error message
export async function apiLogin(email: string, password: string): Promise<{ user: User; token: string }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? 'Invalid credentials');
  }
  return json.data; // { user, token }
}

export async function apiRegister(data: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<{ user: User; token: string }> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(typeof json.error === 'string' ? json.error : 'Registration failed');
  }
  return json.data; // { user, token }
}

export async function apiMe(token: string): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error('Session expired');
  }
  return json.data; // user object
}

export async function apiLogout(token: string): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
  removeToken();
}

// ── Role → Dashboard Route ─────────────────────────────────────

export function dashboardRoute(role: Role): string {
  const routes: Record<Role, string> = {
    SUPER_ADMIN:    '/dashboard/admin',
    MANAGER:        '/dashboard/manager',
    BUSINESS_OWNER: '/dashboard/owner',
    RIDER:          '/dashboard/rider',
    CUSTOMER:       '/dashboard/customer',
  };
  return routes[role] ?? '/dashboard/customer';
}

// ============================================================
// DROP LOGISTICS — Auth Store (Zustand)
// ============================================================

import { create } from 'zustand';
import {
  apiLogin, apiRegister, apiMe, apiLogout,
  dashboardRoute,
  getToken, setToken, removeToken,
} from '@/lib/auth';
import { api } from '@/lib/api';
import type { User } from '@/types';

interface AuthState {
  user:        User | null;
  token:       string | null;
  isLoading:   boolean;
  isHydrated:  boolean;

  hydrate():   Promise<void>;
  login(email: string, password: string): Promise<{ ok: boolean; redirectTo?: string; error?: string }>;
  register(data: { name: string; email: string; phone?: string; password: string; role?: string }): Promise<{ ok: boolean; redirectTo?: string; error?: string }>;
  logout():    Promise<void>;
  deleteAccount(): Promise<{ ok: boolean; error?: string }>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user:       null,
  token:      null,
  isLoading:  false,
  isHydrated: false,

  // ── Hydrate from localStorage on app boot ──────────────────
  async hydrate() {
    if (get().isHydrated) return;

    const token = getToken();
    if (!token) {
      set({ isHydrated: true });
      return;
    }

    try {
      const user = await apiMe(token);
      if (user?.id) {
        set({ user, token, isHydrated: true });
      } else {
        removeToken();
        set({ user: null, token: null, isHydrated: true });
      }
    } catch {
      removeToken();
      set({ user: null, token: null, isHydrated: true });
    }
  },

  // ── Login ──────────────────────────────────────────────────
  async login(email, password) {
    set({ isLoading: true });
    try {
      const data = await apiLogin(email, password);
      if (!data?.token) {
        set({ isLoading: false });
        return { ok: false, error: 'Invalid credentials' };
      }
      setToken(data.token);
      set({ user: data.user, token: data.token, isLoading: false });
      return { ok: true, redirectTo: dashboardRoute(data.user.role) };
    } catch (err: unknown) {
      set({ isLoading: false });
      return { ok: false, error: err instanceof Error ? err.message : 'Login failed' };
    }
  },

  // ── Register ───────────────────────────────────────────────
  async register(data) {
    set({ isLoading: true });
    try {
      const res = await apiRegister(data);
      if (!res?.token) {
        set({ isLoading: false });
        return { ok: false, error: 'Registration failed' };
      }
      setToken(res.token);
      set({ user: res.user, token: res.token, isLoading: false });
      return { ok: true, redirectTo: dashboardRoute(res.user.role) };
    } catch (err: unknown) {
      set({ isLoading: false });
      return { ok: false, error: err instanceof Error ? err.message : 'Registration failed' };
    }
  },

  // ── Logout ─────────────────────────────────────────────────
  async logout() {
    const { token } = get();
    set({ isLoading: true });
    try {
      if (token) await apiLogout(token);
    } catch {
      // ignore server errors on logout
    } finally {
      removeToken();
      set({ user: null, token: null, isLoading: false });
    }
  },

  // ── Delete account ───────────────────────────────────────────
  async deleteAccount() {
    const { token } = get();
    if (!token) return { ok: false, error: 'Not signed in' };
    try {
      await api.deleteAccount(token);
      removeToken();
      set({ user: null, token: null });
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to delete account' };
    }
  },
}));

// Boot hydration — runs once when module is first imported on client
if (typeof window !== 'undefined') {
  useAuth.getState().hydrate();
}

'use client';

// ============================================================
// DROP LOGISTICS — Login Page
// ============================================================

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoading, user } = useAuth();

  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [error,     setError]     = useState('');

  // Already logged in → redirect
  useEffect(() => {
    if (user) {
      const from = searchParams.get('from');
      router.replace(from ?? '/dashboard/customer');
    }
  }, [user, router, searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const result = await login(email, password);
    if (!result.ok) {
      setError(result.error ?? 'Login failed');
      return;
    }
    router.replace(result.redirectTo ?? '/dashboard/customer');
  }

  return (
    <div className="min-h-screen bg-[#1A1208] flex flex-col items-center justify-center px-4">

      {/* Logo */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-[#E8420A] flex items-center justify-center shadow-lg">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <path d="M18 4C18 4 8 10 8 20C8 25.5 12.5 30 18 30C23.5 30 28 25.5 28 20C28 10 18 4 18 4Z" fill="white" opacity="0.9"/>
            <path d="M18 30L12 36H24L18 30Z" fill="white"/>
          </svg>
        </div>
        <h1 className="text-white text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-syne, sans-serif)' }}>
          Drop
        </h1>
        <p className="text-white/40 text-sm">Whatever you need, dropped in minutes</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-3xl p-8">
        <h2 className="text-white text-xl font-bold mb-1">Welcome back</h2>
        <p className="text-white/40 text-sm mb-7">Sign in to your account</p>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-white/60 text-xs font-medium">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:border-[#E8420A] transition-colors"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-white/60 text-xs font-medium">Password</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 pr-11 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:border-[#E8420A] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPass((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-xl px-3 py-2.5">
              <AlertCircle size={15} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-xl bg-[#E8420A] text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all mt-2"
            style={{ boxShadow: '0 4px 20px rgba(232,66,10,0.35)' }}
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : 'Sign in'}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-white/30 text-xs">or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <p className="text-center text-white/40 text-sm">
          New customer?{' '}
          <Link href="/auth/register" className="text-[#E8420A] font-semibold hover:underline">
            Create account
          </Link>
        </p>
      </div>

      {/* Dev hint */}
      <p className="mt-6 text-white/20 text-xs text-center">
        admin@drop.ng/admin · rider1@drop.ng/rider · customer1@test.ng/customer
      </p>
    </div>
  );
}

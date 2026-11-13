'use client';
// VELTO MOBILITY PLATFORM — Reset Password Page

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token  = params.get('token') ?? '';

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState('');
  const [showPw, setShowPw]       = useState(false);

  useEffect(() => {
    if (!token) setError('Invalid or missing reset link. Please request a new one.');
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/reset-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (data.success) {
        setDone(true);
        setTimeout(() => router.push('/auth/login'), 3000);
      } else {
        setError(typeof data.error === 'string' ? data.error : 'Failed to reset password. The link may have expired.');
      }
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0A1628 0%, #0D2040 60%, #0A2A3A 100%)' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="/icons/logo.svg"
            alt="Velto"
            width={56}
            height={56}
            className="mb-3"
            onError={(e) => { (e.target as HTMLImageElement).src = '/icons/logo.png'; }}
          />
          <h1 className="text-white text-2xl font-extrabold tracking-tight">Velto</h1>
        </div>

        <div
          className="rounded-2xl p-7"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          {done ? (
            <div className="text-center">
              <div className="text-4xl mb-4">✅</div>
              <h2 className="text-white text-xl font-bold mb-2">Password updated!</h2>
              <p className="text-white/60 text-sm leading-relaxed mb-4">
                Your password has been changed. Redirecting you to sign in…
              </p>
              <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto"
                style={{ borderColor: '#0E7BC4 transparent transparent transparent' }} />
            </div>
          ) : (
            <>
              <h2 className="text-white text-xl font-bold mb-1">Set new password</h2>
              <p className="text-white/50 text-sm mb-6 leading-relaxed">
                Choose a strong password of at least 8 characters.
              </p>

              {error && (
                <div className="mb-4 px-4 py-3 rounded-lg text-sm text-red-300"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-white/60 text-xs font-semibold uppercase tracking-wide mb-1.5">
                    New password
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      required
                      className="w-full px-4 py-3 pr-12 rounded-xl text-white text-sm placeholder-white/30 outline-none"
                      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                      onFocus={(e) => { e.target.style.borderColor = '#0E7BC4'; }}
                      onBlur={(e)  => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-xs"
                    >
                      {showPw ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-white/60 text-xs font-semibold uppercase tracking-wide mb-1.5">
                    Confirm password
                  </label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat password"
                    required
                    className="w-full px-4 py-3 rounded-xl text-white text-sm placeholder-white/30 outline-none"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                    onFocus={(e) => { e.target.style.borderColor = '#0E7BC4'; }}
                    onBlur={(e)  => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !token}
                  className="w-full py-3 rounded-xl text-white font-bold text-sm transition-opacity disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #0E7BC4, #06C4A8)', boxShadow: '0 4px 20px rgba(14,123,196,0.40)' }}
                >
                  {loading ? 'Updating…' : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>

        {!done && (
          <p className="text-center text-white/40 text-sm mt-6">
            Link expired?{' '}
            <button onClick={() => router.push('/auth/forgot-password')} className="font-semibold" style={{ color: '#06C4A8' }}>
              Request a new one
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

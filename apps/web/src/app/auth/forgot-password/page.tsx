'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';
const BG = 'linear-gradient(135deg, #0D0808 0%, #1A0E0E 60%, #0D0808 100%)';
const BTN = { background: 'linear-gradient(135deg, #FF6500, #D4186C)', boxShadow: '0 4px 20px rgba(255,101,0,0.40)' };

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) { setSent(true); } else { setError(data.error ?? 'Something went wrong.'); }
    } catch { setError('Network error. Check your connection and try again.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: BG }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/icons/icon-192.png" alt="Velto" width={56} height={56} className="mb-3 rounded-2xl" />
          <h1 className="text-white text-2xl font-extrabold tracking-tight">Velto</h1>
        </div>

        <div className="rounded-2xl p-7" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,101,0,0.12)' }}>
          {sent ? (
            <div className="text-center">
              <div className="text-4xl mb-4">📬</div>
              <h2 className="text-white text-xl font-bold mb-2">Check your email</h2>
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                If <span className="text-white/80">{email}</span> is registered, we sent a reset link. It expires in <strong className="text-white/80">1 hour</strong>.
              </p>
              <p className="text-white/40 text-xs mb-6">Didn&apos;t receive it? Check your spam folder or try again.</p>
              <button onClick={() => { setSent(false); setEmail(''); }} className="text-sm font-semibold" style={{ color: '#FF6500' }}>
                Try a different email
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-white text-xl font-bold mb-1">Forgot password?</h2>
              <p className="text-white/50 text-sm mb-6 leading-relaxed">Enter your account email and we&apos;ll send you a reset link.</p>

              {error && (
                <div className="mb-4 px-4 py-3 rounded-lg text-sm text-red-300" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-white/60 text-xs font-semibold uppercase tracking-wide mb-1.5">Email address</label>
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com" required
                    className="w-full px-4 py-3 rounded-xl text-white text-sm placeholder-white/30 outline-none transition-colors"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                    onFocus={(e) => { e.target.style.borderColor = '#FF6500'; }}
                    onBlur={(e)  => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                  />
                </div>
                <button type="submit" disabled={loading || !email} className="w-full py-3 rounded-xl text-white font-bold text-sm transition-opacity disabled:opacity-50" style={BTN}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-white/40 text-sm mt-6">
          Remember your password?{' '}
          <button onClick={() => router.push('/auth/login')} className="font-semibold" style={{ color: '#FF6500' }}>Sign in</button>
        </p>
      </div>
    </div>
  );
}

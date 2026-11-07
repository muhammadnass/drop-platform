'use client';

// ============================================================
// DROP LOGISTICS — Register Page (Customer self-registration)
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface FormData {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirm: string;
}

const PHONE_RE = /^(\+234|0)[789]\d{9}$/;

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuth();

  const [form, setForm] = useState<FormData>({
    name: '', email: '', phone: '', password: '', confirm: '',
  });
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState(false);

  function set(field: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  // Password strength
  const pwStrength = (() => {
    const p = form.password;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8)            s++;
    if (/[A-Z]/.test(p))         s++;
    if (/[0-9]/.test(p))         s++;
    if (/[^A-Za-z0-9]/.test(p))  s++;
    return s; // 0–4
  })();

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][pwStrength];
  const strengthColor = ['', '#ef4444', '#f97316', '#eab308', '#22c55e'][pwStrength];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!form.phone) {
      setError('Phone number is required');
      return;
    }
    if (!PHONE_RE.test(form.phone)) {
      setError('Enter a valid Nigerian phone number (e.g. 08012345678)');
      return;
    }

    const result = await register({
      name:     form.name,
      email:    form.email,
      phone:    form.phone,
      password: form.password,
    });

    if (!result.ok) {
      setError(result.error ?? 'Registration failed');
      return;
    }

    setSuccess(true);
    setTimeout(() => router.replace('/dashboard/customer'), 1200);
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#1A1208] flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-green-400" />
        </div>
        <p className="text-white text-lg font-semibold">Account created!</p>
        <p className="text-white/40 text-sm">Taking you to your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A1208] flex flex-col items-center justify-center px-4 py-12">

      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-lg">
          <img src="/icons/logo.png" alt="Drop" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-white text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-syne, sans-serif)' }}>
          Drop
        </h1>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-3xl p-8">
        <h2 className="text-white text-xl font-bold mb-1">Create account</h2>
        <p className="text-white/40 text-sm mb-7">Start sending deliveries today</p>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-white/60 text-xs font-medium">Full name</label>
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              placeholder="Aminu Bello"
              required
              autoComplete="name"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:border-[#E8420A] transition-colors"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-white/60 text-xs font-medium">Email address</label>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:border-[#E8420A] transition-colors"
            />
          </div>

          {/* Phone (required) */}
          <div className="space-y-1.5">
            <label className="text-white/60 text-xs font-medium">Phone number</label>
            <input
              type="tel"
              value={form.phone}
              onChange={set('phone')}
              placeholder="08012345678"
              required
              autoComplete="tel"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:border-[#E8420A] transition-colors"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-white/60 text-xs font-medium">Password</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                placeholder="Min. 8 characters"
                required
                autoComplete="new-password"
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
            {/* Strength bar */}
            {form.password && (
              <div className="flex items-center gap-2 pt-1">
                <div className="flex gap-1 flex-1">
                  {[1,2,3,4].map((i) => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full transition-all duration-300"
                      style={{ backgroundColor: i <= pwStrength ? strengthColor : 'rgba(255,255,255,0.1)' }}
                    />
                  ))}
                </div>
                <span className="text-xs" style={{ color: strengthColor }}>{strengthLabel}</span>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label className="text-white/60 text-xs font-medium">Confirm password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={form.confirm}
                onChange={set('confirm')}
                placeholder="Repeat password"
                required
                autoComplete="new-password"
                className="w-full px-4 py-3 pr-11 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:border-[#E8420A] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
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
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : 'Create account'}
          </button>
        </form>

        <p className="text-center text-white/40 text-sm mt-6">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-[#E8420A] font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>

      <p className="mt-6 text-white/20 text-xs text-center max-w-xs">
        By creating an account you agree to Drop&apos;s Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}

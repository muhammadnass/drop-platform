'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { fileToResizedBase64 } from '@/lib/image';

const SERVER_BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4000';

function Spinner() { return <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />; }
function fmt(n: number) { return `₦${Math.round(n).toLocaleString()}`; }

// ── Avatar upload tile ──────────────────────────────────
 function AvatarUpload({ url, name, onCapture, loading }: { url?: string | null; name?: string; onCapture: (b64: string) => void; loading?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await fileToResizedBase64(file, 640, 0.85);
    onCapture(b64);
    e.target.value = '';
  };
  // Accept base64 data URLs, absolute https URLs, or relative server paths
  const resolved = url
    ? (url.startsWith('data:') || url.startsWith('http') ? url : `${SERVER_BASE}${url}`)
    : null;
  const initial = (name ?? '?').trim().charAt(0).toUpperCase();
  return (
    <div className="flex flex-col items-center gap-2">
      <button onClick={() => ref.current?.click()} disabled={loading}
        className="relative w-20 h-20 rounded-full overflow-hidden border-2 bg-[#2a2a2a] flex items-center justify-center" style={{ borderColor: '#0E7BC4' }}>
        {resolved
          ? <img src={resolved} className="w-full h-full object-cover" alt="Profile" />
          : loading ? <Spinner /> : <span className="text-2xl font-bold text-white/60">{initial}</span>
        }
        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] text-center py-1">Change</div>
      </button>
      <input ref={ref} type="file" accept="image/*" onChange={handleChange} className="hidden" />
    </div>
  );
}

// ── Fund Wallet Sheet ────────────────────────────────────────
function FundWalletSheet({ onClose, onInitiated }: { onClose: () => void; onInitiated: (url: string) => void }) {
  const { token } = useAuth();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const presets = [1000, 2000, 5000, 10000];

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt < 100) { setError('Enter at least ₦100'); return; }
    setBusy(true); setError('');
    try {
      const { authorization_url } = await api.customerWalletTopup(amt, token!);
      onInitiated(authorization_url);
    } catch (err: any) {
      setError(err.message ?? 'Could not start payment');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center p-4">
      <div className="w-full max-w-sm bg-[#1a1a1a] border border-white/10 rounded-3xl p-6 space-y-4">
        <h3 className="font-bold text-lg">Fund Wallet</h3>
        <div className="grid grid-cols-4 gap-2">
          {presets.map((p) => (
            <button key={p} onClick={() => setAmount(String(p))}
              className={`py-2 rounded-xl text-xs font-semibold border ${amount === String(p) ? 'text-white' : 'border-white/10 text-white/60'}`}
              style={amount === String(p) ? { borderColor: '#0E7BC4', background: 'rgba(14,123,196,0.12)' } : {}}>
              {fmt(p)}
            </button>
          ))}
        </div>
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="Enter amount (₦)" inputMode="numeric"
          className="w-full bg-[#2a2a2a] text-white px-4 py-3 rounded-xl text-sm outline-none placeholder-white/30" />
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/20 text-white/60 font-semibold">Cancel</button>
          <button onClick={submit} disabled={busy} className="flex-grow py-3 rounded-xl text-white font-bold disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #0E7BC4, #06C4A8)' }}>
            {busy ? <Spinner /> : 'Continue to pay'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CustomerSettingsPage() {
  const router = useRouter();
  const { user, token, deleteAccount, logout, setUser } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wallet, setWallet] = useState<any>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [showFund, setShowFund] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const handleAvatar = async (b64: string) => {
    if (!token || !user) return;
    setAvatarUploading(true);
    setError('');
    try {
      // Store base64 directly in DB — avoids ephemeral filesystem on Render
      const updated = await api.updateMe({ avatarUrl: b64 }, token);
      setUser(updated);
    } catch (err: any) {
      setError(err.message ?? 'Failed to update profile photo');
    } finally {
      setAvatarUploading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    api.customerWallet(token).then(setWallet).catch(() => {}).finally(() => setWalletLoading(false));
  }, [token]);

  const handleDelete = async () => {
    setBusy(true); setError('');
    const res = await deleteAccount();
    setBusy(false);
    if (res.ok) { router.replace('/auth/login'); return; }
    setError(res.error ?? 'Failed to delete account');
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white pb-16">
      <div className="bg-[#1a1a1a] px-4 pb-4 flex items-center gap-3 sticky top-0 z-10" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <button onClick={() => router.back()} className="text-white/60 hover:text-white text-xl">←</button>
        <div className="flex-1">
          <p className="text-white font-bold">My Account</p>
          <p className="text-white/40 text-xs">{user?.name}</p>
        </div>
      </div>

      <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">
        {/* ── Wallet ──────────────────────────────────────────── */}
        <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(14,123,196,0.18) 0%, rgba(6,196,168,0.08) 100%)', border: '1px solid rgba(14,123,196,0.25)' }}>
          <p className="text-white/50 text-xs uppercase tracking-widest mb-1">Wallet balance</p>
          <div className="flex items-center justify-between">
            <div>
              {walletLoading
                ? <div className="h-8 w-28 bg-white/10 rounded animate-pulse" />
                : <p className="text-3xl font-bold">{fmt(wallet?.balanceNgn ?? 0)}</p>}
              <p className="text-white/40 text-xs mt-1">Lifetime top-ups: {fmt(wallet?.lifetimeTopupNgn ?? 0)}</p>
            </div>
            <button onClick={() => setShowFund(true)}
              className="text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #0E7BC4, #06C4A8)' }}>
              + Fund Wallet
            </button>
          </div>
        </div>

        {/* ── Recent wallet activity ───────────────────────────── */}
        {wallet?.transactions?.length > 0 && (
          <div className="bg-[#1a1a1a] rounded-2xl p-5 space-y-3">
            <p className="text-white font-semibold text-sm uppercase tracking-widest opacity-60">Recent Activity</p>
            <div className="space-y-2">
              {wallet.transactions.slice(0, 8).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-white/80">{t.description ?? t.type}</p>
                    <p className="text-white/30 text-xs">{new Date(t.createdAt).toLocaleDateString()}</p>
                  </div>
                  <p className={`font-semibold ${t.type === 'TOPUP' ? 'text-green-400' : 'text-white/80'}`}>
                    {t.type === 'TOPUP' ? '+' : '-'}{fmt(t.amountNgn)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Account details ──────────────────────────────────── */}
        <div className="bg-[#1a1a1a] rounded-2xl p-5 space-y-3">
          <p className="text-white font-semibold text-sm uppercase tracking-widest opacity-60">Account</p>
          <div className="flex justify-center pb-1">
            <AvatarUpload url={user?.avatarUrl} name={user?.name} onCapture={handleAvatar} loading={avatarUploading} />
          </div>
          <div className="space-y-1">
            <p className="text-white/40 text-xs">Name</p>
            <p className="text-white text-sm">{user?.name}</p>
          </div>
          <div className="space-y-1">
            <p className="text-white/40 text-xs">Email</p>
            <p className="text-white text-sm">{user?.email}</p>
          </div>
          {user?.phone && (
            <div className="space-y-1">
              <p className="text-white/40 text-xs">Phone</p>
              <p className="text-white text-sm">{user.phone}</p>
            </div>
          )}
          <button onClick={() => router.push('/dashboard/customer/history')}
            className="w-full flex items-center justify-between border border-white/10 text-white/70 font-medium py-3 px-4 rounded-xl hover:bg-white/5 transition-all mt-2">
            Delivery History <span className="text-white/30">→</span>
          </button>
          <button onClick={async () => { await logout(); router.replace('/auth/login'); }}
            className="w-full border border-white/20 text-white/70 font-semibold py-3 rounded-xl hover:bg-white/5 transition-all">
            Log out
          </button>
        </div>

        <div className="bg-[#1a1a1a] rounded-2xl p-5 space-y-3">
          <p className="text-white font-semibold text-sm uppercase tracking-widest opacity-60">Danger Zone</p>
          <p className="text-white/40 text-xs">Deleting your account removes your personal data permanently. If you have delivery history, your account will be deactivated and your email/phone freed up, but past deliveries are kept for record-keeping.</p>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)}
              className="w-full border border-red-500/40 text-red-400 font-semibold py-3 rounded-xl hover:bg-red-500/10 transition-all">
              Delete my account
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-red-400 text-sm font-medium">Are you sure? This can&apos;t be undone.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="flex-1 py-3 rounded-xl border border-white/20 text-white/60 font-semibold">Cancel</button>
                <button onClick={handleDelete} disabled={busy}
                  className="flex-grow py-3 rounded-xl bg-red-500 text-white font-bold disabled:opacity-40">
                  {busy ? <Spinner /> : 'Yes, delete my account'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showFund && (
        <FundWalletSheet
          onClose={() => setShowFund(false)}
          onInitiated={(url) => { window.location.href = url; }}
        />
      )}
    </div>
  );
}

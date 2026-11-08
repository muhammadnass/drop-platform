'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

function fmt(n: number) { return `₦${Math.round(n).toLocaleString()}`; }
function Spinner() { return <div className="w-8 h-8 border-2 border-[#E8420A] border-t-transparent rounded-full animate-spin mx-auto" />; }

export default function RiderEarningsPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showTopup, setShowTopup] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    api.riderWallet(token).then(setWallet).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  const topup = async () => {
    const amt = Number(amount);
    if (!amt || amt < 1000) { setError('Enter at least ₦1,000'); return; }
    setBusy(true); setError('');
    try {
      const { authorization_url } = await api.riderWalletTopup(amt, token!);
      window.location.href = authorization_url;
    } catch (err: any) {
      setError(err.message ?? 'Could not start payment');
      setBusy(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#1A1208] flex items-center justify-center"><Spinner /></div>;

  return (
    <div className="min-h-screen bg-[#1A1208] text-white pb-16">
      <div className="bg-[#221810] px-4 pb-4 flex items-center gap-3 sticky top-0 z-10 border-b border-white/10" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <button onClick={() => router.back()} className="text-white/60 hover:text-white text-xl">←</button>
        <p className="text-white font-bold flex-1">Earnings & Wallet</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        <div className="bg-gradient-to-br from-[#E8420A]/20 to-[#E8420A]/5 border border-[#E8420A]/20 rounded-2xl p-5">
          <p className="text-white/50 text-xs uppercase tracking-widest mb-1">Wallet balance</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold">{fmt(wallet?.balanceNgn ?? 0)}</p>
              <p className="text-white/40 text-xs mt-1">Lifetime earnings: {fmt(wallet?.lifetimeEarningsNgn ?? 0)}</p>
            </div>
            <button onClick={() => setShowTopup(true)}
              className="bg-[#E8420A] hover:bg-[#ff5420] text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-all active:scale-95">
              + Top Up
            </button>
          </div>
        </div>

        {wallet?.transactions?.length > 0 ? (
          <div className="bg-[#221810] border border-white/10 rounded-2xl p-5 space-y-3">
            <p className="text-white font-semibold text-sm uppercase tracking-widest opacity-60">Recent Activity</p>
            <div className="space-y-2">
              {wallet.transactions.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-white/80">{t.description ?? t.type}</p>
                    <p className="text-white/30 text-xs">{new Date(t.createdAt).toLocaleDateString()}</p>
                  </div>
                  <p className={`font-semibold ${t.amountNgn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {t.amountNgn >= 0 ? '+' : ''}{fmt(t.amountNgn)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-10 text-white/40">
            <p className="text-4xl mb-3">💳</p>
            <p className="text-sm">No wallet activity yet</p>
          </div>
        )}
      </div>

      {showTopup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className="w-full max-w-sm bg-[#221810] border border-white/10 rounded-3xl p-6 space-y-4">
            <h3 className="font-bold text-lg">Top Up Wallet</h3>
            <div className="grid grid-cols-4 gap-2">
              {[1000, 2000, 5000, 10000].map((p) => (
                <button key={p} onClick={() => setAmount(String(p))}
                  className={`py-2 rounded-xl text-xs font-semibold border ${amount === String(p) ? 'border-[#E8420A] bg-[#E8420A]/10 text-white' : 'border-white/10 text-white/60'}`}>
                  {fmt(p)}
                </button>
              ))}
            </div>
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Enter amount (₦)" inputMode="numeric"
              className="w-full bg-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none placeholder-white/30 focus:ring-2 focus:ring-[#E8420A]/50" />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowTopup(false)} className="flex-1 py-3 rounded-xl border border-white/20 text-white/60 font-semibold">Cancel</button>
              <button onClick={topup} disabled={busy} className="flex-grow py-3 rounded-xl bg-[#E8420A] text-white font-bold disabled:opacity-40">
                {busy ? <Spinner /> : 'Continue to pay'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

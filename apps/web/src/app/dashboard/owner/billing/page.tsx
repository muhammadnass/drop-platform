'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { ArrowLeft, CreditCard, CheckCircle2, AlertCircle, Loader2, Shield, Zap, Users } from 'lucide-react';
import toast from 'react-hot-toast';

export default function BillingPage() {
  const { user, token, isHydrated } = useAuth();
  const router = useRouter();

  const [profile, setProfile]   = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [paying, setPaying]     = useState(false);

  useEffect(() => { if (isHydrated && !user) router.replace('/auth/login'); }, [isHydrated, user, router]);

  useEffect(() => {
    if (!token) return;
    api.businessProfile(token)
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubscribe() {
    if (!token) return;
    setPaying(true);
    try {
      const pay = await api.initSubscription(token);
      window.location.href = pay.authorization_url;
    } catch (e: any) {
      toast.error(e.message ?? 'Payment init failed');
      setPaying(false);
    }
  }

  if (!isHydrated || !user) return <Spin />;

  const sub = profile?.subscription;
  const isActive = sub?.status === 'ACTIVE';

  return (
    <div className="min-h-screen bg-[#1A1208] text-white pb-10">
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.push('/dashboard/owner')} className="text-white/40 hover:text-white"><ArrowLeft size={20} /></button>
        <div>
          <div className="font-bold" style={{ fontFamily: 'var(--font-syne)' }}>Billing & Subscription</div>
          <div className="text-white/40 text-xs">Drop Business Plan</div>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-6 py-6 space-y-6">
        {/* Current status */}
        {!loading && (
          <div className={`rounded-2xl p-5 border ${isActive ? 'border-green-500/30 bg-green-500/10' : 'border-yellow-500/20 bg-yellow-500/5'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-white/40 mb-0.5">Current Status</div>
                <div className="font-bold text-lg">{isActive ? 'Active' : 'Inactive'}</div>
                {sub?.expiresAt && (
                  <div className="text-xs text-white/40 mt-0.5">
                    {isActive ? 'Renews' : 'Expired'}: {new Date(sub.expiresAt).toLocaleDateString('en-NG', { day:'numeric', month:'long', year:'numeric' })}
                  </div>
                )}
              </div>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isActive ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
                {isActive ? <CheckCircle2 size={24} className="text-green-400" /> : <AlertCircle size={24} className="text-yellow-400" />}
              </div>
            </div>
          </div>
        )}

        {/* Plan card */}
        <div className="bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/20 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="text-xs text-purple-400 font-semibold uppercase tracking-wider mb-1">Drop Business</div>
              <div className="text-3xl font-bold">$20<span className="text-base font-normal text-white/40"> / month</span></div>
              <div className="text-white/40 text-sm mt-0.5">Billed in Naira at current exchange rate</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <CreditCard size={20} className="text-purple-400" />
            </div>
          </div>

          <div className="space-y-2.5 mb-6">
            {[
              { icon: Users,  text: 'Unlimited rider fleet management' },
              { icon: Zap,    text: 'Priority dispatch algorithm' },
              { icon: Shield, text: '8% platform commission per delivery' },
              { icon: CheckCircle2, text: 'Custom business branding' },
              { icon: CheckCircle2, text: 'Full delivery analytics & reports' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm">
                <f.icon size={15} className="text-purple-400 shrink-0" />
                <span className="text-white/70">{f.text}</span>
              </div>
            ))}
          </div>

          {!isActive && (
            <button
              onClick={handleSubscribe}
              disabled={paying}
              className="w-full py-4 rounded-xl bg-[#E8420A] text-white font-bold disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2"
              style={{ boxShadow: '0 4px 20px rgba(232,66,10,0.35)' }}
            >
              {paying ? <><Loader2 size={18} className="animate-spin" /> Opening Paystack…</> : 'Subscribe Now →'}
            </button>
          )}

          {isActive && (
            <div className="text-center text-sm text-green-400 font-semibold flex items-center justify-center gap-2">
              <CheckCircle2 size={16} /> Subscription active
            </div>
          )}
        </div>

        <p className="text-center text-white/30 text-xs">
          Powered by Paystack · Secure Nigerian payment gateway · Auto-renews monthly
        </p>

        {/* Invoice history placeholder */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="font-semibold text-sm mb-3">Payment History</h3>
          <div className="text-center py-6 text-white/20 text-sm">
            {isActive ? 'Payment records will appear here' : 'No payments yet'}
          </div>
        </div>
      </div>
    </div>
  );
}

function Spin() {
  return <div className="min-h-screen bg-[#1A1208] flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#E8420A] border-t-transparent rounded-full animate-spin" /></div>;
}

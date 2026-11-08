'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

type State = 'loading' | 'success' | 'failed';

function PaymentVerifyPageInner() {
  const { token, isHydrated } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isHydrated) return;
    if (!token) { router.replace('/auth/login'); return; }

    const ref  = searchParams.get('reference') ?? searchParams.get('ref') ?? '';
    const type = searchParams.get('type') ?? 'delivery'; // 'delivery' | 'subscription' | 'customer_wallet' | 'rider_wallet'

    if (!ref) { setState('failed'); setMessage('No payment reference found.'); return; }

    async function verify() {
      try {
        if (type === 'subscription') {
          await api.verifySubscription(ref, token!);
          setMessage('Subscription activated! Your business plan is now live.');
        } else if (type === 'customer_wallet') {
          // Backend redirects back here with ?ref=...&type=customer_wallet
          // after a wallet top-up — this previously fell through to
          // verifyDeliveryPayment() (the default branch below), which hits
          // the wrong endpoint and always fails for a wallet top-up.
          await api.customerWalletTopupVerify(ref, token!);
          setMessage('Wallet funded successfully!');
        } else if (type === 'rider_wallet') {
          await api.riderWalletTopupVerify(ref, token!);
          setMessage('Wallet funded successfully!');
        } else {
          await api.verifyDeliveryPayment(ref, token!);
          setMessage('Payment confirmed! Your delivery is being dispatched.');
        }
        setState('success');
      } catch (e: any) {
        setState('failed');
        setMessage(e.message ?? 'Payment verification failed.');
      }
    }

    verify();
  }, [isHydrated, token, searchParams, router]);

  function redirectDashboard() {
    // Peek at state to figure out where to send them
    router.replace('/dashboard/customer');
  }

  return (
    <div className="min-h-screen bg-[#1A1208] text-white flex flex-col items-center justify-center px-6 gap-6">
      {state === 'loading' && (
        <>
          <Loader2 size={48} className="text-[#E8420A] animate-spin" />
          <div className="text-center">
            <h2 className="text-xl font-bold mb-1">Verifying payment…</h2>
            <p className="text-white/40 text-sm">Please wait, do not close this page</p>
          </div>
        </>
      )}

      {state === 'success' && (
        <>
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 size={40} className="text-green-400" />
          </div>
          <div className="text-center max-w-xs">
            <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-syne)' }}>Payment successful!</h2>
            <p className="text-white/60 text-sm">{message}</p>
          </div>
          <button
            onClick={redirectDashboard}
            className="px-8 py-3.5 rounded-2xl bg-[#E8420A] text-white font-bold active:scale-95 transition-all"
            style={{ boxShadow: '0 4px 20px rgba(232,66,10,0.35)' }}
          >
            Go to Dashboard
          </button>
        </>
      )}

      {state === 'failed' && (
        <>
          <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
            <XCircle size={40} className="text-red-400" />
          </div>
          <div className="text-center max-w-xs">
            <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-syne)' }}>Payment failed</h2>
            <p className="text-white/60 text-sm">{message || 'Something went wrong with your payment.'}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => router.back()} className="px-6 py-3.5 rounded-2xl border border-white/20 text-white/60 font-semibold">
              Go Back
            </button>
            <button onClick={() => router.replace('/book')} className="px-6 py-3.5 rounded-2xl bg-[#E8420A] text-white font-bold active:scale-95 transition-all">
              Try Again
            </button>
          </div>
        </>
      )}
    </div>
  );
}


import { Suspense } from 'react';
export default function PaymentVerifyPage() {
  return <Suspense><PaymentVerifyPageInner /></Suspense>;
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { MapPin, Package, FileText, Phone, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';

type Step = 'route' | 'details' | 'tier' | 'confirm';

const TIERS = [
  { id: 'DROP_MINI', label: 'Drop Mini', emoji: '🏍️', desc: 'Motorbike — small parcels up to 5 kg' },
  { id: 'DROP_TRI',  label: 'Drop Tri',  emoji: '🛺',  desc: 'Tricycle — medium loads up to 30 kg' },
  { id: 'DROP_FLEX', label: 'Drop Flex', emoji: '🚗',  desc: 'Car — large parcels, fragile items'   },
  { id: 'DROP_MAX',  label: 'Drop Max',  emoji: '🚐',  desc: 'Minivan — bulk goods, furniture'      },
];

interface FareRow {
  id: string; label: string; emoji: string; desc: string;
  totalFareNgn: number; riderEarningsNgn: number; platformFeeNgn: number;
}

export default function BookPage() {
  const { user, token, isHydrated } = useAuth();
  const router = useRouter();

  const [step, setStep]           = useState<Step>('route');
  const [pickup, setPickup]       = useState('');
  const [dropoff, setDropoff]     = useState('');
  const [distance, setDistance]   = useState(5);
  const [estimating, setEstimating] = useState(false);

  const [itemDesc, setItemDesc]         = useState('');
  const [recipientName, setRecipient]   = useState('');
  const [recipientPhone, setRecipPhone] = useState('');
  const [notes, setNotes]               = useState('');

  const [tiers, setTiers]             = useState<FareRow[]>([]);
  const [loadingTiers, setLoadingTiers] = useState(false);
  const [selectedTier, setSelectedTier] = useState('DROP_MINI');

  const [booking, setBooking] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (isHydrated && !user) router.replace('/auth/login?from=/book');
  }, [isHydrated, user, router]);

  async function handleRouteNext() {
    if (!pickup.trim() || !dropoff.trim()) return;
    setEstimating(true);
    // Mock distance — swap with Google Maps Distance Matrix
    const km = Math.max(2, ((pickup.length + dropoff.length) % 18) + 2);
    setDistance(km);
    await fetchFares(km);
    setEstimating(false);
    setStep('details');
  }

  async function fetchFares(km: number) {
    setLoadingTiers(true);
    try {
      const rows = await Promise.all(
        TIERS.map(async (t) => {
          const f = await api.fareCalculate(km, t.id, token ?? undefined);
          return { ...t, totalFareNgn: f.totalFareNgn, riderEarningsNgn: f.riderEarningsNgn, platformFeeNgn: f.platformFeeNgn };
        })
      );
      setTiers(rows);
    } catch {
      // Fallback if server not running
      setTiers(TIERS.map((t, i) => ({
        ...t, platformFeeNgn: 0,
        totalFareNgn:    Math.round(500 * [1, 1.3, 1.5, 2.2][i] * km),
        riderEarningsNgn: Math.round(500 * [1, 1.3, 1.5, 2.2][i] * km * 0.92),
      })));
    } finally { setLoadingTiers(false); }
  }

  async function handlePay() {
    if (!token) return;
    setBooking(true); setError('');
    try {
      const delivery = await api.createDelivery({
        pickupAddress: pickup, dropoffAddress: dropoff, distanceKm: distance,
        vehicleTier: selectedTier, itemDescription: itemDesc || undefined,
        recipientName: recipientName || undefined, recipientPhone: recipientPhone || undefined,
        notes: notes || undefined,
      }, token);
      const pay = await api.initDeliveryPayment(delivery.id, token);
      window.location.href = pay.authorization_url;
    } catch (e: any) {
      setError(e.message ?? 'Booking failed');
      setBooking(false);
    }
  }

  const sel = tiers.find((t) => t.id === selectedTier);

  if (!isHydrated || !user) return <Spin />;

  const stepIdx = { route: 1, details: 2, tier: 3, confirm: 4 }[step];

  function goBack() {
    if (step === 'route')   { router.back(); return; }
    if (step === 'details') { setStep('route');   return; }
    if (step === 'tier')    { setStep('details'); return; }
    setStep('tier');
  }

  return (
    <div className="min-h-screen bg-[#1A1208] text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <button onClick={goBack} className="text-white/40 hover:text-white transition-colors"><ArrowLeft size={20} /></button>
        <div>
          <div className="font-bold" style={{ fontFamily: 'var(--font-syne)' }}>Book a Delivery</div>
          <div className="text-white/40 text-xs">Step {stepIdx} of 4</div>
        </div>
      </header>
      <div className="h-1 bg-white/5"><div className="h-1 bg-[#E8420A] transition-all duration-500" style={{ width: `${stepIdx * 25}%` }} /></div>

      <div className="max-w-lg mx-auto px-6 py-6">

        {/* STEP 1 */}
        {step === 'route' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Where to?</h2>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
              <input value={pickup}  onChange={(e) => setPickup(e.target.value)}  placeholder="Pickup address"  className="input" />
              <input value={dropoff} onChange={(e) => setDropoff(e.target.value)} placeholder="Dropoff address" className="input" />
            </div>
            <button onClick={handleRouteNext} disabled={!pickup.trim() || !dropoff.trim() || estimating}
              className="w-full py-4 rounded-2xl bg-[#E8420A] text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all"
              style={{ boxShadow: '0 4px 20px rgba(232,66,10,0.35)' }}>
              {estimating ? <><Loader2 size={18} className="animate-spin" /> Getting fares…</> : 'Continue →'}
            </button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 'details' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Item details</h2>
            <div className="space-y-3">
              {[
                { label: 'What are you sending?', val: itemDesc,       set: setItemDesc,    ph: 'Documents, food, clothing…', icon: Package  },
                { label: 'Recipient name',         val: recipientName, set: setRecipient,   ph: 'Full name',                   icon: Phone    },
                { label: 'Recipient phone',        val: recipientPhone, set: setRecipPhone, ph: '08012345678',                 icon: Phone    },
              ].map((f) => (
                <div key={f.label} className="space-y-1.5">
                  <label className="text-white/60 text-xs font-medium">{f.label}</label>
                  <input value={f.val} onChange={(e) => f.set(e.target.value)} placeholder={f.ph}
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:border-[#E8420A] transition-colors" />
                </div>
              ))}
              <div className="space-y-1.5">
                <label className="text-white/60 text-xs font-medium flex items-center gap-1.5"><FileText size={12} /> Notes <span className="text-white/30">(optional)</span></label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Fragile, call before arriving…" rows={2}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:border-[#E8420A] resize-none transition-colors" />
              </div>
            </div>
            <button onClick={() => setStep('tier')} className="w-full py-4 rounded-2xl bg-[#E8420A] text-white font-bold active:scale-95 transition-all" style={{ boxShadow: '0 4px 20px rgba(232,66,10,0.35)' }}>
              Choose Vehicle →
            </button>
          </div>
        )}

        {/* STEP 3 */}
        {step === 'tier' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">Choose vehicle</h2>
              <p className="text-white/40 text-sm">{distance} km · includes 8% platform fee</p>
            </div>
            {loadingTiers ? <div className="flex justify-center py-12"><Loader2 size={28} className="animate-spin text-[#E8420A]" /></div> : (
              <div className="space-y-3">
                {tiers.map((t) => (
                  <button key={t.id} onClick={() => setSelectedTier(t.id)}
                    className={`w-full flex items-center justify-between rounded-2xl p-4 border transition-all ${selectedTier === t.id ? 'border-[#E8420A] bg-[#E8420A]/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{t.emoji}</span>
                      <div className="text-left">
                        <div className="font-bold text-sm">{t.label}</div>
                        <div className="text-white/40 text-xs">{t.desc}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">₦{t.totalFareNgn.toLocaleString()}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setStep('confirm')} disabled={loadingTiers}
              className="w-full py-4 rounded-2xl bg-[#E8420A] text-white font-bold disabled:opacity-50 active:scale-95 transition-all" style={{ boxShadow: '0 4px 20px rgba(232,66,10,0.35)' }}>
              Review Order →
            </button>
          </div>
        )}

        {/* STEP 4 */}
        {step === 'confirm' && sel && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Confirm booking</h2>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 divide-y divide-white/10 space-y-0">
              <div className="pb-4">
                <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Route</div>
                <div className="text-sm flex gap-2 items-center"><span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />{pickup}</div>
                <div className="text-sm flex gap-2 items-center mt-1.5"><span className="w-2 h-2 rounded-full bg-[#E8420A] shrink-0" />{dropoff}</div>
              </div>
              <div className="py-4">
                <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Vehicle</div>
                <div className="flex items-center gap-2"><span className="text-xl">{sel.emoji}</span><span className="font-semibold">{sel.label}</span><span className="text-white/40 text-sm">· {distance} km</span></div>
              </div>
              {itemDesc && (
                <div className="py-4">
                  <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Item</div>
                  <div className="text-sm">{itemDesc}</div>
                </div>
              )}
              {recipientName && (
                <div className="py-4">
                  <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Recipient</div>
                  <div className="text-sm">{recipientName} {recipientPhone && `· ${recipientPhone}`}</div>
                </div>
              )}
              <div className="pt-4 space-y-1.5 text-sm">
                <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Fare</div>
                <div className="flex justify-between text-white/60"><span>Base fare</span><span>₦{(sel.totalFareNgn - sel.platformFeeNgn).toLocaleString()}</span></div>
                <div className="flex justify-between text-white/60"><span>Platform fee (8%)</span><span>₦{sel.platformFeeNgn.toLocaleString()}</span></div>
                <div className="flex justify-between font-bold text-base border-t border-white/10 pt-2 mt-1">
                  <span>Total</span><span className="text-[#E8420A]">₦{sel.totalFareNgn.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {error && <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-xl px-3 py-2.5"><AlertCircle size={15} />{error}</div>}

            <button onClick={handlePay} disabled={booking}
              className="w-full py-4 rounded-2xl bg-[#E8420A] text-white font-bold disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2"
              style={{ boxShadow: '0 4px 20px rgba(232,66,10,0.35)' }}>
              {booking ? <><Loader2 size={18} className="animate-spin" /> Opening Paystack…</> : <>Pay ₦{sel.totalFareNgn.toLocaleString()} →</>}
            </button>
            <p className="text-center text-white/30 text-xs">Secured by Paystack · Encrypted payment</p>
          </div>
        )}
      </div>

      <style jsx>{`
        .input { width:100%; padding:12px 16px; border-radius:12px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.1); color:white; font-size:14px; outline:none; }
        .input::placeholder { color:rgba(255,255,255,0.3); }
        .input:focus { border-color:#E8420A; }
      `}</style>
    </div>
  );
}

function Spin() {
  return <div className="min-h-screen bg-[#1A1208] flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#E8420A] border-t-transparent rounded-full animate-spin" /></div>;
}

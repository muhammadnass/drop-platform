'use client';

// ============================================================
// DROP LOGISTICS — Rider Profile Page
// Photos, KYC (NIN/BVN mock), wallet topup via Paystack
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

const SERVER_BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4000';
const PK_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? '';

function Spinner() { return <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />; }
function Badge({ children, color = 'gray' }: { children: React.ReactNode; color?: 'green' | 'yellow' | 'red' | 'gray' }) {
  const cls = { green: 'bg-green-500/20 text-green-400', yellow: 'bg-yellow-500/20 text-yellow-400', red: 'bg-red-500/20 text-red-400', gray: 'bg-white/10 text-white/60' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls[color]}`}>{children}</span>;
}

// ── Section card ──────────────────────────────────────────────
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1a1a] rounded-2xl p-5 space-y-4">
      <p className="text-white font-semibold text-sm uppercase tracking-widest opacity-60">{title}</p>
      {children}
    </div>
  );
}

// ── Photo upload tile ─────────────────────────────────────────
function PhotoTile({ url, label, onCapture, loading }: { url?: string | null; label: string; onCapture: (b64: string) => void; loading?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onCapture(reader.result as string);
    reader.readAsDataURL(file);
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <button onClick={() => ref.current?.click()} disabled={loading}
        className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-dashed border-white/20 hover:border-orange-500/60 transition-colors bg-[#2a2a2a] flex items-center justify-center">
        {url
          ? <img src={url.startsWith('http') ? url : `${SERVER_BASE}${url}`} className="w-full h-full object-cover" alt={label} />
          : loading ? <Spinner /> : <span className="text-3xl opacity-40">📷</span>
        }
        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-xs text-center py-1">Tap to change</div>
      </button>
      <p className="text-white/50 text-xs">{label}</p>
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={handleChange} className="hidden" />
    </div>
  );
}

// ── KYC status label ──────────────────────────────────────────
function KycBadge({ status }: { status?: string }) {
  if (!status || status === 'PENDING') return <Badge color="yellow">⏳ Pending verification</Badge>;
  if (status === 'VERIFIED') return <Badge color="green">✅ Verified</Badge>;
  if (status === 'REJECTED') return <Badge color="red">❌ Rejected</Badge>;
  return null;
}

// ── Paystack inline loader ────────────────────────────────────
declare const PaystackPop: any;
function loadPaystack(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof PaystackPop !== 'undefined') { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://js.paystack.co/v1/inline.js';
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

// ── Main ──────────────────────────────────────────────────────
export default function RiderProfilePage() {
  const router = useRouter();
  const { user, token } = useAuth();

  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats]     = useState<any>(null);
  const [wallet, setWallet]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  // Profile fields
  const [vehicleTier, setVehicleTier]   = useState('DROP_MINI');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');

  // KYC
  const [kycType, setKycType]   = useState<'NIN' | 'BVN'>('NIN');
  const [kycValue, setKycValue] = useState('');
  const [kycBusy, setKycBusy]  = useState(false);
  const [kycStatus, setKycStatus] = useState<string>('');
  const [kycVerifying, setKycVerifying] = useState(false);

  // Photos
  const [profilePhotoUrl, setProfilePhotoUrl]       = useState<string | null>(null);
  const [vehiclePlatePhotoUrl, setVehiclePlatePhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  // Wallet topup
  const [topupAmount, setTopupAmount] = useState('');
  const [topupBusy, setTopupBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api.riderStats(token),
      api.riderWallet(token),
    ]).then(([s, w]) => {
      setStats(s);
      setWallet(w);
      if (s?.riderProfile) {
        const rp = s.riderProfile;
        setVehicleTier(rp.vehicleTier ?? 'DROP_MINI');
        setVehiclePlate(rp.vehiclePlate ?? '');
        setVehicleModel(rp.vehicleModel ?? '');
        setVehicleColor(rp.vehicleColor ?? '');
        setLicenseNumber(rp.licenseNumber ?? '');
        setProfilePhotoUrl(rp.profilePhotoUrl ?? null);
        setVehiclePlatePhotoUrl(rp.vehiclePlatePhotoUrl ?? null);
        setKycStatus(rp.kycStatus ?? '');
        if (rp.kycType) setKycType(rp.kycType);
        if (rp.kycValue) setKycValue(rp.kycValue);
      }
    }).finally(() => setLoading(false));
  }, [token]);

  // ── Upload helper ───────────────────────────────────────────
  const uploadPhoto = async (b64: string, folder: 'profiles' | 'plates') => {
    if (!token) return;
    setPhotoUploading(true);
    try {
      const { url } = await api.uploadImage(b64, folder, token);
      if (folder === 'profiles') setProfilePhotoUrl(url);
      else setVehiclePlatePhotoUrl(url);
      // Persist immediately
      await api.updateRiderProfile({ [folder === 'profiles' ? 'profilePhotoUrl' : 'vehiclePlatePhotoUrl']: url }, token);
      setSuccess('Photo updated');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) { setError(err.message); }
    finally { setPhotoUploading(false); }
  };

  // ── Save profile ────────────────────────────────────────────
  const saveProfile = async () => {
    if (!token) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.updateRiderProfile({ vehicleTier, vehiclePlate, vehicleModel, vehicleColor, licenseNumber }, token);
      setSuccess('Profile saved ✓');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  // ── Submit KYC ──────────────────────────────────────────────
  const submitKyc = async () => {
    if (!kycValue || kycValue.length !== 11 || !/^\d+$/.test(kycValue)) {
      return setError(`${kycType} must be exactly 11 digits`);
    }
    setKycBusy(true); setError('');
    try {
      await api.riderKyc(kycType, kycValue, token!);
      setKycStatus('PENDING');
      setKycVerifying(true);
      // Mock: auto-verified after 3 seconds (backend does this too, this updates local state)
      setTimeout(() => { setKycStatus('VERIFIED'); setKycVerifying(false); }, 3500);
    } catch (err: any) { setError(err.message); setKycBusy(false); }
    finally { setKycBusy(false); }
  };

  // ── Paystack wallet topup ────────────────────────────────────
  const topupWallet = async () => {
    const amount = parseFloat(topupAmount);
    if (!amount || amount < 1000) return setError('Minimum top-up is ₦1,000');
    setTopupBusy(true); setError('');
    try {
      const { authorizationUrl, reference } = await api.riderWalletTopup(amount, token!);
      await loadPaystack();
      const handler = PaystackPop.setup({
        key: PK_KEY,
        email: user?.email ?? 'rider@drop.ng',
        amount: amount * 100, // kobo
        ref: reference,
        onSuccess: async () => {
          // verify
          const updated = await api.riderWalletTopupVerify(reference, token!);
          setWallet(updated);
          setTopupAmount('');
          setSuccess(`Wallet topped up ✓`);
          setTimeout(() => setSuccess(''), 4000);
        },
        onClose: () => { /* user closed */ },
      });
      handler.openIframe();
    } catch (err: any) { setError(err.message); }
    finally { setTopupBusy(false); }
  };

  const walletBalance = wallet?.balanceNgn ?? 0;
  const isBlocked = walletBalance <= -8000;
  const TIERS = [
    { value: 'DROP_MINI', label: '🛵 DROP Mini', desc: 'Motorcycle' },
    { value: 'DROP_TRI',  label: '🛺 DROP Tri',  desc: 'Tricycle' },
    { value: 'DROP_FLEX', label: '🚐 DROP Flex', desc: 'Car / Van' },
    { value: 'DROP_MAX',  label: '🚛 DROP Max',  desc: 'Truck' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white pb-16">
      {/* Header */}
      <div className="bg-[#1a1a1a] px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="text-white/60 hover:text-white text-xl">←</button>
        <div className="flex-1">
          <p className="text-white font-bold">Rider Profile</p>
          <p className="text-white/40 text-xs">{user?.name}</p>
        </div>
        <button onClick={saveProfile} disabled={saving}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all">
          {saving ? <Spinner /> : 'Save'}
        </button>
      </div>

      <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">
        {(error || success) && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className={`rounded-xl px-4 py-3 text-sm ${error ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
            {error || success}
          </motion.div>
        )}

        {/* ── Wallet ── */}
        <Card title="Wallet">
          <div className={`rounded-xl p-4 ${isBlocked ? 'bg-red-500/10 border border-red-500/30' : walletBalance < 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-[#2a2a2a]'}`}>
            <p className="text-white/50 text-xs mb-1">Current balance</p>
            <p className={`text-3xl font-bold ${isBlocked ? 'text-red-400' : walletBalance < 0 ? 'text-yellow-400' : 'text-white'}`}>
              ₦{walletBalance.toLocaleString()}
            </p>
            {isBlocked && <p className="text-red-400 text-xs mt-2">⛔ Account blocked — clear the negative balance to receive orders</p>}
            {!isBlocked && walletBalance < 0 && <p className="text-yellow-400 text-xs mt-2">⚠ Negative balance — top up to reduce outstanding amount</p>}
          </div>

          <div>
            <p className="text-white/50 text-xs mb-2">Top up wallet (min ₦1,000)</p>
            <div className="flex gap-2">
              <input
                type="number"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                placeholder="Amount in ₦"
                className="flex-1 bg-[#2a2a2a] text-white px-4 py-3 rounded-xl text-sm outline-none placeholder-white/30"
              />
              <button onClick={topupWallet} disabled={topupBusy || !topupAmount}
                className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-semibold">
                {topupBusy ? <Spinner /> : 'Pay'}
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              {[1000, 2000, 5000, 10000].map((a) => (
                <button key={a} onClick={() => setTopupAmount(String(a))}
                  className="flex-1 bg-[#2a2a2a] hover:bg-[#333] text-white/60 text-xs py-2 rounded-lg transition-colors">
                  ₦{(a/1000).toFixed(0)}k
                </button>
              ))}
            </div>
          </div>

          {wallet?.transactions?.length > 0 && (
            <div className="space-y-2 border-t border-white/10 pt-3">
              <p className="text-white/40 text-xs uppercase tracking-widest">Recent</p>
              {wallet.transactions.slice(0, 5).map((tx: any, i: number) => (
                <div key={i} className="flex justify-between items-center">
                  <div>
                    <p className="text-white text-sm">{tx.description}</p>
                    <p className="text-white/40 text-xs">{new Date(tx.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`font-bold text-sm ${tx.amountNgn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {tx.amountNgn >= 0 ? '+' : ''}₦{tx.amountNgn.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Photos ── */}
        <Card title="Photos">
          <div className="flex gap-6 justify-center">
            <PhotoTile
              url={profilePhotoUrl}
              label="Profile photo"
              onCapture={(b64) => uploadPhoto(b64, 'profiles')}
              loading={photoUploading}
            />
            <PhotoTile
              url={vehiclePlatePhotoUrl}
              label="Plate / vehicle"
              onCapture={(b64) => uploadPhoto(b64, 'plates')}
              loading={photoUploading}
            />
          </div>
          <p className="text-white/30 text-xs text-center">Customers use these to identify you. Keep them up to date.</p>
        </Card>

        {/* ── KYC ── */}
        <Card title="Identity Verification (KYC)">
          <div className="flex items-center justify-between">
            <p className="text-white text-sm">Status</p>
            <KycBadge status={kycStatus} />
          </div>

          {kycVerifying && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className="text-blue-400 text-xs">Verifying your {kycType}… This takes a few seconds.</p>
            </motion.div>
          )}

          {kycStatus !== 'VERIFIED' && !kycVerifying && (
            <div className="space-y-3">
              <div className="flex gap-2">
                {(['NIN', 'BVN'] as const).map((t) => (
                  <button key={t} onClick={() => setKycType(t)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${kycType === t ? 'bg-orange-500 text-white' : 'bg-[#2a2a2a] text-white/60 hover:text-white'}`}>
                    {t}
                  </button>
                ))}
              </div>
              <div>
                <input
                  value={kycValue}
                  onChange={(e) => setKycValue(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder={`Enter ${kycType} (11 digits)`}
                  className="w-full bg-[#2a2a2a] text-white px-4 py-3 rounded-xl text-sm outline-none placeholder-white/30 tracking-widest"
                  inputMode="numeric"
                />
                <p className="text-white/30 text-xs mt-1 ml-1">{kycValue.length}/11 digits</p>
              </div>
              <button onClick={submitKyc} disabled={kycBusy || kycValue.length !== 11}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-all">
                {kycBusy ? <Spinner /> : `Verify ${kycType}`}
              </button>
              <p className="text-white/30 text-xs text-center">🔒 Test mode — no real verification performed</p>
            </div>
          )}
        </Card>

        {/* ── Vehicle ── */}
        <Card title="Vehicle Details">
          <div className="space-y-2">
            <p className="text-white/50 text-xs">Vehicle type</p>
            <div className="grid grid-cols-2 gap-2">
              {TIERS.map((t) => (
                <button key={t.value} onClick={() => setVehicleTier(t.value)}
                  className={`p-3 rounded-xl border text-left transition-all ${vehicleTier === t.value ? 'border-orange-500 bg-orange-500/10' : 'border-white/10 bg-[#2a2a2a] hover:border-white/25'}`}>
                  <p className="text-white font-medium text-sm">{t.label}</p>
                  <p className="text-white/40 text-xs">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {[
            { label: 'Plate number', value: vehiclePlate, set: setVehiclePlate, placeholder: 'e.g. ABC-123-XY', upper: true },
            { label: 'Vehicle model', value: vehicleModel, set: setVehicleModel, placeholder: 'e.g. Honda CB125' },
            { label: 'Vehicle colour', value: vehicleColor, set: setVehicleColor, placeholder: 'e.g. Red' },
            { label: 'License number', value: licenseNumber, set: setLicenseNumber, placeholder: 'Driving license number' },
          ].map(({ label, value, set, placeholder, upper }) => (
            <div key={label}>
              <p className="text-white/50 text-xs mb-1.5">{label}</p>
              <input value={value} onChange={(e) => set(upper ? e.target.value.toUpperCase() : e.target.value)}
                placeholder={placeholder}
                className="w-full bg-[#2a2a2a] text-white px-4 py-3 rounded-xl text-sm outline-none placeholder-white/30" />
            </div>
          ))}
        </Card>

        {/* Stats summary */}
        {stats && (
          <Card title="My Stats">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Deliveries', value: stats.totalDeliveries ?? 0 },
                { label: 'Rating', value: `${(stats.rating ?? 5.0).toFixed(1)} ⭐` },
                { label: 'Earnings', value: `₦${((stats.totalEarningsNgn ?? 0) / 1000).toFixed(0)}k` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[#2a2a2a] rounded-xl p-3 text-center">
                  <p className="text-white font-bold text-lg">{value}</p>
                  <p className="text-white/40 text-xs">{label}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

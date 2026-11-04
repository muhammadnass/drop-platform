'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { ArrowLeft, Plus, UserPlus, Mail, Trash2, Star, Package, Copy, Check } from 'lucide-react';

interface Rider {
  id: string;
  vehicleType: string;
  vehicleTier: string;
  vehiclePlate?: string;
  isOnline: boolean;
  isVerified: boolean;
  rating: number;
  totalDeliveries: number;
  user: { name: string; email: string; phone?: string };
  wallet?: { balanceNgn: number };
}

function Spinner() { return <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />; }

// ── Register new rider modal ────────────────────────────────
function RegisterRiderModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('MOTORBIKE');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const VEHICLES = [
    { value: 'MOTORBIKE', label: '🛵 Motorbike' },
    { value: 'TRICYCLE', label: '🛺 Tricycle' },
    { value: 'CAR', label: '🚐 Car' },
    { value: 'MINIVAN', label: '🚛 Van/Truck' },
  ];

  const submit = async () => {
    if (!token || !name.trim() || !email.trim()) return setError('Name and email are required');
    setBusy(true); setError('');
    try {
      const r = await api.registerRider({ name, email, phone: phone || undefined, vehicleType, vehiclePlate: vehiclePlate || undefined }, token);
      setResult({ email: r.rider.email, tempPassword: r.tempPassword });
    } catch (err: any) { setError(err.message ?? 'Failed to register rider'); }
    finally { setBusy(false); }
  };

  const copyCreds = () => {
    navigator.clipboard.writeText(`Email: ${result?.email}\nTemporary password: ${result?.tempPassword}\nLog in at this app and change your password after first login.`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#221810] border border-white/10 rounded-3xl p-6">
        {result ? (
          <>
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
              <Check size={22} className="text-green-400" />
            </div>
            <h3 className="text-center font-bold text-lg mb-1">Rider registered!</h3>
            <p className="text-center text-white/40 text-sm mb-4">Share these login details with them — they should change the password after first login.</p>
            <div className="bg-white/5 rounded-xl p-4 space-y-1.5 mb-4">
              <p className="text-xs text-white/40">Email</p>
              <p className="text-sm font-mono">{result.email}</p>
              <p className="text-xs text-white/40 mt-2">Temporary password</p>
              <p className="text-sm font-mono">{result.tempPassword}</p>
            </div>
            <button onClick={copyCreds} className="w-full mb-2 flex items-center justify-center gap-2 py-3 rounded-xl border border-white/20 text-white/70 text-sm font-medium">
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy credentials</>}
            </button>
            <button onClick={onDone} className="w-full py-3 rounded-xl bg-[#E8420A] text-white font-bold">Done</button>
          </>
        ) : (
          <>
            <h3 className="font-bold text-lg mb-1 flex items-center gap-2"><UserPlus size={18} className="text-purple-400" /> Register New Rider</h3>
            <p className="text-white/40 text-sm mb-4">Onboard someone who's never used Drop before — this creates their account directly under your fleet.</p>
            <div className="space-y-3 mb-4">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name"
                className="w-full bg-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none placeholder-white/30" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" type="email"
                className="w-full bg-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none placeholder-white/30" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number (optional)"
                className="w-full bg-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none placeholder-white/30" />
              <div className="grid grid-cols-2 gap-2">
                {VEHICLES.map((v) => (
                  <button key={v.value} onClick={() => setVehicleType(v.value)}
                    className={`py-2.5 rounded-xl text-sm font-medium transition-all ${vehicleType === v.value ? 'bg-[#E8420A] text-white' : 'bg-white/5 text-white/60'}`}>
                    {v.label}
                  </button>
                ))}
              </div>
              <input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())} placeholder="Plate number (optional)"
                className="w-full bg-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none placeholder-white/30" />
            </div>
            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/20 text-white/60 font-semibold">Cancel</button>
              <button onClick={submit} disabled={busy} className="flex-grow py-3 rounded-xl bg-[#E8420A] text-white font-bold disabled:opacity-40">
                {busy ? <Spinner /> : 'Register'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Invite existing rider modal ─────────────────────────────
function InviteRiderModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const submit = async () => {
    if (!token || !email.trim()) return;
    setBusy(true); setError('');
    try {
      const r: any = await api.inviteRider(email, token);
      setMsg(r.message ?? 'Rider added to your fleet');
      setTimeout(onDone, 1200);
    } catch (err: any) { setError(err.message ?? 'Failed to add rider'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#221810] border border-white/10 rounded-3xl p-6">
        <h3 className="font-bold text-lg mb-1 flex items-center gap-2"><Mail size={18} className="text-blue-400" /> Invite Existing Rider</h3>
        <p className="text-white/40 text-sm mb-4">If they already have a Drop rider account, link it to your fleet by email.</p>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rider@email.com" type="email"
          className="w-full bg-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none placeholder-white/30 mb-3" />
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        {msg && <p className="text-green-400 text-xs mb-3">{msg}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/20 text-white/60 font-semibold">Cancel</button>
          <button onClick={submit} disabled={busy || !email.trim()} className="flex-grow py-3 rounded-xl bg-blue-500 text-white font-bold disabled:opacity-40">
            {busy ? <Spinner /> : 'Add to fleet'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function OwnerRidersPage() {
  const { token, isHydrated, user } = useAuth();
  const router = useRouter();
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = () => {
    if (!token) return;
    setLoading(true);
    api.businessRiders(token).then(setRiders).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { if (isHydrated && !user) router.replace('/auth/login'); }, [isHydrated, user, router]);
  useEffect(load, [token]);

  const remove = async (riderId: string) => {
    if (!token) return;
    setRemoving(riderId);
    try { await api.removeRider(riderId, token); load(); } catch { }
    finally { setRemoving(null); }
  };

  const tierLabel: Record<string, string> = { DROP_MINI: '🛵 Mini', DROP_TRI: '🛺 Tri', DROP_FLEX: '🚐 Flex', DROP_MAX: '🚛 Max' };

  return (
    <div className="min-h-screen bg-[#1A1208] text-white pb-16">
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard/owner')} className="text-white/60 hover:text-white"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <p className="font-bold" style={{ fontFamily: 'var(--font-syne)' }}>My Fleet</p>
          <p className="text-white/40 text-xs">{riders.length} rider{riders.length !== 1 ? 's' : ''}</p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-6 py-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setShowRegister(true)}
            className="flex flex-col items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-2xl py-5 hover:border-purple-500/40 transition-colors">
            <UserPlus size={22} className="text-purple-400" />
            <span className="text-sm font-semibold">Register New Rider</span>
          </button>
          <button onClick={() => setShowInvite(true)}
            className="flex flex-col items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-2xl py-5 hover:border-blue-500/40 transition-colors">
            <Mail size={22} className="text-blue-400" />
            <span className="text-sm font-semibold">Invite Existing Rider</span>
          </button>
        </div>

        {loading ? (
          <div className="py-16"><Spinner /></div>
        ) : riders.length === 0 ? (
          <div className="text-center py-16 text-white/30">
            <Package size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No riders yet. Register or invite your first one above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {riders.map((r) => (
              <div key={r.id} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold text-sm">{r.user.name}</p>
                    <p className="text-white/40 text-xs">{r.user.email}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.isOnline ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                    {r.isOnline ? '● Online' : '○ Offline'}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-white/50 mb-3">
                  <span>{tierLabel[r.vehicleTier] ?? r.vehicleTier}</span>
                  <span className="flex items-center gap-1"><Star size={11} className="text-yellow-400" /> {r.rating.toFixed(1)}</span>
                  <span>{r.totalDeliveries} deliveries</span>
                  {r.vehiclePlate && <span>{r.vehiclePlate}</span>}
                  {!r.isVerified && <span className="text-yellow-400">⏳ KYC pending</span>}
                </div>
                <button onClick={() => remove(r.id)} disabled={removing === r.id}
                  className="flex items-center gap-1.5 text-red-400 text-xs font-medium hover:text-red-300 disabled:opacity-40">
                  <Trash2 size={13} /> {removing === r.id ? 'Removing…' : 'Remove from fleet'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showRegister && <RegisterRiderModal onClose={() => setShowRegister(false)} onDone={() => { setShowRegister(false); load(); }} />}
      {showInvite && <InviteRiderModal onClose={() => setShowInvite(false)} onDone={() => { setShowInvite(false); load(); }} />}
    </div>
  );
}

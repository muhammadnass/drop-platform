'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import {
  MapPin, Clock, Star, LogOut, Wallet,
  Package, Phone, MessageSquare, Navigation,
  ChevronRight, XCircle, AlertTriangle, User,
} from 'lucide-react';

interface PendingOrder {
  id: string;
  pickupAddress: string;
  dropoffAddress: string;
  distanceKm: number;
  totalFareNgn: number;
  riderEarningsNgn: number;
  vehicleTier: string;
  estimatedPickupSecs: number;
}

interface WalletData {
  balanceNgn: number;
  lifetimeEarningsNgn: number;
}

// ── Accept Order Sheet ──────────────────────────────────────────
function AcceptSheet({ order, timeout, onAccept, onDecline }: {
  order: PendingOrder; timeout: number; onAccept: () => void; onDecline: () => void;
}) {
  const [countdown, setCountdown] = useState(timeout);
  useEffect(() => {
    if (countdown <= 0) { onDecline(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, onDecline]);
  const pct = (countdown / timeout) * 100;
  const color = countdown > 10 ? '#E8420A' : '#ef4444';
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center p-4">
      <div className="w-full max-w-sm bg-[#221810] border border-white/10 rounded-3xl p-6">
        <div className="flex justify-center mb-4">
          <div className="relative w-16 h-16">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
              <circle cx="32" cy="32" r="28" fill="none" stroke={color} strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 28}`}
                strokeDashoffset={`${2 * Math.PI * 28 * (1 - pct / 100)}`}
                strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-bold text-lg" style={{ color }}>{countdown}</span>
          </div>
        </div>
        <h3 className="text-center font-bold text-lg mb-1">New Order!</h3>
        <p className="text-center text-white/40 text-sm mb-5">Accept before the timer runs out</p>
        <div className="space-y-3 mb-5">
          {[
            { color: 'bg-green-400', label: 'Pickup',  addr: order.pickupAddress },
            { color: 'bg-[#E8420A]', label: 'Dropoff', addr: order.dropoffAddress },
          ].map((r) => (
            <div key={r.label} className="flex gap-3 items-start bg-white/5 rounded-2xl p-3">
              <div className={`w-2 h-2 rounded-full ${r.color} mt-1.5 shrink-0`} />
              <div><div className="text-xs text-white/40">{r.label}</div><div className="text-sm font-medium">{r.addr}</div></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 mb-5 text-center text-sm">
          <div className="bg-white/5 rounded-xl p-3"><div className="text-white/40 text-xs">Distance</div><div className="font-bold">{order.distanceKm.toFixed(1)} km</div></div>
          <div className="bg-white/5 rounded-xl p-3"><div className="text-white/40 text-xs">You Earn</div><div className="font-bold text-green-400">₦{order.riderEarningsNgn.toLocaleString()}</div></div>
          <div className="bg-white/5 rounded-xl p-3"><div className="text-white/40 text-xs">ETA Pickup</div><div className="font-bold">{Math.ceil(order.estimatedPickupSecs / 60)} min</div></div>
        </div>
        <div className="flex gap-3">
          <button onClick={onDecline} className="flex-1 py-3.5 rounded-xl border border-white/20 text-white/60 font-semibold">Decline</button>
          <button onClick={onAccept} className="flex-grow py-3.5 rounded-xl bg-[#E8420A] text-white font-bold" style={{ boxShadow: '0 4px 20px rgba(232,66,10,0.4)' }}>Accept Order</button>
        </div>
      </div>
    </div>
  );
}

// ── Voice Recorder (mirrors customer side) ─────────────────────
function VoiceRecorder({ onSend }: { onSend: (blob: Blob, dur: number) => void }) {
  const [rec, setRec] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const t = useRef<ReturnType<typeof setInterval> | null>(null);
  const st = useRef(0);

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRec = new MediaRecorder(stream);
    chunks.current = [];
    mediaRec.ondataavailable = (e) => chunks.current.push(e.data);
    mediaRec.onstop = () => {
      onSend(new Blob(chunks.current, { type: 'audio/webm' }), Math.round((Date.now() - st.current) / 1000));
      stream.getTracks().forEach((tr) => tr.stop());
    };
    mediaRec.start(); mr.current = mediaRec; st.current = Date.now();
    setRec(true); setElapsed(0);
    t.current = setInterval(() => setElapsed((p) => p + 1), 1000);
  };
  const stop = () => { mr.current?.stop(); if (t.current) clearInterval(t.current); setRec(false); };

  return rec
    ? <button onClick={stop} className="flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded-full text-xs animate-pulse">🔴 {elapsed}s — tap to send</button>
    : <button onClick={start} className="p-2 text-white/50 hover:text-white text-lg" title="Voice note">🎙</button>;
}

// ── Rider Active Delivery Chat Panel ────────────────────────────
// Mirrors the customer side's ActivePanel. Text messages and voice notes
// are fully wired to the real backend. "Call" is NOT a real audio call —
// there is no WebRTC/audio implementation anywhere in this codebase yet;
// it only logs a call record via /calls so the UI has something to show.
function RiderChatPanel({ delivery, token, onBack }: { delivery: any; token: string; onBack: () => void }) {
  const [messages, setMessages] = useState<any[]>(delivery.messages ?? []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const customer = delivery.customer;

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { const m = await api.sendMessage(delivery.id, text, token); setMessages((p) => [...p, m]); setText(''); }
    finally { setBusy(false); }
  };

  const sendVoice = async (blob: Blob, dur: number) => {
    const b64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
    try {
      const { url } = await api.uploadVoiceNote(b64, delivery.id, token);
      await api.sendVoiceNote(delivery.id, url, dur, token);
      setMessages((p) => [...p, { type: 'VOICE_NOTE', voiceNoteUrl: url, durationSecs: dur, _isMe: true }]);
    } catch { }
  };

  const callCustomer = async () => {
    try { await api.initiateCall(delivery.id, delivery.customerId, token); } catch { }
    alert('Calling customer… (in-app voice calling isn’t built yet — this only logs the call attempt)');
  };

  return (
    <div className="fixed inset-0 z-[1100] bg-[#1A1208] flex flex-col">
      <div className="bg-[#221810] px-4 py-3 flex items-center gap-3 border-b border-white/10">
        <button onClick={onBack} className="text-white/60 hover:text-white text-xl">←</button>
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">{customer?.name ?? 'Customer'}</p>
          <p className="text-white/40 text-xs">{customer?.phone ?? ''}</p>
        </div>
        <button onClick={callCustomer} className="bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-full text-xs font-medium">📞 Call</button>
      </div>

      <div className="mx-4 mt-3 bg-[#221810] border border-white/10 rounded-2xl p-4 space-y-2">
        <div className="flex items-start gap-2"><span className="text-green-400 mt-0.5 text-xs">⬤</span><p className="text-white/80 text-sm flex-1">{delivery.pickupAddress}</p></div>
        <div className="ml-1 border-l border-white/10 h-2" />
        <div className="flex items-start gap-2"><span className="text-[#E8420A] mt-0.5 text-xs">⬤</span><p className="text-white/80 text-sm flex-1">{delivery.dropoffAddress}</p></div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.map((m: any, i: number) => {
          const isMe = m._isMe || m.sender?.role === 'RIDER';
          return (
            <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              {m.type === 'VOICE_NOTE'
                ? <div className={`px-3 py-2 rounded-2xl ${isMe ? 'bg-[#E8420A]' : 'bg-white/10'}`}>
                    <audio src={m.voiceNoteUrl} controls className="h-7 w-40" />
                    {m.durationSecs && <p className="text-white/50 text-xs mt-0.5">{m.durationSecs}s</p>}
                  </div>
                : <div className={`px-3 py-2 rounded-2xl max-w-[72%] text-sm ${isMe ? 'bg-[#E8420A] text-white' : 'bg-white/10 text-white/90'}`}>{m.content}</div>
              }
            </div>
          );
        })}
        <div ref={end} />
      </div>

      <div className="p-4 bg-[#221810] flex items-center gap-2 border-t border-white/10">
        <VoiceRecorder onSend={sendVoice} />
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Message…" className="flex-1 bg-white/10 text-white rounded-full px-4 py-2 text-sm outline-none placeholder-white/30" />
        <button onClick={send} disabled={busy || !text.trim()} className="bg-[#E8420A] disabled:opacity-40 text-white p-2 rounded-full w-9 h-9 flex items-center justify-center">
          {busy ? '…' : '→'}
        </button>
      </div>
    </div>
  );
}

// ── Cancel Sheet ──────────────────────────────────────────────
const CANCEL_REASONS = [
  { code: 'ITEM_TOO_LARGE',    label: 'Item too large for my vehicle' },
  { code: 'CUSTOMER_ABSENT',   label: 'Customer not at pickup location' },
  { code: 'WRONG_ITEM',        label: 'Item does not match description' },
  { code: 'UNSAFE_LOCATION',   label: 'Pickup location feels unsafe' },
  { code: 'VEHICLE_BREAKDOWN', label: 'My vehicle broke down' },
  { code: 'PROHIBITED_ITEM',   label: 'Item appears prohibited/illegal' },
  { code: 'ADDRESS_WRONG',     label: 'Pickup address is incorrect' },
  { code: 'EMERGENCY',         label: 'Personal emergency' },
  { code: 'OTHER',             label: 'Other (describe below)' },
];
function CancelSheet({ onConfirm, onClose }: { onConfirm: (code: string, note: string) => void; onClose: () => void }) {
  const [selected, setSelected] = useState('');
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center p-4">
      <div className="w-full max-w-sm bg-[#221810] border border-white/10 rounded-3xl p-6">
        <h3 className="font-bold text-lg mb-1 flex items-center gap-2"><AlertTriangle size={18} className="text-yellow-400" /> Cancel Delivery</h3>
        <p className="text-white/40 text-sm mb-4">Select a reason for cancelling</p>
        <div className="space-y-2 max-h-52 overflow-y-auto mb-4 pr-1">
          {CANCEL_REASONS.map((r) => (
            <button key={r.code} onClick={() => setSelected(r.code)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-colors ${selected === r.code ? 'border-[#E8420A] bg-[#E8420A]/10 text-white' : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20'}`}>
              {r.label}
            </button>
          ))}
        </div>
        {selected && (
          <textarea value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={selected === 'OTHER' ? 'Describe what happened…' : 'Add details (optional)'}
            rows={2} className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white text-sm placeholder-white/30 outline-none focus:border-[#E8420A] resize-none mb-4" />
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/20 text-white/60 font-semibold">Keep Order</button>
          <button onClick={() => selected && onConfirm(selected, note)} disabled={!selected}
            className="flex-grow py-3 rounded-xl bg-red-500 text-white font-bold disabled:opacity-40">Confirm Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function RiderDashboard() {
  const { user, token, logout, isHydrated } = useAuth();
  const router = useRouter();

  const [isOnline, setIsOnline]             = useState(false);
  const [wallet, setWallet]                 = useState<WalletData | null>(null);
  const [stats, setStats]                   = useState<any>(null);
  const [pendingOrder, setPendingOrder]     = useState<PendingOrder | null>(null);
  const [activeDelivery, setActiveDelivery] = useState<any>(null);
  const [showCancel, setShowCancel]         = useState(false);
  const [showChat, setShowChat]             = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Orders this rider has declined or let time out — the backend's decline
  // endpoint doesn't persist anything, so without this client-side memory the
  // exact same PENDING order gets re-served by every poll and the sheet never
  // stops popping back up.
  const declinedIds = useRef<Set<string>>(new Set());

  useEffect(() => { if (isHydrated && !user) router.replace('/auth/login'); }, [isHydrated, user, router]);

  // Load wallet + stats + any already-active delivery (e.g. after a refresh) on mount
  useEffect(() => {
    if (!token) return;
    api.riderWallet(token).then(setWallet).catch(console.error);
    api.riderStats(token).then(setStats).catch(console.error);
    api.activeOrder(token).then((d) => { if (d) setActiveDelivery(d); }).catch(console.error);
  }, [token]);

  // Poll for available orders when online
  useEffect(() => {
    if (!isOnline || !token) { if (pollRef.current) clearInterval(pollRef.current); return; }
    const poll = async () => {
      if (activeDelivery || pendingOrder) return;
      try {
        const orders = await api.availableOrders(token);
        const next = orders?.find((o: PendingOrder) => !declinedIds.current.has(o.id));
        if (next) setPendingOrder(next);
      } catch { }
    };
    poll();
    pollRef.current = setInterval(poll, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isOnline, token, activeDelivery, pendingOrder]);

  const handleGoOnline = async () => {
    if (!token) return;
    try { await api.riderStatus(!isOnline, undefined, undefined, token); } catch { }
    setIsOnline((v) => !v);
  };

  const handleAccept = useCallback(async () => {
    if (!pendingOrder || !token) return;
    try { await api.acceptOrder(pendingOrder.id, token); } catch { }
    setActiveDelivery(pendingOrder);
    setPendingOrder(null);
  }, [pendingOrder, token]);

  const handleDecline = useCallback(async () => {
    if (!pendingOrder || !token) return;
    declinedIds.current.add(pendingOrder.id);
    try { await api.declineOrder(pendingOrder.id, token); } catch { }
    setPendingOrder(null);
  }, [pendingOrder, token]);

  const handleCancel = useCallback(async (code: string, note: string) => {
    if (!activeDelivery || !token) return;
    try { await api.cancelDelivery(activeDelivery.id, { reason: code, note }, token); } catch { }
    setActiveDelivery(null);
    setShowCancel(false);
  }, [activeDelivery, token]);

  if (!isHydrated || !user) return <Spin />;

  return (
    <div className="min-h-screen bg-[#1A1208] text-white pb-8">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#E8420A] flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 36 36" fill="none">
              <path d="M18 4C18 4 8 10 8 20C8 25.5 12.5 30 18 30C23.5 30 28 25.5 28 20C28 10 18 4 18 4Z" fill="white"/>
              <path d="M18 30L12 36H24L18 30Z" fill="white"/>
            </svg>
          </div>
          <span className="font-bold" style={{ fontFamily: 'var(--font-syne)' }}>Drop</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isOnline ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
            {isOnline ? '● Online' : '○ Offline'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard/rider/profile')} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"><User size={16} /></button>
          <button onClick={async () => { await logout(); router.replace('/auth/login'); }} className="text-white/40 hover:text-white transition-colors"><LogOut size={18} /></button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-6 py-6 space-y-5">
        {/* Wallet */}
        <div className="bg-gradient-to-br from-[#E8420A]/20 to-[#E8420A]/5 border border-[#E8420A]/20 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-white/60 text-sm"><Wallet size={15} /> Wallet Balance</div>
            <button className="text-xs text-[#E8420A] font-semibold">Withdraw</button>
          </div>
          <div className="text-3xl font-bold mb-1">₦{(wallet?.balanceNgn ?? 0).toLocaleString()}</div>
          <div className="text-white/40 text-xs">Lifetime: ₦{(wallet?.lifetimeEarningsNgn ?? 0).toLocaleString()}</div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Today's Trips", value: String(stats?.todayDeliveries ?? 0), icon: Package, color: '#E8420A' },
            { label: 'This Week',     value: String(stats?.weekDeliveries ?? 0),  icon: Clock,   color: '#3B82F6' },
            { label: 'Rating',        value: `${(stats?.rating ?? 5.0).toFixed(1)} ★`, icon: Star, color: '#EAB308' },
          ].map((s) => (
            <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <s.icon size={16} style={{ color: s.color }} className="mx-auto mb-2" />
              <div className="text-lg font-bold">{s.value}</div>
              <div className="text-white/40 text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Active delivery */}
        {activeDelivery && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2"><Navigation size={16} className="text-[#E8420A]" /> Active Delivery</h3>
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">In Progress</span>
            </div>
            <div className="space-y-2 mb-4">
              <div className="flex gap-2 text-sm"><div className="w-2 h-2 rounded-full bg-green-400 mt-1.5 shrink-0" /><span className="text-white/70">{activeDelivery.pickupAddress}</span></div>
              <div className="flex gap-2 text-sm"><div className="w-2 h-2 rounded-full bg-[#E8420A] mt-1.5 shrink-0" /><span className="text-white/70">{activeDelivery.dropoffAddress}</span></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowChat(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-500/20 text-blue-400 text-sm font-semibold"><Phone size={15} /> Call</button>
              <button onClick={() => setShowChat(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/10 text-white/70 text-sm font-semibold"><MessageSquare size={15} /> Chat</button>
              <button onClick={() => setShowCancel(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500/20 text-red-400 text-sm font-semibold"><XCircle size={15} /> Cancel</button>
            </div>
          </div>
        )}

        {/* Go online toggle */}
        {!activeDelivery && (
          <button onClick={handleGoOnline}
            className={`w-full py-5 rounded-2xl font-bold text-lg transition-all active:scale-95 ${isOnline ? 'bg-white/10 border border-white/20 text-white/60' : 'bg-[#E8420A] text-white'}`}
            style={!isOnline ? { boxShadow: '0 4px 24px rgba(232,66,10,0.4)' } : {}}>
            {isOnline ? 'Go Offline' : 'Go Online — Start Earning'}
          </button>
        )}

        {isOnline && !activeDelivery && (
          <div className="flex flex-col items-center gap-2 py-6 text-white/30">
            <div className="w-10 h-10 rounded-full border-2 border-[#E8420A]/30 border-t-[#E8420A] animate-spin" />
            <p className="text-sm mt-2">Waiting for orders…</p>
          </div>
        )}

        {/* Quick links */}
        <div className="space-y-2">
          {[
            { label: 'My Profile & Vehicle', icon: User,    path: '/dashboard/rider/profile' },
            { label: 'Earnings History',      icon: Wallet,  path: '/dashboard/rider/earnings' },
            { label: 'Delivery History',      icon: Package, path: '/dashboard/rider/history' },
          ].map((l) => (
            <button key={l.label} onClick={() => router.push(l.path)}
              className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 hover:border-white/20 transition-colors">
              <div className="flex items-center gap-3 text-sm font-medium"><l.icon size={16} className="text-white/40" /> {l.label}</div>
              <ChevronRight size={15} className="text-white/30" />
            </button>
          ))}
        </div>
      </div>

      {pendingOrder && <AcceptSheet order={pendingOrder} timeout={30} onAccept={handleAccept} onDecline={handleDecline} />}
      {showCancel && <CancelSheet onConfirm={handleCancel} onClose={() => setShowCancel(false)} />}
      {showChat && activeDelivery && token && (
        <RiderChatPanel delivery={activeDelivery} token={token} onBack={() => setShowChat(false)} />
      )}
    </div>
  );
}

function Spin() {
  return <div className="min-h-screen bg-[#1A1208] flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#E8420A] border-t-transparent rounded-full animate-spin" /></div>;
}

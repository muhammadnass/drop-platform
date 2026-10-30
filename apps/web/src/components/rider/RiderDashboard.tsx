'use client';

// ============================================================
// DROP LOGISTICS — Rider Dashboard
// Features:
//   • Icon-driven minimalist UI for quick field actions
//   • Dual-language toggle: English ↔ Hausa
//   • Web Speech API voice alert on new order
//   • One-click Google Maps / Waze navigation to pickup/dropoff
//   • Real-time status update via Socket.io
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Navigation, Package, CheckCircle, PhoneCall,
  Wifi, WifiOff, Bell, BellOff, Globe, Zap, Clock,
  ChevronRight, Star, TrendingUp, AlertTriangle,
} from 'lucide-react';
import { io as ioClient, Socket } from 'socket.io-client';
import type { Delivery, Language, VehicleTier } from '@/types';
import { formatNgn } from '@/lib/fare';

// ── i18n strings ─────────────────────────────────────────────
const STRINGS: Record<Language, Record<string, string>> = {
  en: {
    title:           'Drop Rider',
    online:          'Online',
    offline:         'Offline',
    goOnline:        'Go Online',
    goOffline:       'Go Offline',
    newOrder:        'New Order!',
    accept:          'Accept',
    decline:         'Decline',
    navigate:        'Navigate',
    pickup:          'Pickup',
    dropoff:         'Drop-off',
    markPickedUp:    'Mark Picked Up',
    markDelivered:   'Delivered ✓',
    earnings:        'Earnings',
    deliveries:      'Deliveries',
    rating:          'Rating',
    noOrders:        'Waiting for orders…',
    fareLabel:       'Fare',
    distanceLabel:   'Distance',
    voiceAlert:      'New order!',
    langToggle:      'Hausa',
  },
  ha: {
    title:           'Drop Mai Isar Kaya',
    online:          'Yana Aiki',
    offline:         'Ba Ya Aiki',
    goOnline:        'Fara Aiki',
    goOffline:       'Tsaya Aiki',
    newOrder:        'Sabuwar Oda!',
    accept:          'Karba',
    decline:         'Ki',
    navigate:        'Tafi',
    pickup:          'Ɗauko',
    dropoff:         'Sauka',
    markPickedUp:    'An Ɗauko',
    markDelivered:   'An Isar ✓',
    earnings:        'Kuɗin Aiki',
    deliveries:      'Isar da Kaya',
    rating:          'Kimantawa',
    noOrders:        'Ana jiran odar…',
    fareLabel:       'Kuɗi',
    distanceLabel:   'Nisa',
    voiceAlert:      'Sabuwar Odar',
    langToggle:      'English',
  },
};

// ── Types ─────────────────────────────────────────────────────
interface RiderStats {
  totalEarningsNgn: number;
  todayDeliveries: number;
  rating: number;
  totalDeliveries: number;
}

interface RiderDashboardProps {
  riderId: string;
  authToken: string;
  vehicleTier: VehicleTier;
  initialStats: RiderStats;
}

// ── Vehicle Tier Icon Map ─────────────────────────────────────
const TIER_EMOJI: Record<VehicleTier, string> = {
  DROP_TRI: '🛺',
  DROP_MINI: '🏍️',
  DROP_FLEX: '🚗',
  DROP_MAX:  '🚐',
};

// ── Main Component ────────────────────────────────────────────
export default function RiderDashboard({
  riderId,
  authToken,
  vehicleTier,
  initialStats,
}: RiderDashboardProps) {
  const [lang, setLang] = useState<Language>('en');
  const [isOnline, setIsOnline] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [stats, setStats] = useState<RiderStats>(initialStats);
  const [activeDelivery, setActiveDelivery] = useState<Delivery | null>(null);
  const [pendingOrder, setPendingOrder] = useState<Delivery | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const gpsWatchRef = useRef<number | null>(null);
  const t = STRINGS[lang];

  // ── Voice Alert via Web Speech API ───────────────────────────
  const speakAlert = useCallback(
    (message: string) => {
      if (!soundOn || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = lang === 'ha' ? 'ha-NG' : 'en-NG';
      utterance.rate = 1.0;
      utterance.pitch = 1.1;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    },
    [soundOn, lang]
  );

  // ── Socket.io Connection ──────────────────────────────────────
  useEffect(() => {
    const socket = ioClient(
      process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4000',
      {
        auth: { token: authToken },
        transports: ['websocket'],
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
      }
    );

    socketRef.current = socket;

    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));

    // New order pushed to this rider
    socket.on('order:new', ({ delivery }: { delivery: Delivery }) => {
      setPendingOrder(delivery);
      // Voice alert — bilingual
      speakAlert(lang === 'ha' ? 'Sabuwar Odar' : 'New Order');
      // Vibrate device if available
      if ('vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 600]);
    });

    // Delivery accepted confirmation
    socket.on('system:message', (msg: { type: string; delivery?: Delivery }) => {
      if (msg.type === 'DELIVERY_ACCEPTED' && msg.delivery) {
        setActiveDelivery(msg.delivery);
        setPendingOrder(null);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [authToken, lang, speakAlert]);

  // ── GPS Broadcasting ──────────────────────────────────────────
  const startGPS = useCallback(() => {
    if (!navigator.geolocation) return;

    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const socket = socketRef.current;
        if (!socket?.connected || !activeDelivery) return;

        socket.emit('rider:location', {
          deliveryId: activeDelivery.id,
          lat:        pos.coords.latitude,
          lng:        pos.coords.longitude,
          heading:    pos.coords.heading ?? undefined,
          speed:      pos.coords.speed ?? undefined,
        });
      },
      (err) => console.error('[GPS]', err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 }
    );
  }, [activeDelivery]);

  const stopGPS = useCallback(() => {
    if (gpsWatchRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }
  }, []);

  // ── Online Toggle ─────────────────────────────────────────────
  const toggleOnline = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;

    if (isOnline) {
      socket.emit('rider:offline');
      stopGPS();
      setIsOnline(false);
    } else {
      socket.emit('rider:online');
      startGPS();
      setIsOnline(true);
    }
  }, [isOnline, startGPS, stopGPS]);

  // ── Accept Order ──────────────────────────────────────────────
  const acceptOrder = useCallback(() => {
    if (!pendingOrder || !socketRef.current) return;
    socketRef.current.emit('delivery:accept', pendingOrder.id);
    socketRef.current.emit('delivery:join', pendingOrder.id);
  }, [pendingOrder]);

  // ── Decline Order ─────────────────────────────────────────────
  const declineOrder = useCallback(() => {
    setPendingOrder(null);
  }, []);

  // ── One-Click Navigation ──────────────────────────────────────
  // Opens native Google Maps with pickup or dropoff as destination
  const openNavigation = useCallback(
    (lat: number, lng: number) => {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    []
  );

  // ── Update Delivery Status ────────────────────────────────────
  const updateStatus = useCallback(
    (status: 'PICKED_UP' | 'DELIVERED') => {
      if (!activeDelivery || !socketRef.current) return;
      socketRef.current.emit('delivery:status', {
        deliveryId: activeDelivery.id,
        status,
      });
      if (status === 'DELIVERED') {
        setStats((prev) => ({
          ...prev,
          todayDeliveries:  prev.todayDeliveries + 1,
          totalDeliveries:  prev.totalDeliveries + 1,
          totalEarningsNgn: prev.totalEarningsNgn + (activeDelivery.riderEarningsNgn ?? 0),
        }));
        setActiveDelivery(null);
      }
    },
    [activeDelivery]
  );

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-drop-ink flex flex-col max-w-sm mx-auto relative overflow-hidden">

      {/* ── Header Bar ── */}
      <header className="flex items-center justify-between px-4 pt-safe pt-4 pb-3 bg-drop-ink border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{TIER_EMOJI[vehicleTier]}</span>
          <span className="text-white font-display font-bold text-lg tracking-tight">
            {t.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Socket indicator */}
          <div
            className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-drop-success' : 'bg-drop-error'}`}
            title={socketConnected ? 'Connected' : 'Disconnected'}
          />

          {/* Sound toggle */}
          <button
            onClick={() => setSoundOn((p) => !p)}
            className="p-2 rounded-xl bg-white/10 text-white"
            aria-label="Toggle sound"
          >
            {soundOn ? <Bell size={18} /> : <BellOff size={18} />}
          </button>

          {/* Language toggle */}
          <button
            onClick={() => setLang((l) => (l === 'en' ? 'ha' : 'en'))}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-drop-orange text-white text-xs font-bold"
          >
            <Globe size={14} />
            {t.langToggle}
          </button>
        </div>
      </header>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-3 gap-px bg-white/10 mx-4 mt-4 rounded-2xl overflow-hidden">
        <StatTile
          icon={<TrendingUp size={18} className="text-drop-orange-400" />}
          label={t.earnings}
          value={formatNgn(stats.totalEarningsNgn)}
        />
        <StatTile
          icon={<Package size={18} className="text-drop-orange-400" />}
          label={t.deliveries}
          value={String(stats.todayDeliveries)}
        />
        <StatTile
          icon={<Star size={18} className="text-yellow-400" />}
          label={t.rating}
          value={stats.rating.toFixed(1)}
        />
      </div>

      {/* ── Online Toggle ── */}
      <div className="mx-4 mt-4">
        <button
          onClick={toggleOnline}
          className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all active:scale-95
            ${isOnline
              ? 'bg-drop-success text-white shadow-lg'
              : 'bg-drop-orange text-white shadow-orange'
            }`}
        >
          {isOnline
            ? <><Wifi size={22} /> {t.online} — {t.goOffline}</>
            : <><WifiOff size={22} /> {t.offline} — {t.goOnline}</>
          }
        </button>
      </div>

      {/* ── Active Delivery Card ── */}
      <AnimatePresence>
        {activeDelivery && (
          <motion.div
            key="active-delivery"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mx-4 mt-4 bg-white/10 rounded-2xl p-4 border border-white/20"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-bold text-sm flex items-center gap-2">
                <Zap size={16} className="text-drop-orange" /> In Progress
              </span>
              <span className="text-drop-orange-400 font-bold text-sm">
                {formatNgn(activeDelivery.riderEarningsNgn)}
              </span>
            </div>

            {/* Pickup */}
            <LocationRow
              icon={<MapPin size={16} className="text-drop-orange" />}
              label={t.pickup}
              address={activeDelivery.pickup.address}
              onNavigate={() =>
                openNavigation(activeDelivery.pickup.lat, activeDelivery.pickup.lng)
              }
              navLabel={t.navigate}
            />

            {/* Dropoff */}
            <LocationRow
              icon={<MapPin size={16} className="text-drop-success" />}
              label={t.dropoff}
              address={activeDelivery.dropoff.address}
              onNavigate={() =>
                openNavigation(activeDelivery.dropoff.lat, activeDelivery.dropoff.lng)
              }
              navLabel={t.navigate}
            />

            {/* Status Actions */}
            <div className="flex gap-2 mt-3">
              {activeDelivery.status === 'ACCEPTED' && (
                <ActionButton
                  onClick={() => updateStatus('PICKED_UP')}
                  icon={<Package size={18} />}
                  label={t.markPickedUp}
                  className="bg-drop-orange"
                />
              )}
              {activeDelivery.status === 'PICKED_UP' && (
                <ActionButton
                  onClick={() => updateStatus('DELIVERED')}
                  icon={<CheckCircle size={18} />}
                  label={t.markDelivered}
                  className="bg-drop-success"
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── New Order Alert Modal ── */}
      <AnimatePresence>
        {pendingOrder && (
          <motion.div
            key="new-order-modal"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 260 }}
            className="absolute inset-0 z-50 flex flex-col justify-end"
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Order Sheet */}
            <div className="relative bg-drop-ink border border-white/20 rounded-t-3xl p-6 z-10">
              {/* Pulse indicator */}
              <div className="flex justify-center mb-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-drop-orange flex items-center justify-center animate-pulse-ring">
                    <Bell size={28} className="text-white" />
                  </div>
                </div>
              </div>

              <h2 className="text-white text-center text-2xl font-bold mb-1">
                {t.newOrder}
              </h2>

              {/* Fare & Distance */}
              <div className="flex justify-center gap-6 mb-4">
                <div className="text-center">
                  <p className="text-drop-orange-400 text-xs">{t.fareLabel}</p>
                  <p className="text-white font-bold text-xl">
                    {formatNgn(pendingOrder.totalFareNgn)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-drop-orange-400 text-xs">{t.distanceLabel}</p>
                  <p className="text-white font-bold text-xl">
                    {pendingOrder.distanceKm.toFixed(1)} km
                  </p>
                </div>
              </div>

              {/* Locations */}
              <div className="bg-white/10 rounded-xl p-3 mb-4 space-y-2">
                <LocationRow
                  icon={<MapPin size={14} className="text-drop-orange" />}
                  label={t.pickup}
                  address={pendingOrder.pickup.address}
                  compact
                />
                <LocationRow
                  icon={<MapPin size={14} className="text-drop-success" />}
                  label={t.dropoff}
                  address={pendingOrder.dropoff.address}
                  compact
                />
              </div>

              {/* Accept / Decline */}
              <div className="flex gap-3">
                <button
                  onClick={declineOrder}
                  className="flex-1 py-4 rounded-2xl border border-white/20 text-white font-bold text-base active:scale-95 transition-transform"
                >
                  {t.decline}
                </button>
                <button
                  onClick={acceptOrder}
                  className="flex-2 flex-grow py-4 rounded-2xl bg-drop-orange text-white font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-orange"
                >
                  <CheckCircle size={20} />
                  {t.accept}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Empty / Waiting State ── */}
      {!activeDelivery && !pendingOrder && isOnline && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-1 flex flex-col items-center justify-center text-center px-8 mt-8"
        >
          <Clock size={48} className="text-white/20 mb-3" />
          <p className="text-white/40 text-base">{t.noOrders}</p>
        </motion.div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function StatTile({
  icon, label, value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-drop-ink py-3 px-2 flex flex-col items-center gap-1">
      {icon}
      <p className="text-white font-bold text-sm leading-none">{value}</p>
      <p className="text-white/40 text-xs">{label}</p>
    </div>
  );
}

function LocationRow({
  icon, label, address, onNavigate, navLabel, compact = false,
}: {
  icon: React.ReactNode;
  label: string;
  address: string;
  onNavigate?: () => void;
  navLabel?: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'mb-2'}`}>
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-white/50 text-xs">{label}</p>
        <p className="text-white text-sm font-medium truncate">{address}</p>
      </div>
      {onNavigate && navLabel && (
        <button
          onClick={onNavigate}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-drop-orange text-white text-xs font-bold whitespace-nowrap active:scale-95 transition-transform"
        >
          <Navigation size={12} />
          {navLabel}
        </button>
      )}
    </div>
  );
}

function ActionButton({
  onClick, icon, label, className,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm active:scale-95 transition-transform ${className}`}
    >
      {icon}
      {label}
    </button>
  );
}

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader } from '@googlemaps/js-api-loader';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

const SERVER_BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4000';
// Map rendering, address search and geocoding all run on Google Maps now
// (the Mapbox token/dependency this page used to use has been removed).

type Step = 'map' | 'stops' | 'tier' | 'photos' | 'confirm' | 'active';

interface AddressPoint { address: string; lat: number; lng: number }
// A suggestion row in the autocomplete dropdown. `center` is unknown until
// the prediction is resolved to a full Place (on selection), since Places
// API (New) predictions don't carry lat/lng up front.
interface MapboxFeature {
  place_name: string;
  center: [number, number] | null;
  prediction: google.maps.places.PlacePrediction;
}
interface Stop extends AddressPoint {
  recipientName?: string; recipientPhone?: string; notes?: string;
  distanceKm: number; fareNgn: number;
}
interface TierOption {
  tier: string; label: string; icon: string; desc: string;
  baseFareNgn: number; ratePerKmNgn: number; tierMultiplier: number;
}

function fmt(n: number) { return `₦${Math.round(n).toLocaleString()}`; }

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Google Places API (New) — loader + helpers ─────────────────
// Lazily loads the 'places' library once and caches the promise so every
// helper below (and every AutocompleteInput instance) reuses the same
// bootstrap instead of re-injecting the Maps script.
let placesLibraryPromise: Promise<google.maps.PlacesLibrary> | null = null;
let geocodingLibraryPromise: Promise<google.maps.GeocodingLibrary> | null = null;

function loadPlacesLibrary(): Promise<google.maps.PlacesLibrary> {
  if (!placesLibraryPromise) {
    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
      version: 'weekly',
    });
    placesLibraryPromise = loader.load().then(
      () => google.maps.importLibrary('places') as Promise<google.maps.PlacesLibrary>
    );
  }
  return placesLibraryPromise;
}

// Reverse geocoding (lat/lng → address) has no Places API (New) equivalent
// — it still lives in the core Geocoding library, so that one helper below
// keeps using google.maps.Geocoder rather than the new Place classes.
function loadGeocodingLibrary(): Promise<google.maps.GeocodingLibrary> {
  if (!geocodingLibraryPromise) {
    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
      version: 'weekly',
    });
    geocodingLibraryPromise = loader.load().then(
      () => google.maps.importLibrary('geocoding') as Promise<google.maps.GeocodingLibrary>
    );
  }
  return geocodingLibraryPromise;
}

function locationBiasFor(proximity?: [number, number]): google.maps.CircleLiteral | undefined {
  if (!proximity) return undefined;
  // proximity is [lng, lat] (Mapbox convention, kept for call-site compat)
  return { center: { lat: proximity[1], lng: proximity[0] }, radius: 15000 };
}

// Forward geocode: free-typed text → best-match address + coordinates.
// Used when the customer types an address and hits "Next" without picking
// a suggestion from the dropdown.
async function geocode(query: string, proximity?: [number, number]): Promise<{ lat: number; lng: number; address: string } | null> {
  try {
    const { AutocompleteSuggestion } = await loadPlacesLibrary();
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
      includedRegionCodes: ['ng'],
      locationBias: locationBiasFor(proximity),
    });
    const top = suggestions?.[0]?.placePrediction;
    if (!top) return null;
    const place = top.toPlace();
    await place.fetchFields({ fields: ['location', 'formattedAddress'] });
    if (!place.location) return null;
    return { lat: place.location.lat(), lng: place.location.lng(), address: place.formattedAddress ?? query };
  } catch { return null; }
}

// Autocomplete suggestions — biased to the user's current or pickup
// location, nearest-first. Returns our own MapboxFeature-shaped rows so the
// existing custom-styled dropdown (AutocompleteInput) doesn't need to
// change; `center` stays null until the picked prediction is resolved.
async function suggest(query: string, proximity?: [number, number]): Promise<MapboxFeature[]> {
  if (query.length < 3) return [];
  try {
    const { AutocompleteSuggestion } = await loadPlacesLibrary();
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
      includedRegionCodes: ['ng'],
      locationBias: locationBiasFor(proximity),
    });
    return (suggestions ?? [])
      .filter((s) => s.placePrediction)
      .slice(0, 5)
      .map((s) => ({
        place_name: s.placePrediction!.text.text,
        center: null,
        prediction: s.placePrediction!,
      }));
  } catch { return []; }
}

// Resolves a picked suggestion's full address + lat/lng (Places API (New)
// predictions don't carry coordinates until fetchFields() is called).
async function resolveFeature(f: MapboxFeature): Promise<{ address: string; lat: number; lng: number } | null> {
  try {
    const place = f.prediction.toPlace();
    await place.fetchFields({ fields: ['location', 'formattedAddress'] });
    if (!place.location) return null;
    return {
      address: place.formattedAddress ?? f.place_name,
      lat: place.location.lat(),
      lng: place.location.lng(),
    };
  } catch { return null; }
}

// Reverse geocode (lat/lng → address) — still the core Geocoding library,
// since Places API (New) has no reverse-geocoding equivalent.
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const { Geocoder } = await loadGeocodingLibrary();
    const geocoder = new Geocoder();
    const { results } = await geocoder.geocode({ location: { lat, lng } });
    return results?.[0]?.formatted_address ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
}

let routesLibraryPromise: Promise<google.maps.RoutesLibrary> | null = null;
function loadRoutesLibrary(): Promise<google.maps.RoutesLibrary> {
  if (!routesLibraryPromise) {
    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
      version: 'weekly',
    });
    routesLibraryPromise = loader.load().then(
      () => google.maps.importLibrary('routes') as Promise<google.maps.RoutesLibrary>
    );
  }
  return routesLibraryPromise;
}

// Real road (driving) distance between two points, via Google's Distance
// Matrix API — replaces the old straight-line Haversine estimate, which
// under/over-charges whenever the actual route isn't a straight line.
// Falls back to Haversine only if the API call fails, so a flaky request
// never blocks the booking flow outright.
async function drivingDistanceKm(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<number> {
  try {
    const { DistanceMatrixService } = await loadRoutesLibrary();
    const service = new DistanceMatrixService();
    const result = await service.getDistanceMatrix({
      origins: [{ lat: fromLat, lng: fromLng }],
      destinations: [{ lat: toLat, lng: toLng }],
      travelMode: google.maps.TravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.METRIC,
    });
    const el = result.rows?.[0]?.elements?.[0];
    if (el?.status === 'OK' && el.distance) return el.distance.value / 1000;
    return haversineKm(fromLat, fromLng, toLat, toLng);
  } catch {
    return haversineKm(fromLat, fromLng, toLat, toLng);
  }
}

function Spinner() { return <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />; }

// ── Address Autocomplete Input ────────────────────────────────
interface AutocompleteInputProps {
  value: string;
  onChange: (val: string) => void;
  onSelect: (feature: MapboxFeature) => void;
  placeholder?: string;
  dotColor?: string;
  autoFocus?: boolean;
  proximity?: [number, number]; // [lng, lat] of user
}

function AutocompleteInput({ value, onChange, onSelect, placeholder, dotColor = 'text-orange-400', autoFocus, proximity }: AutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (v: string) => {
    onChange(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const results = await suggest(v, proximity);
      setSuggestions(results);
      setOpen(results.length > 0);
    }, 350);
  };

  const pick = async (f: MapboxFeature) => {
    onChange(f.place_name);
    setSuggestions([]);
    setOpen(false);
    // Places API (New) predictions don't carry coordinates — resolve the
    // full place (address + lat/lng) before handing it to the parent.
    setResolving(true);
    const resolved = await resolveFeature(f);
    setResolving(false);
    if (!resolved) return;
    onChange(resolved.address);
    onSelect({ place_name: resolved.address, center: [resolved.lng, resolved.lat], prediction: f.prediction });
  };

  return (
    <div className="relative">
      <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs ${dotColor}`}>⬤</span>
      <input
        value={value}
        onChange={e => handleChange(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={resolving ? 'Resolving address…' : placeholder}
        disabled={resolving}
        autoFocus={autoFocus}
        className="w-full bg-[#2a2a2a] text-white pl-8 pr-3 py-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500/50 placeholder-white/30 disabled:opacity-60"
      />
      {open && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#1e1e1e] border border-white/10 rounded-xl overflow-hidden shadow-xl">
          {suggestions.map((f, i) => (
            <li key={i} onMouseDown={() => pick(f)}
              className="px-4 py-3 text-sm text-white/80 hover:bg-orange-500/20 hover:text-white cursor-pointer border-b border-white/5 last:border-0 truncate">
              📍 {f.place_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Mapbox Map (dynamically imported — SSR disabled) ─────────
const GoogleMapView = dynamic(() => import('@/components/GoogleMapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center">
      <div className="text-center opacity-40">
        <div className="text-5xl mb-2">🗺</div>
        <p className="text-xs text-white/60">Loading map…</p>
      </div>
    </div>
  )
});

// ── Voice Recorder ────────────────────────────────────────────
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
    mediaRec.ondataavailable = e => chunks.current.push(e.data);
    mediaRec.onstop = () => {
      onSend(new Blob(chunks.current, { type: 'audio/webm' }), Math.round((Date.now() - st.current) / 1000));
      stream.getTracks().forEach(tr => tr.stop());
    };
    mediaRec.start(); mr.current = mediaRec; st.current = Date.now();
    setRec(true); setElapsed(0);
    t.current = setInterval(() => setElapsed(p => p + 1), 1000);
  };
  const stop = () => { mr.current?.stop(); if (t.current) clearInterval(t.current); setRec(false); };

  return rec
    ? <button onClick={stop} className="flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded-full text-xs animate-pulse">🔴 {elapsed}s — tap to send</button>
    : <button onClick={start} className="p-2 text-white/50 hover:text-white text-lg" title="Voice note">🎙</button>;
}

// ── Active Delivery Panel ─────────────────────────────────────
function ActivePanel({ delivery, token, onBack }: { delivery: any; token: string; onBack: () => void }) {
  const [messages, setMessages] = useState<any[]>(delivery.messages ?? []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const rider = delivery.rider;
  const rp = rider?.riderProfile;

  // ── Live rider tracking ─────────────────────────────────────
  // Connects to the same Socket.io server the rider's location updates
  // already broadcast to (server emits 'rider:location' to the
  // `delivery:${id}` room on every /api/riders/location call) — previously
  // nothing on the customer side ever joined that room or listened, so
  // there was no live tracking at all even though the backend supported it.
  const [riderPos, setRiderPos] = useState<[number, number] | null>(
    rp?.lastLatitude && rp?.lastLongitude ? [rp.lastLongitude, rp.lastLatitude] : null
  );
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (!rider) return; // no rider assigned yet (still PENDING) — nothing to track
    const socket = io(SERVER_BASE, { auth: { token } });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('delivery:join', delivery.id));
    socket.on('rider:location', (data: { lat: number; lng: number }) => {
      setRiderPos([data.lng, data.lat]);
    });
    return () => { socket.emit('delivery:leave', delivery.id); socket.disconnect(); };
  }, [delivery.id, rider, token]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { const m = await api.sendMessage(delivery.id, text, token); setMessages(p => [...p, m]); setText(''); }
    finally { setBusy(false); }
  };

  const sendVoice = async (blob: Blob, dur: number) => {
    const b64 = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
    try {
      const { url } = await api.uploadVoiceNote(b64, delivery.id, token);
      await api.sendVoiceNote(delivery.id, url, dur, token);
      setMessages(p => [...p, { type: 'VOICE_NOTE', voiceNoteUrl: url, durationSecs: dur, _isMe: true }]);
    } catch { }
  };

  const statusColors: Record<string, string> = { PENDING: 'bg-yellow-500', ACCEPTED: 'bg-blue-500', ARRIVED_PICKUP: 'bg-purple-500', IN_TRANSIT: 'bg-orange-500', DELIVERED: 'bg-green-500', CANCELLED: 'bg-red-500' };

  return (
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 24, stiffness: 260 }}
      className="fixed inset-0 z-[1100] bg-[#0f0f0f] flex flex-col">
      <div className="bg-[#1a1a1a] px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-white/60 hover:text-white text-xl">←</button>
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">Active Delivery</p>
          <span className={`text-xs text-white px-2 py-0.5 rounded-full ${statusColors[delivery.status] ?? 'bg-gray-600'}`}>{delivery.status.replace(/_/g, ' ')}</span>
        </div>
        {rider && <button onClick={() => alert('Calling rider… (WebRTC pending)')} className="bg-green-600 text-white px-3 py-1.5 rounded-full text-xs font-medium">📞 Call</button>}
      </div>

      {rider && (
        <div className="mx-4 mt-3 bg-[#1a1a1a] rounded-2xl p-4 flex items-center gap-4">
          {rp?.profilePhotoUrl
            ? <img src={`${SERVER_BASE}${rp.profilePhotoUrl}`} className="w-14 h-14 rounded-full object-cover border-2 border-orange-500" alt="Rider" />
            : <div className="w-14 h-14 rounded-full bg-orange-500 flex items-center justify-center text-white text-xl font-bold">{rider.name?.[0] ?? '?'}</div>}
          <div className="flex-1">
            <p className="text-white font-semibold">{rider.name}</p>
            <p className="text-white/50 text-sm">{rp?.vehicleTier?.replace('DROP_', '')} · {rp?.vehiclePlate ?? '—'}</p>
          </div>
          {rp?.vehiclePlatePhotoUrl && <img src={`${SERVER_BASE}${rp.vehiclePlatePhotoUrl}`} className="w-16 h-10 rounded object-cover border border-white/20" alt="Plate" />}
        </div>
      )}

      {rider && (
        <div className="mx-4 mt-3 rounded-2xl overflow-hidden h-40 relative">
          <GoogleMapView
            center={riderPos ?? [delivery.pickupLng, delivery.pickupLat]}
            markerPosition={riderPos}
          />
          {!riderPos && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <p className="text-white/60 text-xs">Waiting for rider's live location…</p>
            </div>
          )}
        </div>
      )}

      <div className="mx-4 mt-3 bg-[#1a1a1a] rounded-2xl p-4 space-y-2">
        <div className="flex items-start gap-2"><span className="text-green-400 mt-0.5 text-xs">⬤</span><p className="text-white/80 text-sm flex-1">{delivery.pickupAddress}</p></div>
        <div className="ml-1 border-l border-white/10 h-2" />
        <div className="flex items-start gap-2"><span className="text-orange-400 mt-0.5 text-xs">⬤</span><p className="text-white/80 text-sm flex-1">{delivery.dropoffAddress}</p></div>
        <div className="flex justify-between pt-1 border-t border-white/10">
          <span className="text-white/40 text-xs">{delivery.distanceKm?.toFixed(1)} km</span>
          <span className="text-orange-400 font-bold text-sm">{fmt(delivery.totalFareNgn)}</span>
        </div>
      </div>

      {delivery.photos?.length > 0 && (
        <div className="mx-4 mt-2 flex gap-2 overflow-x-auto pb-1">
          {delivery.photos.map((p: any, i: number) => (
            <img key={i} src={p.url.startsWith('http') ? p.url : `${SERVER_BASE}${p.url}`} className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-white/10" alt="" />
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.map((m: any, i: number) => {
          const isMe = m._isMe || m.sender?.role === 'CUSTOMER';
          return (
            <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              {m.type === 'VOICE_NOTE'
                ? <div className={`px-3 py-2 rounded-2xl ${isMe ? 'bg-orange-500' : 'bg-[#2a2a2a]'}`}>
                    <audio src={m.voiceNoteUrl?.startsWith('http') ? m.voiceNoteUrl : `${SERVER_BASE}${m.voiceNoteUrl}`} controls className="h-7 w-40" />
                    {m.durationSecs && <p className="text-white/50 text-xs mt-0.5">{m.durationSecs}s</p>}
                  </div>
                : <div className={`px-3 py-2 rounded-2xl max-w-[72%] text-sm ${isMe ? 'bg-orange-500 text-white' : 'bg-[#2a2a2a] text-white/90'}`}>{m.content}</div>
              }
            </div>
          );
        })}
        <div ref={end} />
      </div>

      <div className="p-4 bg-[#1a1a1a] flex items-center gap-2 border-t border-white/5">
        <VoiceRecorder onSend={sendVoice} />
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Message…" className="flex-1 bg-[#2a2a2a] text-white rounded-full px-4 py-2 text-sm outline-none placeholder-white/30" />
        <button onClick={send} disabled={busy || !text.trim()} className="bg-orange-500 disabled:opacity-40 text-white p-2 rounded-full w-9 h-9 flex items-center justify-center">
          {busy ? '…' : '→'}
        </button>
      </div>
    </motion.div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function CustomerDashboard() {
  const { token } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>('map');

  const [pickupInput, setPickupInput] = useState('');
  const [pickup, setPickup] = useState<AddressPoint | null>(null);
  // [lng, lat] for Mapbox
  const [mapCenter, setMapCenter] = useState<[number, number]>([7.3986, 9.0765]); // Abuja default
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(null);
  // User's live location [lng, lat] — used to bias autocomplete
  const [userLocation, setUserLocation] = useState<[number, number] | undefined>(undefined);
  const [locLoading, setLocLoading] = useState(true);

  const [stops, setStops] = useState<Stop[]>([{ address: '', lat: 0, lng: 0, distanceKm: 0, fareNgn: 0 }]);
  const [tiers, setTiers] = useState<TierOption[]>([]);
  const [selectedTier, setSelectedTier] = useState<TierOption | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [itemDesc, setItemDesc] = useState('');
  const [payMethod, setPayMethod] = useState<'CASH' | 'WALLET'>('CASH');
  const [walletBal, setWalletBal] = useState(0);
  const [activeDelivery, setActiveDelivery] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const photoRef = useRef<HTMLInputElement>(null);

  // ── Auto-detect location on mount ──────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setLocLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const addr = await reverseGeocode(lat, lng);
        setUserLocation([lng, lat]);
        setMapCenter([lng, lat]);
        setMarkerPos([lng, lat]);
        setPickupInput(addr);
        setPickup({ address: addr, lat, lng });
        setLocLoading(false);
      },
      () => setLocLoading(false), // silently fall back to Abuja default
      { timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    if (!token) return;
    Promise.allSettled([api.activeDelivery(token), api.customerWallet(token)]).then(([del, wallet]) => {
      if (del.status === 'fulfilled' && del.value) { setActiveDelivery(del.value); setStep('active'); }
      if (wallet.status === 'fulfilled') setWalletBal(wallet.value?.balanceNgn ?? 0);
    });
  }, [token]);

  useEffect(() => {
    if (step !== 'tier' || !token) return;
    api.fareConfig(token).then(cfg => {
      setTiers([
        { tier: 'DROP_MINI', label: 'DROP Mini', icon: '🛵', desc: 'Motorcycle', baseFareNgn: cfg.baseFareMini ?? 500, ratePerKmNgn: cfg.ratePerKmMini ?? 80, tierMultiplier: 1.0 },
        { tier: 'DROP_TRI', label: 'DROP Tri', icon: '🛺', desc: 'Tricycle / Keke', baseFareNgn: cfg.baseFareTri ?? 700, ratePerKmNgn: cfg.ratePerKmTri ?? 100, tierMultiplier: 1.2 },
        { tier: 'DROP_FLEX', label: 'DROP Flex', icon: '🚐', desc: 'Car / Small van', baseFareNgn: cfg.baseFareFlex ?? 1000, ratePerKmNgn: cfg.ratePerKmFlex ?? 130, tierMultiplier: 1.5 },
        { tier: 'DROP_MAX', label: 'DROP Max', icon: '🚛', desc: 'Large truck', baseFareNgn: cfg.baseFareMax ?? 1500, ratePerKmNgn: cfg.ratePerKmMax ?? 180, tierMultiplier: 2.0 },
      ]);
    }).catch(() => {
      setTiers([
        { tier: 'DROP_MINI', label: 'DROP Mini', icon: '🛵', desc: 'Motorcycle', baseFareNgn: 500, ratePerKmNgn: 80, tierMultiplier: 1.0 },
        { tier: 'DROP_TRI', label: 'DROP Tri', icon: '🛺', desc: 'Tricycle / Keke', baseFareNgn: 700, ratePerKmNgn: 100, tierMultiplier: 1.2 },
        { tier: 'DROP_FLEX', label: 'DROP Flex', icon: '🚐', desc: 'Car / Small van', baseFareNgn: 1000, ratePerKmNgn: 130, tierMultiplier: 1.5 },
        { tier: 'DROP_MAX', label: 'DROP Max', icon: '🚛', desc: 'Large truck', baseFareNgn: 1500, ratePerKmNgn: 180, tierMultiplier: 2.0 },
      ]);
    });
  }, [step, token]);

  const calcFare = (t: TierOption, km: number) => Math.round((t.baseFareNgn + t.ratePerKmNgn * km) * t.tierMultiplier);
  const totalFare = selectedTier ? stops.reduce((s, st) => s + calcFare(selectedTier, st.distanceKm || 1), 0) : 0;
  const totalKm = stops.reduce((s, st) => s + (st.distanceKm || 0), 0) || 1;

  // Reset pickup to live location
  const useCurrentLocation = async () => {
    if (!navigator.geolocation) return setError('Geolocation not supported');
    setLoading(true); setError('');
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const addr = await reverseGeocode(lat, lng);
      setUserLocation([lng, lat]);
      setPickupInput(addr);
      setPickup({ address: addr, lat, lng });
      setMapCenter([lng, lat]);
      setMarkerPos([lng, lat]);
      setLoading(false);
    }, () => { setError('Could not get location.'); setLoading(false); });
  };

  const confirmPickup = async () => {
    if (!pickupInput.trim()) return setError('Enter pickup address');
    // If pickup was already set via autocomplete selection, go straight to stops
    if (pickup && pickup.address === pickupInput) { setStep('stops'); return; }
    setLoading(true); setError('');
    try {
      const c = await geocode(pickupInput, userLocation);
      const lat = c?.lat ?? 9.0765;
      const lng = c?.lng ?? 7.3986;
      const addr = c?.address ?? pickupInput;
      setPickup({ address: addr, lat, lng });
      setPickupInput(addr);
      setMapCenter([lng, lat]);
      setMarkerPos([lng, lat]);
      setStep('stops');
    } finally { setLoading(false); }
  };

  const resolveStops = async () => {
    setLoading(true); setError('');
    try {
      let prev = pickup!;
      const resolved = await Promise.all(stops.map(async s => {
        if (!s.address.trim()) return null;
        // If lat/lng already set from autocomplete selection, skip geocoding
        if (s.lat !== 0 && s.lng !== 0) {
          const km = Math.max(await drivingDistanceKm(prev.lat, prev.lng, s.lat, s.lng), 0.5);
          prev = { address: s.address, lat: s.lat, lng: s.lng };
          return { ...s, distanceKm: km };
        }
        const c = await geocode(s.address, userLocation);
        const lat = c?.lat ?? prev.lat + 0.01;
        const lng = c?.lng ?? prev.lng + 0.01;
        const km = Math.max(await drivingDistanceKm(prev.lat, prev.lng, lat, lng), 0.5);
        prev = { address: s.address, lat, lng };
        return { ...s, lat, lng, distanceKm: km, address: c?.address ?? s.address };
      }));
      const valid = resolved.filter(Boolean) as Stop[];
      if (!valid.length) { setError('Enter at least one delivery address'); return false; }
      setStops(valid); return true;
    } catch { setError('Address error. Check and retry.'); return false; }
    finally { setLoading(false); }
  };

  const handlePhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 5 - photoUrls.length);
    if (!files.length || !token) return;
    setLoading(true);
    try {
      const urls = await Promise.all(files.map(async f => {
        const b64 = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f); });
        const { url } = await api.uploadImage(b64, 'items', token);
        return url;
      }));
      setPhotoUrls(p => [...p, ...urls].slice(0, 5));
    } catch (err: any) { setError('Photo upload failed: ' + err.message); }
    finally { setLoading(false); }
  };

  const book = async () => {
    if (!pickup || !selectedTier || !token) return;
    setLoading(true); setError('');
    try {
      const [primary, ...extra] = stops;
      const d = await api.createDelivery({
        pickupAddress: pickup.address, pickupLat: pickup.lat, pickupLng: pickup.lng,
        dropoffAddress: primary.address, dropoffLat: primary.lat, dropoffLng: primary.lng,
        distanceKm: totalKm, vehicleTier: selectedTier.tier,
        itemDescription: itemDesc || undefined, paymentMethod: payMethod,
        photoUrls: photoUrls.length > 0 ? photoUrls.map(u => u.startsWith('http') ? u : `${SERVER_BASE}${u}`) : undefined,
        stops: extra.map(s => ({ address: s.address, lat: s.lat, lng: s.lng, recipientName: s.recipientName, recipientPhone: s.recipientPhone, notes: s.notes, distanceKm: s.distanceKm })),
      }, token);
      setActiveDelivery(d); setStep('active');
      setPickup(null); setPickupInput(''); setStops([{ address: '', lat: 0, lng: 0, distanceKm: 0, fareNgn: 0 }]); setSelectedTier(null); setPhotoUrls([]); setItemDesc('');
    } catch (err: any) { setError(err.message ?? 'Booking failed.'); }
    finally { setLoading(false); }
  };

  const spring = { type: 'spring' as const, damping: 22, stiffness: 220 };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white overflow-hidden">
      <AnimatePresence>
        {step === 'active' && activeDelivery && (
          <ActivePanel key="active" delivery={activeDelivery} token={token!} onBack={() => { setActiveDelivery(null); setStep('map'); }} />
        )}
      </AnimatePresence>

      <div className="relative h-screen flex flex-col">
        <div className="flex-1 relative">
          <GoogleMapView center={mapCenter} markerPosition={markerPos} />
          <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-[#0f0f0f] to-transparent pointer-events-none z-10" />
          <div className="absolute top-4 inset-x-4 flex items-center justify-between z-[1000]">
            <div className="bg-orange-500 rounded-2xl px-4 py-2 shadow-lg"><span className="font-bold text-white tracking-widest text-lg">DROP</span></div>
            <div className="flex items-center gap-2">
              <div className="bg-black/60 backdrop-blur rounded-full px-4 py-2 flex items-center gap-2">
                <span className="text-white/50 text-xs">Wallet</span>
                <span className="text-orange-400 font-bold text-sm">{fmt(walletBal)}</span>
              </div>
              <button onClick={() => router.push('/dashboard/customer/settings')}
                className="bg-black/60 backdrop-blur rounded-full w-9 h-9 flex items-center justify-center text-white/60 hover:text-white">
                ⚙
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 'map' && (
            <motion.div key="s-map" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={spring}
              className="bg-[#1a1a1a] rounded-t-3xl p-6 space-y-4 shadow-2xl z-20 relative">
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto -mt-2" />
              <p className="text-white/50 text-xs uppercase tracking-widest">Where are you sending from?</p>
              <AutocompleteInput
                value={pickupInput}
                onChange={setPickupInput}
                onSelect={f => {
                  // center is always set by AutocompleteInput.pick() before
                  // onSelect fires (it resolves the Places API (New)
                  // prediction to real coordinates first).
                  const center = f.center!;
                  setPickupInput(f.place_name);
                  setPickup({ address: f.place_name, lat: center[1], lng: center[0] });
                  setMapCenter(center);
                  setMarkerPos(center);
                }}
                placeholder={locLoading ? 'Detecting your location…' : 'Enter pickup address'}
                dotColor="text-green-400"
                autoFocus
                proximity={userLocation}
              />
              {/* Always visible — lets customer revert to live location */}
              <button onClick={useCurrentLocation} disabled={loading} className="flex items-center gap-2 text-orange-400 text-sm hover:text-orange-300 transition-colors disabled:opacity-50">
                📍 Use my current location
              </button>
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button onClick={confirmPickup} disabled={loading || !pickupInput.trim()}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-semibold py-3.5 rounded-2xl transition-all active:scale-95">
                {loading ? <Spinner /> : 'Set Pickup →'}
              </button>
              {activeDelivery && <button onClick={() => setStep('active')} className="w-full text-orange-400 text-sm text-center">View active delivery →</button>}
            </motion.div>
          )}

          {step === 'stops' && (
            <motion.div key="s-stops" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={spring}
              className="bg-[#1a1a1a] rounded-t-3xl p-6 space-y-3 shadow-2xl max-h-[72vh] overflow-y-auto z-20 relative">
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto -mt-2" />
              <div className="flex items-center justify-between">
                <div><p className="text-white font-semibold">Delivery stops</p><p className="text-white/40 text-xs">Up to 5 destinations</p></div>
                <button onClick={() => setStep('map')} className="text-white/40 hover:text-white text-sm">← Back</button>
              </div>
              {/* Pickup row with inline "use current location" */}
              <div className="flex items-center gap-2 bg-[#2a2a2a] rounded-xl px-3 py-2">
                <span className="text-green-400 text-xs font-bold">FROM</span>
                <span className="text-white/70 text-sm flex-1 truncate">{pickup?.address}</span>
                <button onClick={useCurrentLocation} className="text-orange-400 text-xs whitespace-nowrap hover:text-orange-300" title="Use current location">📍</button>
              </div>
              {stops.map((s, i) => (
                <div key={i} className="space-y-2 bg-[#242424] rounded-2xl p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-orange-400 text-xs font-bold">STOP {i + 1}</span>
                    {stops.length > 1 && <button onClick={() => setStops(p => p.filter((_, j) => j !== i))} className="text-red-400 text-xs">Remove</button>}
                  </div>
                  <AutocompleteInput
                    value={s.address}
                    onChange={v => setStops(p => p.map((x, j) => j === i ? { ...x, address: v, lat: 0, lng: 0 } : x))}
                    onSelect={f => setStops(p => p.map((x, j) => j === i ? { ...x, address: f.place_name, lat: f.center![1], lng: f.center![0] } : x))}
                    placeholder={`Delivery address${stops.length > 1 ? ` #${i + 1}` : ''}`}
                    proximity={userLocation}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={s.recipientName ?? ''} onChange={e => setStops(p => p.map((x, j) => j === i ? { ...x, recipientName: e.target.value } : x))}
                      placeholder="Recipient name" className="bg-[#2a2a2a] text-white px-3 py-2 rounded-xl text-xs outline-none placeholder-white/30" />
                    <input value={s.recipientPhone ?? ''} onChange={e => setStops(p => p.map((x, j) => j === i ? { ...x, recipientPhone: e.target.value } : x))}
                      placeholder="Recipient phone" className="bg-[#2a2a2a] text-white px-3 py-2 rounded-xl text-xs outline-none placeholder-white/30" />
                  </div>
                </div>
              ))}
              {stops.length < 5 && (
                <button onClick={() => setStops(p => [...p, { address: '', lat: 0, lng: 0, distanceKm: 0, fareNgn: 0 }])}
                  className="w-full border border-dashed border-orange-500/40 text-orange-400 py-2.5 rounded-xl text-sm hover:border-orange-500 transition-colors">
                  + Add another stop
                </button>
              )}
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button onClick={async () => { const ok = await resolveStops(); if (ok) setStep('tier'); }} disabled={loading || !stops[0]?.address.trim()}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-semibold py-3.5 rounded-2xl transition-all active:scale-95">
                {loading ? <Spinner /> : 'Choose Vehicle →'}
              </button>
            </motion.div>
          )}

          {step === 'tier' && (
            <motion.div key="s-tier" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={spring}
              className="bg-[#1a1a1a] rounded-t-3xl p-6 space-y-3 shadow-2xl max-h-[72vh] overflow-y-auto z-20 relative">
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto -mt-2" />
              <div className="flex items-center justify-between">
                <div><p className="text-white font-semibold">Vehicle type</p><p className="text-white/40 text-xs">{totalKm.toFixed(1)} km · {stops.length} stop{stops.length > 1 ? 's' : ''}</p></div>
                <button onClick={() => setStep('stops')} className="text-white/40 hover:text-white text-sm">← Back</button>
              </div>
              <div className="space-y-2">
                {tiers.map(t => {
                  const fare = stops.reduce((s, st) => s + calcFare(t, st.distanceKm || 1), 0);
                  const sel = selectedTier?.tier === t.tier;
                  return (
                    <motion.button key={t.tier} whileTap={{ scale: 0.98 }} onClick={() => setSelectedTier(t)}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${sel ? 'border-orange-500 bg-orange-500/10' : 'border-white/10 bg-[#2a2a2a] hover:border-white/25'}`}>
                      <span className="text-3xl">{t.icon}</span>
                      <div className="flex-1">
                        <p className="text-white font-semibold text-sm">{t.label}</p>
                        <p className="text-white/40 text-xs">{t.desc}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-orange-400 font-bold text-base">{fmt(fare)}</p>
                        <p className="text-white/30 text-xs">{fmt(t.ratePerKmNgn)}/km</p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
              <button onClick={() => setStep('photos')} disabled={!selectedTier}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-semibold py-3.5 rounded-2xl transition-all active:scale-95">
                Add Photos →
              </button>
            </motion.div>
          )}

          {step === 'photos' && (
            <motion.div key="s-photos" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={spring}
              className="bg-[#1a1a1a] rounded-t-3xl p-6 space-y-4 shadow-2xl z-20 relative">
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto -mt-2" />
              <div className="flex items-center justify-between">
                <div><p className="text-white font-semibold">Item photos</p><p className="text-white/40 text-xs">Optional · up to 5</p></div>
                <button onClick={() => setStep('tier')} className="text-white/40 hover:text-white text-sm">← Back</button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {photoUrls.map((url, i) => (
                  <div key={i} className="relative aspect-square">
                    <img src={url.startsWith('http') ? url : `${SERVER_BASE}${url}`} className="w-full h-full object-cover rounded-xl" alt="" />
                    <button onClick={() => setPhotoUrls(p => p.filter((_, j) => j !== i))} className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">×</button>
                  </div>
                ))}
                {photoUrls.length < 5 && (
                  <button onClick={() => photoRef.current?.click()} disabled={loading}
                    className="aspect-square border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center gap-1 hover:border-orange-400/50 transition-colors">
                    {loading ? <Spinner /> : <><span className="text-2xl">📷</span><span className="text-white/40 text-xs">Add</span></>}
                  </button>
                )}
              </div>
              <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple onChange={handlePhotos} className="hidden" />
              <textarea value={itemDesc} onChange={e => setItemDesc(e.target.value)} placeholder="Describe item(s) — e.g. 'Fragile: handle with care'" rows={2}
                className="w-full bg-[#2a2a2a] text-white px-4 py-3 rounded-xl text-sm outline-none placeholder-white/30 resize-none" />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button onClick={() => setStep('confirm')} className="w-full bg-orange-500 hover:bg-orange-400 text-white font-semibold py-3.5 rounded-2xl transition-all active:scale-95">
                Review Booking →
              </button>
            </motion.div>
          )}

          {step === 'confirm' && (
            <motion.div key="s-confirm" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={spring}
              className="bg-[#1a1a1a] rounded-t-3xl p-6 space-y-4 shadow-2xl max-h-[78vh] overflow-y-auto z-20 relative">
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto -mt-2" />
              <div className="flex items-center justify-between">
                <p className="text-white font-semibold text-base">Confirm booking</p>
                <button onClick={() => setStep('photos')} className="text-white/40 hover:text-white text-sm">← Back</button>
              </div>
              <div className="bg-[#2a2a2a] rounded-2xl p-4 space-y-2">
                <div className="flex items-start gap-2"><span className="text-green-400 mt-0.5 text-xs">⬤</span><p className="text-white/80 text-sm flex-1">{pickup?.address}</p></div>
                {stops.map((s, i) => (
                  <div key={i}>
                    <div className="ml-1 border-l border-white/10 h-2" />
                    <div className="flex items-start gap-2">
                      <span className="text-orange-400 mt-0.5 text-xs">⬤</span>
                      <div className="flex-1">
                        <p className="text-white/80 text-sm">{s.address}</p>
                        {s.recipientName && <p className="text-white/40 text-xs">{s.recipientName} · {s.recipientPhone}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {selectedTier && (
                <div className="bg-[#2a2a2a] rounded-2xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{selectedTier.icon}</span>
                    <div className="flex-1"><p className="text-white font-medium text-sm">{selectedTier.label}</p><p className="text-white/40 text-xs">{totalKm.toFixed(1)} km total</p></div>
                    <button onClick={() => setStep('tier')} className="text-orange-400 text-xs font-medium hover:text-orange-300 whitespace-nowrap">Change →</button>
                  </div>
                  <div className="space-y-1.5 border-t border-white/10 pt-3">
                    {stops.map((s, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-white/60">Stop {i+1} ({s.distanceKm.toFixed(1)} km)</span>
                        <span className="text-white">{fmt(calcFare(selectedTier, s.distanceKm || 1))}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t border-white/10 font-bold">
                      <span className="text-white">Total</span>
                      <span className="text-orange-400 text-lg">{fmt(totalFare)}</span>
                    </div>
                  </div>
                </div>
              )}
              <div>
                <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Payment method</p>
                <div className="flex gap-2">
                  {(['CASH', 'WALLET'] as const).map(m => (
                    <button key={m} onClick={() => setPayMethod(m)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${payMethod === m ? 'bg-orange-500 text-white' : 'bg-[#2a2a2a] text-white/60 hover:text-white'}`}>
                      {m === 'CASH' ? '💵 Cash' : `👜 Wallet (${fmt(walletBal)})`}
                    </button>
                  ))}
                </div>
                {payMethod === 'WALLET' && walletBal < totalFare && <p className="text-red-400 text-xs mt-1.5">Insufficient wallet balance. Top up or pay cash.</p>}
              </div>
              {photoUrls.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {photoUrls.map((url, i) => <img key={i} src={url.startsWith('http') ? url : `${SERVER_BASE}${url}`} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-white/10" alt="" />)}
                </div>
              )}
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <motion.button whileTap={{ scale: 0.97 }} onClick={book} disabled={loading || (payMethod === 'WALLET' && walletBal < totalFare)}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold py-4 rounded-2xl text-base transition-all shadow-lg shadow-orange-500/20">
                {loading ? <Spinner /> : `Book Now · ${fmt(totalFare)}`}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

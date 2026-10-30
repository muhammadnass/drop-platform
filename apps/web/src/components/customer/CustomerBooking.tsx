'use client';

// ============================================================
// DROP LOGISTICS — Customer Booking Component
// Features:
//   • Google Maps Places Autocomplete for pickup/dropoff
//   • Real-time Distance Matrix fare calculation
//   • Vehicle tier selector (Mini / Flex / Max)
//   • Live rider marker tracking via Socket.io
//   • Booking confirmation flow
// ============================================================

import React, {
  useCallback, useEffect, useRef, useState, useMemo,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Navigation, Package, Clock, ArrowRight,
  ChevronDown, CheckCircle, Loader2, X, AlertTriangle,
} from 'lucide-react';
import { Loader } from '@googlemaps/js-api-loader';
import { io as ioClient, Socket } from 'socket.io-client';
import type { Delivery, FareBreakdown, LatLng, VehicleTier } from '@/types';
import { formatNgn, calculateFare } from '@/lib/fare';
import { VEHICLE_TIER_META } from '@/types';

// ── Types ─────────────────────────────────────────────────────

interface PlaceResult {
  address: string;
  lat: number;
  lng: number;
  placeId: string;
}

type BookingStep = 'ADDRESS' | 'VEHICLE' | 'CONFIRM' | 'TRACKING';

// ── Main Component ────────────────────────────────────────────

interface CustomerBookingProps {
  customerId: string;
  authToken: string;
}

export default function CustomerBooking({ customerId, authToken }: CustomerBookingProps) {
  // State
  const [step, setStep] = useState<BookingStep>('ADDRESS');
  const [pickup, setPickup] = useState<PlaceResult | null>(null);
  const [dropoff, setDropoff] = useState<PlaceResult | null>(null);
  const [selectedTier, setSelectedTier] = useState<VehicleTier>('DROP_MINI');
  const [fareBreakdown, setFareBreakdown] = useState<FareBreakdown | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDelivery, setActiveDelivery] = useState<Delivery | null>(null);
  const [riderLocation, setRiderLocation] = useState<LatLng | null>(null);

  // Refs
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const pickupInputRef = useRef<HTMLInputElement>(null);
  const dropoffInputRef = useRef<HTMLInputElement>(null);
  const pickupAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const dropoffAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const riderMarkerRef = useRef<google.maps.Marker | null>(null);
  const routeRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // ── Load Google Maps ─────────────────────────────────────────
  useEffect(() => {
    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
      version: 'weekly',
      libraries: ['places', 'geometry'],
    });

    loader.load().then(() => {
      if (!mapDivRef.current) return;

      const map = new google.maps.Map(mapDivRef.current, {
        center: { lat: 9.0579, lng: 7.4951 }, // Abuja, Nigeria
        zoom: 13,
        disableDefaultUI: true,
        zoomControl: true,
        styles: DARK_MAP_STYLE,
      });
      mapRef.current = map;

      routeRendererRef.current = new google.maps.DirectionsRenderer({
        map,
        suppressMarkers: false,
        polylineOptions: {
          strokeColor: '#E8420A',
          strokeWeight: 4,
          strokeOpacity: 0.9,
        },
      });

      // Pickup autocomplete
      if (pickupInputRef.current) {
        pickupAutocompleteRef.current = new google.maps.places.Autocomplete(
          pickupInputRef.current,
          { componentRestrictions: { country: 'ng' } }
        );
        pickupAutocompleteRef.current.addListener('place_changed', () => {
          const place = pickupAutocompleteRef.current!.getPlace();
          if (place.geometry?.location) {
            setPickup({
              address: place.formatted_address ?? '',
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
              placeId: place.place_id ?? '',
            });
          }
        });
      }

      // Dropoff autocomplete
      if (dropoffInputRef.current) {
        dropoffAutocompleteRef.current = new google.maps.places.Autocomplete(
          dropoffInputRef.current,
          { componentRestrictions: { country: 'ng' } }
        );
        dropoffAutocompleteRef.current.addListener('place_changed', () => {
          const place = dropoffAutocompleteRef.current!.getPlace();
          if (place.geometry?.location) {
            setDropoff({
              address: place.formatted_address ?? '',
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
              placeId: place.place_id ?? '',
            });
          }
        });
      }
    });
  }, []);

  // ── Distance Matrix + Fare Calculation ────────────────────────
  useEffect(() => {
    if (!pickup || !dropoff) return;

    setIsLoading(true);
    setError(null);

    const service = new google.maps.DistanceMatrixService();
    service.getDistanceMatrix(
      {
        origins:      [{ lat: pickup.lat, lng: pickup.lng }],
        destinations: [{ lat: dropoff.lat, lng: dropoff.lng }],
        travelMode:   google.maps.TravelMode.DRIVING,
        unitSystem:   google.maps.UnitSystem.METRIC,
      },
      (result, status) => {
        setIsLoading(false);
        if (status !== 'OK' || !result) {
          setError('Could not calculate distance. Please check addresses.');
          return;
        }
        const element = result.rows[0].elements[0];
        if (element.status !== 'OK') {
          setError('No route found between these locations.');
          return;
        }
        const km = element.distance.value / 1000;
        setDistanceKm(km);

        // Draw route on map
        const directionsService = new google.maps.DirectionsService();
        directionsService.route(
          {
            origin:      { lat: pickup.lat, lng: pickup.lng },
            destination: { lat: dropoff.lat, lng: dropoff.lng },
            travelMode:  google.maps.TravelMode.DRIVING,
          },
          (dirResult, dirStatus) => {
            if (dirStatus === 'OK' && routeRendererRef.current) {
              routeRendererRef.current.setDirections(dirResult);
            }
          }
        );
      }
    );
  }, [pickup, dropoff]);

  // ── Recalculate fare when distance or tier changes ────────────
  useEffect(() => {
    if (!distanceKm) return;
    const breakdown = calculateFare({ distanceKm, vehicleTier: selectedTier });
    setFareBreakdown(breakdown);
  }, [distanceKm, selectedTier]);

  // ── Socket.io — Live Rider Tracking ──────────────────────────
  useEffect(() => {
    if (!activeDelivery) return;

    const socket = ioClient(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4000', {
      auth: { token: authToken },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('delivery:join', activeDelivery.id);
    });

    // Real-time rider location updates
    socket.on('rider:location:broadcast', (data: { lat: number; lng: number; heading?: number }) => {
      const pos = { lat: data.lat, lng: data.lng };
      setRiderLocation(pos);

      if (mapRef.current) {
        if (!riderMarkerRef.current) {
          riderMarkerRef.current = new google.maps.Marker({
            map: mapRef.current,
            icon: {
              url: 'data:image/svg+xml,' + encodeURIComponent(RIDER_SVG_ICON),
              scaledSize: new google.maps.Size(44, 44),
              anchor: new google.maps.Point(22, 22),
            },
          });
        }
        riderMarkerRef.current.setPosition(pos);
        mapRef.current.panTo(pos);
      }
    });

    // Delivery status updates
    socket.on('delivery:status:changed', ({ status }: { status: string }) => {
      setActiveDelivery((prev) =>
        prev ? { ...prev, status: status as Delivery['status'] } : prev
      );
      if (status === 'DELIVERED') {
        socket.disconnect();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [activeDelivery, authToken]);

  // ── Book Delivery ─────────────────────────────────────────────
  const bookDelivery = useCallback(async () => {
    if (!pickup || !dropoff || !fareBreakdown) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/deliveries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          pickup,
          dropoff,
          vehicleTier: selectedTier,
          distanceKm:  fareBreakdown.distanceKm,
          fareBreakdown,
        }),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Booking failed');

      setActiveDelivery(json.data);
      setStep('TRACKING');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed. Try again.');
    } finally {
      setIsLoading(false);
    }
  }, [pickup, dropoff, fareBreakdown, selectedTier, authToken]);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-drop-cream overflow-hidden">

      {/* ── Map ── */}
      <div ref={mapDivRef} className="flex-1 w-full bg-drop-sand" />

      {/* ── Bottom Sheet ── */}
      <div className="flex flex-col bg-white rounded-t-3xl shadow-card-lg max-h-[60vh] overflow-y-auto">

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-drop-sand" />
        </div>

        <div className="px-5 pb-8 pt-2">
          {/* ── Step: ADDRESS ─────────────────────────────────────── */}
          {step === 'ADDRESS' && (
            <motion.div
              key="address"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <h2 className="font-display font-bold text-drop-ink text-xl mb-1">
                Where to?
              </h2>

              {/* Pickup Input */}
              <AddressInput
                ref={pickupInputRef}
                icon={<MapPin size={18} className="text-drop-orange" />}
                placeholder="Pickup address"
                value={pickup?.address ?? ''}
                onClear={() => setPickup(null)}
              />

              {/* Dropoff Input */}
              <AddressInput
                ref={dropoffInputRef}
                icon={<MapPin size={18} className="text-drop-success" />}
                placeholder="Drop-off address"
                value={dropoff?.address ?? ''}
                onClear={() => setDropoff(null)}
              />

              {error && (
                <p className="flex items-center gap-1 text-drop-error text-sm">
                  <AlertTriangle size={14} /> {error}
                </p>
              )}

              <button
                onClick={() => setStep('VEHICLE')}
                disabled={!pickup || !dropoff || isLoading}
                className="w-full py-4 rounded-2xl bg-drop-orange text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-40 shadow-orange active:scale-95 transition-transform"
              >
                {isLoading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <>Next <ArrowRight size={18} /></>
                )}
              </button>
            </motion.div>
          )}

          {/* ── Step: VEHICLE ─────────────────────────────────────── */}
          {step === 'VEHICLE' && (
            <motion.div
              key="vehicle"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-drop-ink text-xl">
                  Choose vehicle
                </h2>
                {distanceKm && (
                  <span className="text-drop-ink-muted text-sm">
                    {distanceKm.toFixed(1)} km
                  </span>
                )}
              </div>

              {(['DROP_MINI', 'DROP_FLEX', 'DROP_MAX'] as VehicleTier[]).map((tier) => {
                const meta = VEHICLE_TIER_META[tier];
                const fare = distanceKm
                  ? calculateFare({ distanceKm, vehicleTier: tier })
                  : null;

                return (
                  <VehicleTierCard
                    key={tier}
                    tier={tier}
                    label={meta.label}
                    description={meta.description}
                    icon={meta.icon}
                    fare={fare}
                    selected={selectedTier === tier}
                    onSelect={() => setSelectedTier(tier)}
                  />
                );
              })}

              <button
                onClick={() => setStep('CONFIRM')}
                className="w-full py-4 rounded-2xl bg-drop-orange text-white font-bold text-base flex items-center justify-center gap-2 shadow-orange active:scale-95 transition-transform"
              >
                Confirm vehicle <ArrowRight size={18} />
              </button>
            </motion.div>
          )}

          {/* ── Step: CONFIRM ─────────────────────────────────────── */}
          {step === 'CONFIRM' && fareBreakdown && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <h2 className="font-display font-bold text-drop-ink text-xl">
                Confirm booking
              </h2>

              <div className="bg-drop-sand rounded-2xl p-4 space-y-2">
                <SummaryRow
                  icon={<MapPin size={14} className="text-drop-orange" />}
                  label="Pickup"
                  value={pickup?.address ?? ''}
                />
                <SummaryRow
                  icon={<MapPin size={14} className="text-drop-success" />}
                  label="Drop-off"
                  value={dropoff?.address ?? ''}
                />
                <SummaryRow
                  icon={<Package size={14} className="text-drop-orange" />}
                  label="Vehicle"
                  value={VEHICLE_TIER_META[selectedTier].label}
                />
                <div className="border-t border-drop-cream pt-2">
                  <FareRow label="Base fare"    value={formatNgn(fareBreakdown.baseFareNgn)} />
                  <FareRow label="Distance"     value={formatNgn(fareBreakdown.distanceCharge)} />
                  <FareRow
                    label={`Tier ×${fareBreakdown.tierMultiplier}`}
                    value=""
                    muted
                  />
                  <FareRow
                    label="Total"
                    value={formatNgn(fareBreakdown.totalFareNgn)}
                    bold
                  />
                </div>
              </div>

              {error && (
                <p className="flex items-center gap-1 text-drop-error text-sm">
                  <AlertTriangle size={14} /> {error}
                </p>
              )}

              <button
                onClick={bookDelivery}
                disabled={isLoading}
                className="w-full py-4 rounded-2xl bg-drop-orange text-white font-bold text-lg flex items-center justify-center gap-2 shadow-orange active:scale-95 transition-transform disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 size={22} className="animate-spin" />
                ) : (
                  <>Book — {formatNgn(fareBreakdown.totalFareNgn)}</>
                )}
              </button>
            </motion.div>
          )}

          {/* ── Step: TRACKING ────────────────────────────────────── */}
          {step === 'TRACKING' && activeDelivery && (
            <motion.div
              key="tracking"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <h2 className="font-display font-bold text-drop-ink text-xl">
                Live tracking
              </h2>

              <StatusBadge status={activeDelivery.status} />

              <div className="bg-drop-sand rounded-2xl p-4 space-y-2">
                <SummaryRow
                  icon={<MapPin size={14} className="text-drop-orange" />}
                  label="Pickup"
                  value={pickup?.address ?? ''}
                />
                <SummaryRow
                  icon={<MapPin size={14} className="text-drop-success" />}
                  label="Drop-off"
                  value={dropoff?.address ?? ''}
                />
              </div>

              {riderLocation && (
                <p className="text-drop-ink-muted text-sm text-center">
                  <Navigation size={12} className="inline mr-1" />
                  Rider location updated
                </p>
              )}

              {activeDelivery.status === 'DELIVERED' && (
                <div className="flex flex-col items-center py-4 gap-2">
                  <CheckCircle size={48} className="text-drop-success" />
                  <p className="font-bold text-drop-ink text-lg">Delivered!</p>
                  <button
                    onClick={() => {
                      setStep('ADDRESS');
                      setPickup(null);
                      setDropoff(null);
                      setActiveDelivery(null);
                      setFareBreakdown(null);
                      setDistanceKm(null);
                    }}
                    className="mt-2 px-6 py-3 rounded-2xl bg-drop-orange text-white font-bold"
                  >
                    Book again
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

const AddressInput = React.forwardRef<
  HTMLInputElement,
  { icon: React.ReactNode; placeholder: string; value: string; onClear: () => void }
>(({ icon, placeholder, value, onClear }, ref) => (
  <div className="flex items-center gap-3 bg-drop-sand rounded-2xl px-4 py-3 border border-drop-cream focus-within:border-drop-orange transition-colors">
    {icon}
    <input
      ref={ref}
      type="text"
      placeholder={placeholder}
      defaultValue={value}
      className="flex-1 bg-transparent text-drop-ink placeholder-drop-ink-muted text-sm outline-none"
    />
    {value && (
      <button onClick={onClear} className="text-drop-ink-muted">
        <X size={16} />
      </button>
    )}
  </div>
));
AddressInput.displayName = 'AddressInput';

function VehicleTierCard({
  tier, label, description, icon, fare, selected, onSelect,
}: {
  tier: VehicleTier;
  label: string;
  description: string;
  icon: string;
  fare: FareBreakdown | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left
        ${selected
          ? 'border-drop-orange bg-orange-50'
          : 'border-drop-sand bg-white hover:border-drop-orange/30'
        }`}
    >
      <span className="text-3xl">{icon}</span>
      <div className="flex-1">
        <p className="font-bold text-drop-ink">{label}</p>
        <p className="text-drop-ink-muted text-xs">{description}</p>
      </div>
      {fare && (
        <span className="font-bold text-drop-ink text-sm whitespace-nowrap">
          {formatNgn(fare.totalFareNgn)}
        </span>
      )}
    </button>
  );
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5">{icon}</span>
      <div>
        <p className="text-drop-ink-muted text-xs">{label}</p>
        <p className="text-drop-ink text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function FareRow({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${muted ? 'opacity-50' : ''}`}>
      <span className={`text-sm ${bold ? 'font-bold text-drop-ink' : 'text-drop-ink-muted'}`}>{label}</span>
      {value && (
        <span className={`text-sm ${bold ? 'font-bold text-drop-ink' : 'text-drop-ink'}`}>{value}</span>
      )}
    </div>
  );
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:    { label: 'Finding rider…',  color: 'bg-drop-warning/20 text-drop-warning' },
  ACCEPTED:   { label: 'Rider on the way', color: 'bg-blue-50 text-blue-600' },
  PICKED_UP:  { label: 'Picked up',        color: 'bg-blue-100 text-blue-700' },
  IN_TRANSIT: { label: 'In transit',       color: 'bg-drop-orange/10 text-drop-orange' },
  DELIVERED:  { label: 'Delivered!',       color: 'bg-drop-success/20 text-drop-success' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'bg-drop-sand text-drop-ink' };
  return (
    <div className={`flex items-center justify-center gap-2 py-2 px-4 rounded-full ${cfg.color} w-fit mx-auto`}>
      <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
      <span className="font-semibold text-sm">{cfg.label}</span>
    </div>
  );
}

// ── Dark Map Style ────────────────────────────────────────────
const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry',        stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#746855' }] },
  { featureType: 'road',            elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'road.highway',    elementType: 'geometry', stylers: [{ color: '#746855' }] },
  { featureType: 'water',           elementType: 'geometry', stylers: [{ color: '#17263c' }] },
];

// ── Rider Marker SVG ──────────────────────────────────────────
const RIDER_SVG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <circle cx="22" cy="22" r="20" fill="#E8420A" stroke="white" stroke-width="3"/>
  <text x="22" y="28" text-anchor="middle" font-size="18">🏍️</text>
</svg>`;

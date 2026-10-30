// ============================================================
// DROP LOGISTICS — Fare Calculation Utility
// ============================================================
// Formula: Total = (BaseFare + (RatePerKm × Distance)) × TierMultiplier
// Platform commission: 8% of total fare
// Rider earnings: 92% of total fare
// ============================================================

import type { FareInput, FareBreakdown, VehicleTier } from '@/types';

// Default pricing (overridden by PlatformConfig from DB)
export const DEFAULT_BASE_FARE_NGN = 1_500;
export const DEFAULT_RATE_PER_KM_NGN = 500;
export const DEFAULT_COMMISSION_PCT = 8;

// Tier multipliers — kept in sync with DB RateConfig
export const TIER_MULTIPLIERS: Record<VehicleTier, number> = {
  DROP_TRI: 1.2,
  DROP_MINI: 1.0,
  DROP_FLEX: 1.5,
  DROP_MAX:  2.2,
};

/**
 * calculateFare
 * Computes the full fare breakdown for a Drop delivery.
 *
 * @example
 * calculateFare({ distanceKm: 5, vehicleTier: 'DROP_FLEX' })
 * // => { totalFareNgn: 7500, platformFeeNgn: 600, riderEarningsNgn: 6900, ... }
 */
export function calculateFare({
  distanceKm,
  vehicleTier,
  baseFareNgn = DEFAULT_BASE_FARE_NGN,
  ratePerKmNgn = DEFAULT_RATE_PER_KM_NGN,
}: FareInput): FareBreakdown {
  if (distanceKm < 0) throw new Error('distanceKm must be non-negative');

  const tierMultiplier = TIER_MULTIPLIERS[vehicleTier];
  const distanceCharge = ratePerKmNgn * distanceKm;
  const subtotal = (baseFareNgn + distanceCharge) * tierMultiplier;

  const platformFeeNgn = roundNgn(subtotal * (DEFAULT_COMMISSION_PCT / 100));
  const totalFareNgn = roundNgn(subtotal);
  const riderEarningsNgn = roundNgn(totalFareNgn - platformFeeNgn);

  return {
    baseFareNgn,
    distanceCharge: roundNgn(distanceCharge),
    tierMultiplier,
    subtotal: roundNgn(subtotal),
    platformFeeNgn,
    totalFareNgn,
    riderEarningsNgn,
    distanceKm,
    vehicleTier,
  };
}

/**
 * Estimate fare range before distance matrix call resolves.
 * Uses straight-line (Haversine) distance with a 1.3× road factor.
 */
export function estimateFare(
  pickup: { lat: number; lng: number },
  dropoff: { lat: number; lng: number },
  vehicleTier: VehicleTier,
  overrides?: { baseFareNgn?: number; ratePerKmNgn?: number }
): FareBreakdown {
  const straightLineKm = haversineKm(pickup, dropoff);
  const estimatedRoadKm = straightLineKm * 1.3; // road-factor correction

  return calculateFare({
    distanceKm: parseFloat(estimatedRoadKm.toFixed(2)),
    vehicleTier,
    ...overrides,
  });
}

/**
 * Format fare as Nigerian Naira string
 */
export function formatNgn(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── Helpers ──────────────────────────────────────────────────

function roundNgn(value: number): number {
  // Round to nearest 50 Naira for clean pricing
  return Math.ceil(value / 50) * 50;
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const haversine =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

import { prisma } from './prisma';
import { VehicleTier } from '@prisma/client';

const MULTIPLIERS: Record<VehicleTier, number> = {
  DROP_MINI: 1.0,
  DROP_TRI:  1.3,
  DROP_FLEX: 1.5,
  DROP_MAX:  2.2,
};

export async function calculateFare(distanceKm: number, vehicleTier: VehicleTier) {
  const cfgBase  = await prisma.platformConfig.findUnique({ where: { key: 'BASE_FARE_NGN' } });
  const cfgRate  = await prisma.platformConfig.findUnique({ where: { key: 'RATE_PER_KM_NGN' } });
  const cfgComm  = await prisma.platformConfig.findUnique({ where: { key: 'COMMISSION_PCT' } });

  const baseFare    = parseFloat(cfgBase?.value  ?? '1500');
  const ratePerKm   = parseFloat(cfgRate?.value  ?? '500');
  const commPct     = parseFloat(cfgComm?.value  ?? '8') / 100;
  const multiplier  = MULTIPLIERS[vehicleTier] ?? 1.0;

  const distCharge  = distanceKm * ratePerKm;
  const subtotal    = (baseFare + distCharge) * multiplier;
  const platformFee = subtotal * commPct;
  const total       = subtotal;
  const riderEarn   = subtotal - platformFee;

  return {
    baseFareNgn:      baseFare,
    distanceCharge:   distCharge,
    tierMultiplier:   multiplier,
    subtotal,
    platformFeeNgn:   platformFee,
    totalFareNgn:     Math.round(total),
    riderEarningsNgn: Math.round(riderEarn),
    distanceKm,
    vehicleTier,
    ratePerKmNgn:     ratePerKm,
    commissionPct:    commPct * 100,
  };
}

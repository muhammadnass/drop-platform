// ============================================================
// DROP LOGISTICS — Fare Routes
// ============================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../services/prisma';
import { calculateFare } from '../services/fare.service';

const router = Router();

// POST /api/fare/calculate
router.post('/calculate', async (req: Request, res: Response) => {
  const Schema = z.object({
    distanceKm:  z.number().min(0.1).max(500),
    vehicleTier: z.enum(['DROP_MINI', 'DROP_TRI', 'DROP_FLEX', 'DROP_MAX']),
  });
  const result = Schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ success: false, error: result.error.flatten() });

  const fare = await calculateFare(result.data.distanceKm, result.data.vehicleTier as any);
  return res.json({ success: true, data: fare });
});

// GET /api/fare/config
router.get('/config', async (_req: Request, res: Response) => {
  const [configs, rateConfigs] = await Promise.all([
    prisma.platformConfig.findMany(),
    prisma.rateConfig.findMany({ where: { isActive: true }, orderBy: { tierMultiplier: 'asc' } }),
  ]);
  const map = Object.fromEntries(configs.map((c) => [c.key, c.value]));
  return res.json({
    success: true,
    data: {
      baseFareNgn:   parseFloat(map['BASE_FARE_NGN']   ?? '1500'),
      ratePerKmNgn:  parseFloat(map['RATE_PER_KM_NGN'] ?? '500'),
      commissionPct: parseFloat(map['COMMISSION_PCT']  ?? '8'),
      tiers: rateConfigs,
    },
  });
});

// GET /api/fare/cancellation-reasons
router.get('/cancellation-reasons/:role', async (req: Request, res: Response) => {
  const role = req.params.role.toUpperCase() as 'RIDER' | 'CUSTOMER';
  if (!['RIDER', 'CUSTOMER'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role' });
  }
  const reasons = await prisma.cancellationReason.findMany({
    where:   { forRole: role, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  return res.json({ success: true, data: reasons });
});

export { router as fareRouter };

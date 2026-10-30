// ============================================================
// DROP LOGISTICS — Business Owner Routes
// ============================================================

import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, requireRole } from '../middleware/auth.middleware';
import { prisma } from '../services/prisma';

const router = Router();
const guard = requireRole('BUSINESS_OWNER');

// ── GET /api/businesses/profile ───────────────────────────────
router.get('/profile', guard, async (req: AuthRequest, res: Response) => {
  const biz = await prisma.business.findUnique({
    where:   { ownerId: req.user!.userId },
    include: { subscription: true, _count: { select: { riders: true, deliveries: true } } },
  });
  if (!biz) return res.status(404).json({ success: false, error: 'Business not found' });
  return res.json({ success: true, data: biz });
});

// ── PATCH /api/businesses/profile ────────────────────────────
router.patch('/profile', guard, async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    name:           z.string().min(2).max(100).optional(),
    description:    z.string().max(500).optional(),
    address:        z.string().max(200).optional(),
    website:        z.string().url().optional().or(z.literal('')),
    industry:       z.string().max(60).optional(),
    customBranding: z.object({
      primaryColor:   z.string().optional(),
      welcomeMessage: z.string().max(200).optional(),
    }).optional(),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const biz = await prisma.business.update({
    where: { ownerId: req.user!.userId },
    data:  parsed.data,
  });
  return res.json({ success: true, data: biz });
});

// ── GET /api/businesses/riders ────────────────────────────────
router.get('/riders', guard, async (req: AuthRequest, res: Response) => {
  const biz = await prisma.business.findUnique({ where: { ownerId: req.user!.userId } });
  if (!biz) return res.status(404).json({ success: false, error: 'Business not found' });

  const riders = await prisma.riderProfile.findMany({
    where:   { businessId: biz.id },
    include: { user: { select: { name: true, email: true, phone: true } }, wallet: true },
  });
  return res.json({ success: true, data: riders });
});

// ── POST /api/businesses/riders/invite ────────────────────────
// Assigns an existing rider user to this business
router.post('/riders/invite', guard, async (req: AuthRequest, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email required' });

  const biz = await prisma.business.findUnique({ where: { ownerId: req.user!.userId } });
  if (!biz) return res.status(404).json({ success: false, error: 'Business not found' });

  const rider = await prisma.user.findUnique({ where: { email }, include: { riderProfile: true } });
  if (!rider || rider.role !== 'RIDER') {
    return res.status(404).json({ success: false, error: 'No rider found with that email' });
  }
  if (!rider.riderProfile) {
    return res.status(400).json({ success: false, error: 'User has no rider profile' });
  }

  await prisma.riderProfile.update({
    where: { id: rider.riderProfile.id },
    data:  { businessId: biz.id },
  });

  return res.json({ success: true, message: `${rider.name} added to your fleet` });
});

// ── DELETE /api/businesses/riders/:riderId ────────────────────
router.delete('/riders/:riderId', guard, async (req: AuthRequest, res: Response) => {
  const biz = await prisma.business.findUnique({ where: { ownerId: req.user!.userId } });
  if (!biz) return res.status(404).json({ success: false, error: 'Business not found' });

  await prisma.riderProfile.updateMany({
    where: { id: req.params.riderId, businessId: biz.id },
    data:  { businessId: null },
  });
  return res.json({ success: true, message: 'Rider removed from fleet' });
});

// ── GET /api/businesses/deliveries ───────────────────────────
router.get('/deliveries', guard, async (req: AuthRequest, res: Response) => {
  const biz = await prisma.business.findUnique({ where: { ownerId: req.user!.userId } });
  if (!biz) return res.status(404).json({ success: false, error: 'Business not found' });

  const page = parseInt(req.query.page as string ?? '1');
  const take = 20;
  const skip = (page - 1) * take;

  const [deliveries, total] = await Promise.all([
    prisma.delivery.findMany({
      where:   { businessId: biz.id },
      include: { customer: { select: { name: true } }, rider: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      skip, take,
    }),
    prisma.delivery.count({ where: { businessId: biz.id } }),
  ]);

  return res.json({ success: true, data: deliveries, total, page, totalPages: Math.ceil(total / take) });
});

// ── GET /api/businesses/stats ─────────────────────────────────
router.get('/stats', guard, async (req: AuthRequest, res: Response) => {
  const biz = await prisma.business.findUnique({ where: { ownerId: req.user!.userId } });
  if (!biz) return res.status(404).json({ success: false, error: 'Business not found' });

  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);

  const [active, riders, monthTotal, monthRevenue] = await Promise.all([
    prisma.delivery.count({ where: { businessId: biz.id, status: { in: ['PENDING', 'ACCEPTED', 'IN_TRANSIT'] } } }),
    prisma.riderProfile.count({ where: { businessId: biz.id } }),
    prisma.delivery.count({ where: { businessId: biz.id, status: 'DELIVERED', createdAt: { gte: start } } }),
    prisma.delivery.aggregate({ where: { businessId: biz.id, status: 'DELIVERED', createdAt: { gte: start } }, _sum: { totalFareNgn: true } }),
  ]);

  return res.json({
    success: true,
    data: {
      activeDeliveries: active,
      totalRiders:      riders,
      monthDeliveries:  monthTotal,
      monthSpendNgn:    monthRevenue._sum.totalFareNgn ?? 0,
    },
  });
});

export { router as businessRouter };

// ============================================================
// DROP LOGISTICS — Admin + Manager Routes
// ============================================================

import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, requireRole } from '../middleware/auth.middleware';
import { prisma } from '../services/prisma';

const router = Router();
const adminOnly  = requireRole('SUPER_ADMIN');
const staffGuard = requireRole('SUPER_ADMIN', 'MANAGER');

// ── GET /api/admin/stats ──────────────────────────────────────
router.get('/stats', staffGuard, async (_req: AuthRequest, res: Response) => {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1); // start of month

  const [totalUsers, totalRiders, activeRiders, pendingDeliveries, activeDeliveries,
         monthlyDeliveries, monthRevenue, totalBusinesses] = await Promise.all([
    prisma.user.count(),
    prisma.riderProfile.count(),
    prisma.riderProfile.count({ where: { isOnline: true } }),
    prisma.delivery.count({ where: { status: 'PENDING' } }),
    prisma.delivery.count({ where: { status: { in: ['ACCEPTED', 'ARRIVED_PICKUP', 'IN_TRANSIT'] } } }),
    prisma.delivery.count({ where: { status: 'DELIVERED', createdAt: { gte: start } } }),
    prisma.delivery.aggregate({ where: { status: 'DELIVERED', createdAt: { gte: start } }, _sum: { platformFeeNgn: true } }),
    prisma.business.count(),
  ]);

  return res.json({
    success: true,
    data: {
      totalUsers,
      totalRiders,
      activeRiders,
      pendingDeliveries,
      activeDeliveries,
      monthlyDeliveries,
      monthlyRevenueNgn: monthRevenue._sum.platformFeeNgn ?? 0,
      totalBusinesses,
    },
  });
});

// ── GET /api/admin/users ──────────────────────────────────────
router.get('/users', staffGuard, async (req: AuthRequest, res: Response) => {
  const page   = parseInt(req.query.page as string ?? '1');
  const take   = 20;
  const skip   = (page - 1) * take;
  const search = req.query.search as string | undefined;
  const role   = req.query.role   as string | undefined;

  const where: any = {};
  if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }];
  if (role)   where.role = role;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      skip, take,
    }),
    prisma.user.count({ where }),
  ]);

  return res.json({ success: true, data: users, total, page, totalPages: Math.ceil(total / take) });
});

// ── GET /api/admin/users/:id ──────────────────────────────────
router.get('/users/:id', staffGuard, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where:   { id: req.params.id },
    include: { riderProfile: { include: { wallet: true } }, customerProfile: true, business: true },
  });
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  const { passwordHash, ...safe } = user as any;
  return res.json({ success: true, data: safe });
});

// ── PATCH /api/admin/users/:id ────────────────────────────────
router.patch('/users/:id', adminOnly, async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    role:     z.enum(['SUPER_ADMIN', 'MANAGER', 'BUSINESS_OWNER', 'RIDER', 'CUSTOMER']).optional(),
    isActive: z.boolean().optional(),
    name:     z.string().min(2).optional(),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  // Auto-create riderProfile if upgrading to RIDER
  if (parsed.data.role === 'RIDER') {
    const existing = await prisma.riderProfile.findUnique({ where: { userId: req.params.id } });
    if (!existing) {
      await prisma.riderProfile.create({ data: { userId: req.params.id } });
    }
  }

  const user = await prisma.user.update({
    where:  { id: req.params.id },
    data:   parsed.data,
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  return res.json({ success: true, data: user });
});

// ── DELETE /api/admin/users/:id ── deactivate only ────────────
router.delete('/users/:id', adminOnly, async (req: AuthRequest, res: Response) => {
  if (req.params.id === req.user!.userId) {
    return res.status(400).json({ success: false, error: 'Cannot deactivate your own account' });
  }
  await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
  return res.json({ success: true, message: 'User deactivated' });
});

// ── GET /api/admin/deliveries ─────────────────────────────────
router.get('/deliveries', staffGuard, async (req: AuthRequest, res: Response) => {
  const page   = parseInt(req.query.page as string ?? '1');
  const take   = 20;
  const skip   = (page - 1) * take;
  const status = req.query.status as string | undefined;

  const where: any = {};
  if (status) where.status = status;

  const [deliveries, total] = await Promise.all([
    prisma.delivery.findMany({
      where,
      include: {
        customer: { select: { name: true, email: true, phone: true } },
        rider:    { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip, take,
    }),
    prisma.delivery.count({ where }),
  ]);

  return res.json({ success: true, data: deliveries, total, page, totalPages: Math.ceil(total / take) });
});

// ── GET /api/admin/revenue ────────────────────────────────────
router.get('/revenue', staffGuard, async (_req: AuthRequest, res: Response) => {
  // Last 6 months breakdown
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const agg = await prisma.delivery.aggregate({
      where: { status: 'DELIVERED', createdAt: { gte: start, lte: end } },
      _sum:  { platformFeeNgn: true, totalFareNgn: true },
      _count: true,
    });
    months.push({
      month:      start.toLocaleString('default', { month: 'short', year: 'numeric' }),
      revenue:    agg._sum.platformFeeNgn ?? 0,
      gmv:        agg._sum.totalFareNgn   ?? 0,
      deliveries: agg._count,
    });
  }
  return res.json({ success: true, data: months });
});

// ── GET /api/admin/businesses ─────────────────────────────────
router.get('/businesses', staffGuard, async (req: AuthRequest, res: Response) => {
  const businesses = await prisma.business.findMany({
    include: {
      owner:        { select: { name: true, email: true } },
      subscription: true,
      _count:       { select: { riders: true, deliveries: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ success: true, data: businesses });
});

// ── GET/PATCH /api/admin/platform-config ─────────────────────
router.get('/platform-config', staffGuard, async (_req: AuthRequest, res: Response) => {
  const configs = await prisma.platformConfig.findMany();
  const map: Record<string, string> = {};
  for (const c of configs) map[c.key] = c.value;
  return res.json({ success: true, data: map });
});

router.patch('/platform-config', adminOnly, async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    BASE_FARE_NGN:   z.number().positive().optional(),
    RATE_PER_KM_NGN: z.number().positive().optional(),
    COMMISSION_PCT:  z.number().min(0).max(100).optional(),
    RIDER_ACCEPT_TIMEOUT: z.number().positive().optional(),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const updates = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      updates.push(
        prisma.platformConfig.upsert({
          where:  { key },
          update: { value: String(value), updatedBy: req.user!.userId },
          create: { key, value: String(value), updatedBy: req.user!.userId },
        })
      );
    }
  }
  await Promise.all(updates);
  return res.json({ success: true, message: 'Platform config updated' });
});

// ── GET /api/admin/rate-configs ───────────────────────────────
router.get('/rate-configs', staffGuard, async (_req: AuthRequest, res: Response) => {
  const configs = await prisma.rateConfig.findMany({ orderBy: { tierMultiplier: 'asc' } });
  return res.json({ success: true, data: configs });
});

export { router as adminRouter };

// ============================================================
// DROP LOGISTICS — Rider Routes
// All routes require authMiddleware (applied in index.ts)
// ============================================================

import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, requireRole } from '../middleware/auth.middleware';
import { prisma } from '../services/prisma';
import { paystackInitialize, paystackVerify } from '../services/paystack.service';
import { io } from '../index';

const router = Router();
const guard  = requireRole('RIDER');

// ── Wallet balance limit (NGN) ────────────────────────────────
const WALLET_BLOCK_LIMIT = -8000; // if balance ≤ this, block new orders

// ── GET /api/riders/profile ───────────────────────────────────
router.get('/profile', guard, async (req: AuthRequest, res: Response) => {
  const profile = await prisma.riderProfile.findUnique({
    where:   { userId: req.user!.userId },
    include: {
      wallet: true,
      user:   { select: { name: true, email: true, phone: true, avatarUrl: true } },
    },
  });
  if (!profile) return res.status(404).json({ success: false, error: 'Rider profile not found' });
  return res.json({ success: true, data: profile });
});

// ── PATCH /api/riders/profile ─────────────────────────────────
router.patch('/profile', guard, async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    vehicleType:          z.enum(['MOTORBIKE', 'CAR', 'TRICYCLE', 'MINIVAN']).optional(),
    vehiclePlate:         z.string().max(20).optional(),
    vehicleModel:         z.string().max(60).optional(),
    vehicleColor:         z.string().max(40).optional(),
    licenseNumber:        z.string().max(30).optional(),
    profilePhotoUrl:      z.string().url().optional(),
    vehiclePlatePhotoUrl: z.string().url().optional(),
  });
  const tierMap: Record<string, any> = {
    MOTORBIKE: 'DROP_MINI', TRICYCLE: 'DROP_TRI', CAR: 'DROP_FLEX', MINIVAN: 'DROP_MAX',
  };
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const { vehicleType, ...rest } = parsed.data;
  const updateData: any = { ...rest };
  if (vehicleType) {
    updateData.vehicleType = vehicleType;
    updateData.vehicleTier = tierMap[vehicleType];
  }

  const profile = await prisma.riderProfile.update({
    where: { userId: req.user!.userId },
    data:  updateData,
  });
  return res.json({ success: true, data: profile });
});

// ── POST /api/riders/kyc ──── Mock KYC (NIN or BVN) ──────────
router.post('/kyc', guard, async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    kycType:  z.enum(['NIN', 'BVN']),
    kycValue: z.string().min(10).max(20),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const profile = await prisma.riderProfile.findUnique({ where: { userId: req.user!.userId } });
  if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

  // Mock validation — NIN must be 11 digits, BVN must be 11 digits
  const value = parsed.data.kycValue.replace(/\s/g, '');
  if (!/^\d{11}$/.test(value)) {
    return res.status(400).json({ success: false, error: `${parsed.data.kycType} must be exactly 11 digits` });
  }

  // In mock mode: set PENDING, then auto-verify after 3 seconds
  await prisma.riderProfile.update({
    where: { userId: req.user!.userId },
    data: {
      kycType:       parsed.data.kycType,
      kycValue:      value, // hash in production!
      kycStatus:     'PENDING',
      kycSubmittedAt: new Date(),
    },
  });

  // Mock: auto-verify after 2s (real integration would verify via NIMC/Interswitch API)
  setTimeout(async () => {
    await prisma.riderProfile.update({
      where: { userId: req.user!.userId },
      data: { kycStatus: 'VERIFIED', kycVerifiedAt: new Date(), isVerified: true },
    });
    io.to(`user:${req.user!.userId}`).emit('kyc:verified', { kycType: parsed.data.kycType });
  }, 2000);

  return res.json({
    success: true,
    data: { status: 'PENDING', message: 'KYC submitted. Verification in progress (mock mode).' },
  });
});

// ── PATCH /api/riders/status ─── online/offline toggle ────────
router.patch('/status', guard, async (req: AuthRequest, res: Response) => {
  const { isOnline, lat, lng } = req.body;
  const profile = await prisma.riderProfile.update({
    where: { userId: req.user!.userId },
    data:  { isOnline, lastLatitude: lat, lastLongitude: lng, lastSeenAt: new Date() },
  });
  io.emit('rider:status', { riderId: profile.id, isOnline });
  return res.json({ success: true, data: { isOnline: profile.isOnline } });
});

// ── GET /api/riders/orders/available ─────────────────────────
router.get('/orders/available', guard, async (req: AuthRequest, res: Response) => {
  const profile = await prisma.riderProfile.findUnique({
    where:   { userId: req.user!.userId },
    include: { wallet: true },
  });
  if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

  // Wallet balance limit check
  const balance = profile.wallet?.balanceNgn ?? 0;
  if (balance <= WALLET_BLOCK_LIMIT) {
    return res.status(403).json({
      success: false,
      error:   'WALLET_BLOCKED',
      message: `Your wallet balance (₦${balance.toLocaleString()}) is at or below ₦${WALLET_BLOCK_LIMIT.toLocaleString()}. Please clear your outstanding balance to continue receiving orders.`,
      balance,
      limit:   WALLET_BLOCK_LIMIT,
    });
  }

  const orders = await prisma.delivery.findMany({
    where:   { status: 'PENDING', vehicleTier: profile.vehicleTier },
    include: {
      customer: { select: { name: true, phone: true } },
      stops:    true,
    },
    orderBy: { createdAt: 'asc' },
    take:    10,
  });
  return res.json({ success: true, data: orders });
});

// ── POST /api/riders/orders/:id/accept ────────────────────────
router.post('/orders/:id/accept', guard, async (req: AuthRequest, res: Response) => {
  const profile = await prisma.riderProfile.findUnique({
    where:   { userId: req.user!.userId },
    include: { wallet: true },
  });
  if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

  // Re-check wallet balance limit before accepting
  const balance = profile.wallet?.balanceNgn ?? 0;
  if (balance <= WALLET_BLOCK_LIMIT) {
    return res.status(403).json({
      success: false,
      error:   'WALLET_BLOCKED',
      message: `Balance (₦${balance.toLocaleString()}) is at or below ₦${WALLET_BLOCK_LIMIT.toLocaleString()}. Top up to continue.`,
      balance,
    });
  }

  const delivery = await prisma.delivery.findUnique({ where: { id: req.params.id } });
  if (!delivery) return res.status(404).json({ success: false, error: 'Order not found' });
  if (delivery.status !== 'PENDING') return res.status(409).json({ success: false, error: 'Order already taken' });

  const updated = await prisma.delivery.update({
    where: { id: req.params.id },
    data:  { status: 'ACCEPTED', riderId: req.user!.userId, acceptedAt: new Date() },
  });

  io.to(`delivery:${updated.id}`).emit('delivery:accepted', { deliveryId: updated.id, riderId: profile.id });
  io.to(`customer:${updated.customerId}`).emit('delivery:accepted', { deliveryId: updated.id });
  return res.json({ success: true, data: updated });
});

// ── POST /api/riders/orders/:id/decline ───────────────────────
router.post('/orders/:id/decline', guard, async (_req: AuthRequest, res: Response) => {
  return res.json({ success: true });
});

// ── POST /api/riders/orders/:id/arrived ───────────────────────
router.post('/orders/:id/arrived', guard, async (req: AuthRequest, res: Response) => {
  const updated = await prisma.delivery.update({
    where: { id: req.params.id, riderId: req.user!.userId },
    data:  { status: 'ARRIVED_PICKUP', arrivedPickupAt: new Date() },
  });
  io.to(`customer:${updated.customerId}`).emit('delivery:status', { deliveryId: updated.id, status: 'ARRIVED_PICKUP' });
  return res.json({ success: true, data: updated });
});

// ── POST /api/riders/orders/:id/pickup ────────────────────────
router.post('/orders/:id/pickup', guard, async (req: AuthRequest, res: Response) => {
  const updated = await prisma.delivery.update({
    where: { id: req.params.id, riderId: req.user!.userId },
    data:  { status: 'IN_TRANSIT', pickedUpAt: new Date() },
  });
  io.to(`customer:${updated.customerId}`).emit('delivery:status', { deliveryId: updated.id, status: 'IN_TRANSIT' });
  return res.json({ success: true, data: updated });
});

// ── POST /api/riders/orders/:id/complete ──────────────────────
// 1) Mark delivered
// 2) Deduct 8% commission from rider wallet
// 3) Distribute platform fee (8% of total fare) to founder accounts (25% each)
router.post('/orders/:id/complete', guard, async (req: AuthRequest, res: Response) => {
  const delivery = await prisma.delivery.findUnique({ where: { id: req.params.id } });
  if (!delivery) return res.status(404).json({ success: false, error: 'Delivery not found' });

  const profile = await prisma.riderProfile.findUnique({ where: { userId: req.user!.userId } });
  if (!profile) return res.status(404).json({ success: false, error: 'Rider profile not found' });

  // Ensure wallet exists
  let wallet = await prisma.wallet.findUnique({ where: { riderId: profile.id } });
  if (!wallet) wallet = await prisma.wallet.create({ data: { riderId: profile.id } });

  // Commission = 8% of total fare (already tracked as platformFeeNgn)
  const commissionNgn    = delivery.platformFeeNgn;
  const newWalletBalance = wallet.balanceNgn - commissionNgn;

  // Fetch active founder accounts
  const founders = await prisma.founderAccount.findMany({ where: { isActive: true } });

  await prisma.$transaction(async (tx) => {
    // 1. Mark delivery complete
    await tx.delivery.update({
      where: { id: req.params.id },
      data:  { status: 'DELIVERED', deliveredAt: new Date(), paymentStatus: 'PAID' },
    });

    // 2. Deduct commission from rider wallet
    await tx.wallet.update({
      where: { id: wallet!.id },
      data:  {
        balanceNgn:          newWalletBalance,
        lifetimeEarningsNgn: { increment: delivery.riderEarningsNgn },
      },
    });
    await tx.walletTransaction.create({
      data: {
        walletId:    wallet!.id,
        type:        'COMMISSION',
        amountNgn:   -commissionNgn,
        balanceAfter: newWalletBalance,
        description:  `8% platform commission — Delivery #${delivery.id.slice(-6)}`,
        deliveryId:   delivery.id,
      },
    });

    // 3. Credit rider earnings record (separate from commission deduction)
    await tx.walletTransaction.create({
      data: {
        walletId:    wallet!.id,
        type:        'CREDIT',
        amountNgn:   delivery.riderEarningsNgn,
        balanceAfter: newWalletBalance + delivery.riderEarningsNgn,
        description:  `Earnings — Delivery #${delivery.id.slice(-6)}`,
        deliveryId:   delivery.id,
      },
    });

    // 4. Distribute profit to founders (25% each of the 8% commission)
    if (founders.length > 0) {
      for (const founder of founders) {
        const shareNgn      = (commissionNgn * founder.sharePercent) / 100;
        const founderBalance = founder.balanceNgn + shareNgn;
        await tx.founderAccount.update({
          where: { id: founder.id },
          data:  { balanceNgn: founderBalance },
        });
        await tx.profitTransaction.create({
          data: {
            founderAccountId: founder.id,
            deliveryId:       delivery.id,
            commissionNgn,
            shareNgn,
            balanceAfter:     founderBalance,
          },
        });
      }
    }

    // 5. Increment rider deliveries count
    await tx.riderProfile.update({
      where: { id: profile!.id },
      data:  { totalDeliveries: { increment: 1 } },
    });
  });

  io.to(`customer:${delivery.customerId}`).emit('delivery:status', {
    deliveryId: delivery.id, status: 'DELIVERED',
  });
  return res.json({ success: true, data: { message: 'Delivery completed', commissionDeducted: commissionNgn } });
});

// ── POST /api/riders/orders/:id/cancel ────────────────────────
router.post('/orders/:id/cancel', guard, async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    reasonId: z.string().optional(),
    note:     z.string().max(300).optional(),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const updated = await prisma.delivery.update({
    where: { id: req.params.id, riderId: req.user!.userId },
    data: {
      status:               'CANCELLED',
      cancelledAt:          new Date(),
      riderId:              null,
      cancellationReasonId: parsed.data.reasonId,
      cancellationNote:     parsed.data.note,
    },
  });
  io.to(`customer:${updated.customerId}`).emit('delivery:status', { deliveryId: updated.id, status: 'CANCELLED' });
  return res.json({ success: true, data: updated });
});

// ── GET /api/riders/orders/active ─────────────────────────────
router.get('/orders/active', guard, async (req: AuthRequest, res: Response) => {
  const delivery = await prisma.delivery.findFirst({
    where:   { riderId: req.user!.userId, status: { in: ['ACCEPTED', 'ARRIVED_PICKUP', 'IN_TRANSIT'] } },
    include: {
      customer: { select: { name: true, phone: true } },
      messages: { orderBy: { createdAt: 'asc' } },
      photos:   true,
      stops:    { orderBy: { sortOrder: 'asc' } },
    },
  });
  return res.json({ success: true, data: delivery });
});

// ── GET /api/riders/orders/history ────────────────────────────
router.get('/orders/history', guard, async (req: AuthRequest, res: Response) => {
  const page = parseInt((req.query.page as string) ?? '1');
  const take = 20;
  const skip = (page - 1) * take;
  const [deliveries, total] = await Promise.all([
    prisma.delivery.findMany({
      where:   { riderId: req.user!.userId, status: { in: ['DELIVERED', 'CANCELLED', 'FAILED'] } },
      orderBy: { createdAt: 'desc' },
      skip, take,
    }),
    prisma.delivery.count({ where: { riderId: req.user!.userId, status: { in: ['DELIVERED', 'CANCELLED', 'FAILED'] } } }),
  ]);
  return res.json({ success: true, data: deliveries, total, page, totalPages: Math.ceil(total / take) });
});

// ── GET /api/riders/wallet ────────────────────────────────────
router.get('/wallet', guard, async (req: AuthRequest, res: Response) => {
  const profile = await prisma.riderProfile.findUnique({ where: { userId: req.user!.userId } });
  if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

  let wallet = await prisma.wallet.findUnique({
    where:   { riderId: profile.id },
    include: { transactions: { orderBy: { createdAt: 'desc' }, take: 30 } },
  });
  if (!wallet) {
    wallet = await prisma.wallet.create({
      data:    { riderId: profile.id },
      include: { transactions: true },
    } as any) as any;
  }
  return res.json({ success: true, data: wallet });
});

// ── POST /api/riders/wallet/topup ── Initialize Paystack ──────
router.post('/wallet/topup', guard, async (req: AuthRequest, res: Response) => {
  const Schema = z.object({ amountNgn: z.number().min(1000).max(1_000_000) });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const user    = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  const profile = await prisma.riderProfile.findUnique({ where: { userId: req.user!.userId } });
  if (!user || !profile) return res.status(404).json({ success: false, error: 'Not found' });

  let wallet = await prisma.wallet.findUnique({ where: { riderId: profile.id } });
  if (!wallet) wallet = await prisma.wallet.create({ data: { riderId: profile.id } });

  const reference = `RW-${wallet.id.slice(-8)}-${Date.now()}`;
  const result = await paystackInitialize({
    email:      user.email,
    amountKobo: Math.round(parsed.data.amountNgn * 100),
    reference,
    callbackUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/payment/verify?ref=${reference}&type=rider_wallet`,
    metadata: {
      type:       'RIDER_WALLET_TOPUP',
      walletId:   wallet.id,
      userId:     req.user!.userId,
      amountNgn:  parsed.data.amountNgn,
    },
  });

  return res.json({ success: true, data: result });
});

// ── GET /api/riders/wallet/topup/verify ───────────────────────
router.get('/wallet/topup/verify', guard, async (req: AuthRequest, res: Response) => {
  const { reference } = req.query;
  if (!reference) return res.status(400).json({ success: false, error: 'Reference required' });

  const txn = await paystackVerify(reference as string);
  if (txn.status !== 'success') return res.status(400).json({ success: false, error: 'Payment not successful' });

  const meta      = txn.metadata ?? {};
  const walletId  = meta.walletId as string;
  const amountNgn = (txn.amount ?? 0) / 100;

  if (!walletId) return res.status(400).json({ success: false, error: 'Invalid metadata' });

  // Idempotency check
  const existing = await prisma.walletTransaction.findFirst({ where: { paystackRef: reference as string } });
  if (existing) return res.json({ success: true, data: { alreadyProcessed: true } });

  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return res.status(404).json({ success: false, error: 'Wallet not found' });

  const newBalance = wallet.balanceNgn + amountNgn;
  await prisma.$transaction([
    prisma.wallet.update({
      where: { id: walletId },
      data:  { balanceNgn: newBalance },
    }),
    prisma.walletTransaction.create({
      data: {
        walletId,
        type:        'TOPUP',
        amountNgn,
        balanceAfter: newBalance,
        description:  'Wallet top-up via Paystack',
        paystackRef:  reference as string,
      },
    }),
  ]);

  io.to(`user:${req.user!.userId}`).emit('wallet:topup', { amountNgn, newBalance });
  return res.json({ success: true, data: { amountNgn, newBalance } });
});

// ── GET /api/riders/stats ─────────────────────────────────────
router.get('/stats', guard, async (req: AuthRequest, res: Response) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7); weekStart.setHours(0, 0, 0, 0);

  const [todayDeliveries, weekDeliveries, profile] = await Promise.all([
    prisma.delivery.count({ where: { riderId: req.user!.userId, status: 'DELIVERED', deliveredAt: { gte: today } } }),
    prisma.delivery.count({ where: { riderId: req.user!.userId, status: 'DELIVERED', deliveredAt: { gte: weekStart } } }),
    prisma.riderProfile.findUnique({ where: { userId: req.user!.userId }, include: { wallet: true } }),
  ]);

  return res.json({
    success: true,
    data: {
      todayDeliveries,
      weekDeliveries,
      rating:           profile?.rating ?? 5.0,
      walletBalance:    profile?.wallet?.balanceNgn ?? 0,
      lifetimeEarnings: profile?.wallet?.lifetimeEarningsNgn ?? 0,
      kycStatus:        profile?.kycStatus ?? 'PENDING',
    },
  });
});

// ── POST /api/riders/location ─── GPS update ──────────────────
router.post('/location', guard, async (req: AuthRequest, res: Response) => {
  const { lat, lng, deliveryId } = req.body;
  await prisma.riderProfile.update({
    where: { userId: req.user!.userId },
    data:  { lastLatitude: lat, lastLongitude: lng, lastSeenAt: new Date() },
  });
  if (deliveryId) {
    io.to(`delivery:${deliveryId}`).emit('rider:location', { lat, lng, deliveryId, ts: Date.now() });
  }
  return res.json({ success: true });
});

// ── GET /api/riders/cancellation-reasons ─────────────────────
router.get('/cancellation-reasons', guard, async (_req: AuthRequest, res: Response) => {
  const reasons = await prisma.cancellationReason.findMany({
    where:   { forRole: 'RIDER', isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  return res.json({ success: true, data: reasons });
});

export { router as riderRouter };

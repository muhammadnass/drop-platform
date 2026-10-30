// ============================================================
// DROP LOGISTICS — Customer Routes
// ============================================================

import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, requireRole } from '../middleware/auth.middleware';
import { prisma } from '../services/prisma';
import { paystackInitialize, paystackVerify } from '../services/paystack.service';

const router = Router();

// All routes require CUSTOMER role
router.use(requireRole('CUSTOMER'));

// ── GET /api/customers/wallet ──────────────────────────────────
router.get('/wallet', async (req: AuthRequest, res: Response) => {
  const profile = await prisma.customerProfile.findUnique({
    where:   { userId: req.user!.userId },
    include: { wallet: { include: { transactions: { orderBy: { createdAt: 'desc' }, take: 30 } } } },
  });
  if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

  // Create wallet if it doesn't exist
  let wallet = profile.wallet;
  if (!wallet) {
    wallet = await prisma.customerWallet.create({
      data:    { customerId: profile.id },
      include: { transactions: true },
    } as any) as any;
  }

  return res.json({ success: true, data: wallet });
});

// ── POST /api/customers/wallet/topup ──────────────────────────
// Initialize Paystack payment to fund customer wallet
router.post('/wallet/topup', async (req: AuthRequest, res: Response) => {
  const Schema = z.object({ amountNgn: z.number().min(100).max(1_000_000) });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const user    = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  const profile = await prisma.customerProfile.findUnique({ where: { userId: req.user!.userId } });
  if (!user || !profile) return res.status(404).json({ success: false, error: 'Not found' });

  // Ensure wallet exists
  let wallet = await prisma.customerWallet.findUnique({ where: { customerId: profile.id } });
  if (!wallet) wallet = await prisma.customerWallet.create({ data: { customerId: profile.id } });

  const reference = `CW-${wallet.id.slice(-8)}-${Date.now()}`;
  const result    = await paystackInitialize({
    email:       user.email,
    amountKobo:  Math.round(parsed.data.amountNgn * 100),
    reference,
    callbackUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/payment/verify?ref=${reference}&type=customer_wallet`,
    metadata: {
      type:       'CUSTOMER_WALLET_TOPUP',
      walletId:   wallet.id,
      userId:     req.user!.userId,
      amountNgn:  parsed.data.amountNgn,
    },
  });

  return res.json({ success: true, data: result });
});

// ── GET /api/customers/wallet/topup/verify ────────────────────
router.get('/wallet/topup/verify', async (req: AuthRequest, res: Response) => {
  const { reference } = req.query;
  if (!reference) return res.status(400).json({ success: false, error: 'Reference required' });

  const txn = await paystackVerify(reference as string);
  if (txn.status !== 'success') return res.status(400).json({ success: false, error: 'Payment not successful' });

  const meta      = txn.metadata ?? {};
  const walletId  = meta.walletId as string;
  const amountNgn = (txn.amount ?? 0) / 100;

  if (!walletId) return res.status(400).json({ success: false, error: 'Invalid metadata' });

  // Idempotency — check if this reference was already used
  const existing = await prisma.customerWalletTransaction.findFirst({ where: { paystackRef: reference as string } });
  if (existing) return res.json({ success: true, data: { alreadyProcessed: true } });

  const wallet  = await prisma.customerWallet.findUnique({ where: { id: walletId } });
  if (!wallet) return res.status(404).json({ success: false, error: 'Wallet not found' });

  const newBalance = wallet.balanceNgn + amountNgn;
  await prisma.$transaction([
    prisma.customerWallet.update({
      where: { id: walletId },
      data:  { balanceNgn: newBalance, lifetimeTopupNgn: { increment: amountNgn } },
    }),
    prisma.customerWalletTransaction.create({
      data: {
        walletId,
        type:        'TOPUP',
        amountNgn,
        balanceAfter: newBalance,
        description:  `Wallet funded via Paystack`,
        paystackRef:  reference as string,
      },
    }),
  ]);

  return res.json({ success: true, data: { amountNgn, newBalance } });
});

// ── GET /api/customers/profile ────────────────────────────────
router.get('/profile', async (req: AuthRequest, res: Response) => {
  const profile = await prisma.customerProfile.findUnique({
    where: { userId: req.user!.userId },
  });
  return res.json({ success: true, data: profile });
});

export { router as customerRouter };

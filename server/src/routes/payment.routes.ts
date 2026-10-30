// ============================================================
// DROP LOGISTICS — Payment Routes (Paystack)
// ============================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, authMiddleware, requireRole } from '../middleware/auth.middleware';
import { prisma } from '../services/prisma';
import {
  paystackInitialize,
  paystackVerify,
  paystackCreatePlan,
  validateWebhookSignature,
  usdToNgn,
} from '../services/paystack.service';

const router = Router();

// ── POST /api/payments/delivery/initialize ────────────────────
// Customer pays for a delivery before rider is dispatched
router.post('/delivery/initialize', authMiddleware, requireRole('CUSTOMER', 'BUSINESS_OWNER'), async (req: AuthRequest, res: Response) => {
  const Schema = z.object({ deliveryId: z.string() });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const delivery = await prisma.delivery.findUnique({ where: { id: parsed.data.deliveryId } });
  if (!delivery) return res.status(404).json({ success: false, error: 'Delivery not found' });
  if (delivery.paymentStatus === 'PAID') {
    return res.status(409).json({ success: false, error: 'Already paid' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const reference = `DEL-${delivery.id.slice(-8)}-${Date.now()}`;
  const result = await paystackInitialize({
    email:       user.email,
    amountKobo:  Math.round(delivery.totalFareNgn * 100),
    reference,
    callbackUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/payment/verify?ref=${reference}&type=delivery`,
    metadata:    { deliveryId: delivery.id, userId: req.user!.userId, type: 'DELIVERY' },
  });

  return res.json({ success: true, data: result });
});

// ── GET /api/payments/delivery/verify ────────────────────────
router.get('/delivery/verify', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { reference } = req.query;
  if (!reference) return res.status(400).json({ success: false, error: 'Reference required' });

  const txn = await paystackVerify(reference as string);
  if (txn.status !== 'success') {
    return res.status(400).json({ success: false, error: 'Payment not successful' });
  }

  const deliveryId = txn.metadata?.deliveryId as string;
  if (deliveryId) {
    await prisma.delivery.update({
      where: { id: deliveryId },
      data:  { paymentStatus: 'PAID' },
    });
  }

  return res.json({ success: true, data: { status: txn.status, reference: txn.reference, amount: txn.amount / 100 } });
});

// ── POST /api/payments/subscription/initialize ────────────────
router.post('/subscription/initialize', authMiddleware, requireRole('BUSINESS_OWNER'), async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  const biz  = await prisma.business.findUnique({ where: { ownerId: req.user!.userId } });
  if (!user || !biz) return res.status(404).json({ success: false, error: 'Business not found' });

  // Create or fetch Paystack plan ($20/month)
  const plan = await paystackCreatePlan({
    name:        'Drop Business Monthly',
    amountKobo:  usdToNgn(20), // $20 in kobo
    interval:    'monthly',
    description: 'Drop Logistics Business Subscription — $20/month + 8% per delivery',
  });

  const reference = `SUB-${biz.id.slice(-8)}-${Date.now()}`;
  const result = await paystackInitialize({
    email:       user.email,
    amountKobo:  usdToNgn(20),
    reference,
    plan:        plan.plan_code,
    callbackUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/payment/verify?ref=${reference}&type=subscription`,
    metadata:    { businessId: biz.id, userId: req.user!.userId, type: 'SUBSCRIPTION' },
  });

  return res.json({ success: true, data: result });
});

// ── GET /api/payments/subscription/verify ────────────────────
router.get('/subscription/verify', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { reference } = req.query;
  if (!reference) return res.status(400).json({ success: false, error: 'Reference required' });

  const txn = await paystackVerify(reference as string);
  if (txn.status !== 'success') {
    return res.status(400).json({ success: false, error: 'Payment not successful' });
  }

  const businessId = txn.metadata?.businessId as string;
  if (businessId) {
    const now   = new Date();
    const end   = new Date(now);
    end.setMonth(end.getMonth() + 1);

    await prisma.subscription.upsert({
      where:  { businessId },
      update: {
        status:             'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd:   end,
      },
      create: {
        businessId,
        status:             'ACTIVE',
        monthlyFeeUsd:      20,
        currentPeriodStart: now,
        currentPeriodEnd:   end,
      },
    });
  }

  return res.json({ success: true, data: { status: 'active', message: 'Subscription activated' } });
});

// ── POST /api/payments/webhook ── Paystack webhook ────────────
// Raw body needed for signature verification — must be before express.json
router.post('/webhook', express_raw(), async (req: Request, res: Response) => {
  const sig  = req.headers['x-paystack-signature'] as string;
  const body = (req as any).rawBody as string;

  if (!validateWebhookSignature(body, sig)) {
    return res.status(400).json({ success: false, error: 'Invalid signature' });
  }

  const event = JSON.parse(body);

  if (event.event === 'charge.success') {
    const meta = event.data?.metadata ?? {};

    if (meta.type === 'DELIVERY') {
      await prisma.delivery.updateMany({
        where: { id: meta.deliveryId },
        data:  { paymentStatus: 'PAID' },
      }).catch(() => {});
    }

    if (meta.type === 'SUBSCRIPTION') {
      const biz = meta.businessId;
      if (biz) {
        const now = new Date();
        const end = new Date(now); end.setMonth(end.getMonth() + 1);
        await prisma.subscription.upsert({
          where:  { businessId: biz },
          update: { status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: end },
          create: { businessId: biz, status: 'ACTIVE', monthlyFeeUsd: 20, currentPeriodStart: now, currentPeriodEnd: end },
        }).catch(() => {});
      }
    }
  }

  if (event.event === 'subscription.disable') {
    const customerId = event.data?.customer?.customer_code;
    if (customerId) {
      // Mark subscription past_due — TODO: match by stripeCustomerId equivalent
    }
  }

  return res.status(200).json({ received: true });
});

// Raw body middleware for webhook
function express_raw() {
  return (req: any, res: any, next: any) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => { data += chunk; });
    req.on('end', () => { req.rawBody = data; next(); });
  };
}

export { router as paymentRouter };

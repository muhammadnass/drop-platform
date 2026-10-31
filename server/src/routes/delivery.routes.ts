// ============================================================
// DROP LOGISTICS — Delivery Routes
// All routes require authMiddleware (applied in index.ts)
// ============================================================

import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, requireRole } from '../middleware/auth.middleware';
import { prisma } from '../services/prisma';
import { calculateFare } from '../services/fare.service';
import { io } from '../index';

const router = Router();

// ── POST /api/deliveries ──────────────────────────────────────
// Supports single-stop (legacy) AND multi-stop deliveries.
// Multi-stop: pass `stops` array with additional destinations.
// Item photos: pass `photoUrls` array.
router.post('/', requireRole('CUSTOMER', 'BUSINESS_OWNER'), async (req: AuthRequest, res: Response) => {
  const StopSchema = z.object({
    address:       z.string().min(3),
    lat:           z.number(),
    lng:           z.number(),
    recipientName: z.string().max(100).optional(),
    recipientPhone: z.string().max(20).optional(),
    notes:         z.string().max(300).optional(),
    distanceKm:    z.number().min(0.1),
  });

  const Schema = z.object({
    pickupAddress:  z.string().min(3),
    pickupLat:      z.number(),
    pickupLng:      z.number(),
    dropoffAddress: z.string().min(3),   // primary/first stop address
    dropoffLat:     z.number(),
    dropoffLng:     z.number(),
    distanceKm:     z.number().min(0.1), // total distance (all legs)
    vehicleTier:    z.enum(['DROP_MINI', 'DROP_TRI', 'DROP_FLEX', 'DROP_MAX']),
    itemDescription: z.string().max(500).optional(),
    recipientName:  z.string().max(100).optional(),
    recipientPhone: z.string().max(20).optional(),
    notes:          z.string().max(500).optional(),
    paymentMethod:  z.enum(['CASH', 'WALLET']).default('CASH'),
    // Multi-stop: additional stops beyond the first dropoff
    stops:          z.array(StopSchema).max(5).optional(),
    // Item photos (URLs from /api/uploads/image)
    photoUrls:      z.array(z.string().url()).max(5).optional(),
  });

  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const d = parsed.data;

  // Calculate fare for each leg
  const firstLegFare = await calculateFare(d.distanceKm, d.vehicleTier as any);

  // Calculate total fare across all stops
  let totalFare = firstLegFare;
  const stopFares: number[] = [];

  if (d.stops && d.stops.length > 0) {
    for (const stop of d.stops) {
      const legFare = await calculateFare(stop.distanceKm, d.vehicleTier as any);
      stopFares.push(legFare.totalFareNgn);
      // Merge fares
      totalFare = {
        ...totalFare,
        totalFareNgn:    totalFare.totalFareNgn + legFare.totalFareNgn,
        platformFeeNgn:  totalFare.platformFeeNgn + legFare.platformFeeNgn,
        riderEarningsNgn: totalFare.riderEarningsNgn + legFare.riderEarningsNgn,
        baseFareNgn:     totalFare.baseFareNgn,
        ratePerKmNgn:    totalFare.ratePerKmNgn,
        tierMultiplier:  totalFare.tierMultiplier,
      };
    }
  }

  // If payment method is WALLET, check customer wallet balance
  if (d.paymentMethod === 'WALLET') {
    const customerProfile = await prisma.customerProfile.findUnique({
      where:   { userId: req.user!.userId },
      include: { wallet: true },
    });
    const walletBalance = customerProfile?.wallet?.balanceNgn ?? 0;
    if (walletBalance < totalFare.totalFareNgn) {
      return res.status(402).json({
        success: false,
        error:   'INSUFFICIENT_WALLET_BALANCE',
        message: `Wallet balance ₦${walletBalance.toLocaleString()} is less than the fare ₦${totalFare.totalFareNgn.toLocaleString()}`,
        balance: walletBalance,
        required: totalFare.totalFareNgn,
      });
    }
  }

  // Create delivery + stops + photos in one transaction
  const delivery = await prisma.$transaction(async (tx) => {
    const newDelivery = await tx.delivery.create({
      data: {
        customerId:       req.user!.userId,
        vehicleTier:      d.vehicleTier as any,
        pickupAddress:    d.pickupAddress,
        pickupLat:        d.pickupLat,
        pickupLng:        d.pickupLng,
        dropoffAddress:   d.dropoffAddress,
        dropoffLat:       d.dropoffLat,
        dropoffLng:       d.dropoffLng,
        distanceKm:       d.distanceKm,
        baseFareNgn:      totalFare.baseFareNgn,
        ratePerKmNgn:     totalFare.ratePerKmNgn,
        tierMultiplier:   totalFare.tierMultiplier,
        totalFareNgn:     totalFare.totalFareNgn,
        platformFeeNgn:   totalFare.platformFeeNgn,
        riderEarningsNgn: totalFare.riderEarningsNgn,
        itemDescription:  d.itemDescription,
        recipientName:    d.recipientName,
        recipientPhone:   d.recipientPhone,
        notes:            d.notes,
        paymentMethod:    d.paymentMethod,
        paymentStatus:    d.paymentMethod === 'CASH' ? 'PENDING' : 'PAID',
      },
    });

    // Create additional stops
    if (d.stops && d.stops.length > 0) {
      await tx.deliveryStop.createMany({
        data: d.stops.map((stop, i) => ({
          deliveryId:    newDelivery.id,
          sortOrder:     i + 1,
          address:       stop.address,
          lat:           stop.lat,
          lng:           stop.lng,
          recipientName: stop.recipientName,
          recipientPhone: stop.recipientPhone,
          notes:         stop.notes,
          distanceKm:    stop.distanceKm,
          fareNgn:       stopFares[i] ?? 0,
        })),
      });
    }

    // Attach item photos
    if (d.photoUrls && d.photoUrls.length > 0) {
      await tx.deliveryPhoto.createMany({
        data: d.photoUrls.map((url) => ({
          deliveryId: newDelivery.id,
          url,
          uploadedBy: req.user!.userId,
        })),
      });
    }

    // Deduct from customer wallet if paying by wallet
    if (d.paymentMethod === 'WALLET') {
      const profile = await tx.customerProfile.findUnique({
        where:   { userId: req.user!.userId },
        include: { wallet: true },
      });
      if (profile?.wallet) {
        const wallet    = await tx.customerWallet.findUnique({ where: { customerId: profile.id } });
        if (wallet) {
          const newBal = wallet.balanceNgn - totalFare.totalFareNgn;
          await tx.customerWallet.update({ where: { id: wallet.id }, data: { balanceNgn: newBal } });
          await tx.customerWalletTransaction.create({
            data: {
              walletId:    wallet.id,
              type:        'DEBIT',
              amountNgn:   -totalFare.totalFareNgn,
              balanceAfter: newBal,
              description:  `Delivery payment #${newDelivery.id.slice(-6)}`,
              deliveryId:   newDelivery.id,
            },
          });
        }
      }
    }

    return newDelivery;
  });

  // Broadcast new order to matching riders
  io.emit('order:new', {
    id:             delivery.id,
    vehicleTier:    delivery.vehicleTier,
    pickupAddress:  delivery.pickupAddress,
    dropoffAddress: delivery.dropoffAddress,
    distanceKm:     delivery.distanceKm,
    totalFareNgn:   delivery.totalFareNgn,
    riderEarningsNgn: delivery.riderEarningsNgn,
  });

  return res.status(201).json({ success: true, data: delivery });
});

// ── GET /api/deliveries ───────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  const page = parseInt((req.query.page as string) ?? '1');
  const take = 20;
  const skip = (page - 1) * take;

  const where: any = {};
  if (req.user?.role === 'CUSTOMER')       where.customerId = req.user.userId;
  else if (req.user?.role === 'RIDER')     where.riderId    = req.user.userId;
  else if (req.user?.role === 'BUSINESS_OWNER') where.businessId = req.user.userId;

  const [deliveries, total] = await Promise.all([
    prisma.delivery.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.delivery.count({ where }),
  ]);
  return res.json({ success: true, data: deliveries, total, page, totalPages: Math.ceil(total / take) });
});

// ── GET /api/deliveries/customer/active ──────────────────────
router.get('/customer/active', requireRole('CUSTOMER'), async (req: AuthRequest, res: Response) => {
  const delivery = await prisma.delivery.findFirst({
    where: {
      customerId: req.user!.userId,
      status:     { in: ['PENDING', 'ACCEPTED', 'ARRIVED_PICKUP', 'IN_TRANSIT'] },
    },
    include: {
      rider:    {
        select: {
          name: true, phone: true,
          riderProfile: {
            select: {
              vehicleTier: true, vehicleType: true, vehiclePlate: true,
              vehicleColor: true, vehicleModel: true,
              profilePhotoUrl: true, vehiclePlatePhotoUrl: true,
              lastLatitude: true, lastLongitude: true,
              rating: true,
            },
          },
        },
      },
      messages: { orderBy: { createdAt: 'asc' }, take: 50 },
      photos:   true,
      stops:    { orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ success: true, data: delivery });
});

// ── GET /api/deliveries/:id ───────────────────────────────────
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const delivery = await prisma.delivery.findUnique({
    where:   { id: req.params.id },
    include: {
      rider:    { select: { name: true, phone: true, riderProfile: { select: { profilePhotoUrl: true, vehiclePlatePhotoUrl: true, vehicleTier: true, vehiclePlate: true, vehicleColor: true, vehicleModel: true, rating: true } } } },
      messages: { orderBy: { createdAt: 'asc' } },
      calls:    { orderBy: { createdAt: 'desc' } },
      photos:   true,
      stops:    { orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!delivery) return res.status(404).json({ success: false, error: 'Not found' });
  return res.json({ success: true, data: delivery });
});

// ── POST /api/deliveries/:id/messages ─ send text or voice note
router.post('/:id/messages', async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    content:      z.string().max(2000).optional().default(''),
    voiceNoteUrl: z.string().url().optional(),
    durationSecs: z.number().int().min(0).optional(),
    type:         z.enum(['TEXT', 'VOICE_NOTE']).optional().default('TEXT'),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const messageType = parsed.data.voiceNoteUrl ? 'VOICE_NOTE' : 'TEXT';
  const message = await prisma.message.create({
    data: {
      deliveryId:   req.params.id,
      senderId:     req.user!.userId,
      type:         messageType as any,
      content:      parsed.data.content,
      voiceNoteUrl: parsed.data.voiceNoteUrl,
      durationSecs: parsed.data.durationSecs,
    },
    include: { sender: { select: { name: true, role: true } } },
  });

  io.to(`delivery:${req.params.id}`).emit('message:new', message);
  return res.status(201).json({ success: true, data: message });
});

// ── POST /api/deliveries/:id/cancel ── Customer cancel ────────
router.post('/:id/cancel', requireRole('CUSTOMER'), async (req: AuthRequest, res: Response) => {
  const Schema = z.object({ reason: z.string().optional(), note: z.string().max(300).optional() });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const delivery = await prisma.delivery.findUnique({ where: { id: req.params.id } });
  if (!delivery) return res.status(404).json({ success: false, error: 'Not found' });
  if (!['PENDING', 'ACCEPTED'].includes(delivery.status)) {
    return res.status(409).json({ success: false, error: 'Cannot cancel at this stage' });
  }

  const updated = await prisma.delivery.update({
    where: { id: req.params.id, customerId: req.user!.userId },
    data:  { status: 'CANCELLED', cancelledAt: new Date(), cancellationNote: parsed.data.note },
  });

  // Refund wallet if paid by wallet
  if (delivery.paymentMethod === 'WALLET') {
    const profile = await prisma.customerProfile.findUnique({ where: { userId: req.user!.userId } });
    if (profile) {
      const wallet = await prisma.customerWallet.findUnique({ where: { customerId: profile.id } });
      if (wallet) {
        const newBal = wallet.balanceNgn + delivery.totalFareNgn;
        await prisma.customerWallet.update({ where: { id: wallet.id }, data: { balanceNgn: newBal } });
        await prisma.customerWalletTransaction.create({
          data: {
            walletId:    wallet.id,
            type:        'REVERSAL',
            amountNgn:   delivery.totalFareNgn,
            balanceAfter: newBal,
            description:  `Refund — cancelled Delivery #${delivery.id.slice(-6)}`,
            deliveryId:   delivery.id,
          },
        });
      }
    }
  }

  if (delivery.riderId) {
    io.to(`user:${delivery.riderId}`).emit('delivery:status', { deliveryId: updated.id, status: 'CANCELLED' });
  }
  return res.json({ success: true, data: updated });
});

// ── POST /api/deliveries/:id/calls ── Initiate WebRTC call ────
router.post('/:id/calls', async (req: AuthRequest, res: Response) => {
  const Schema = z.object({ receiverId: z.string() });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const call = await prisma.call.create({
    data: {
      deliveryId: req.params.id,
      callerId:   req.user!.userId,
      receiverId: parsed.data.receiverId,
      status:     'INITIATED',
    },
  });

  // Signal the receiver via socket
  io.to(`user:${parsed.data.receiverId}`).emit('call:incoming', {
    callId:     call.id,
    deliveryId: req.params.id,
    callerId:   req.user!.userId,
  });

  return res.status(201).json({ success: true, data: call });
});

// ── PATCH /api/deliveries/:id/calls/:callId ── Update call status
router.patch('/:id/calls/:callId', async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    status:      z.enum(['RINGING', 'ACTIVE', 'ENDED', 'MISSED']),
    durationSecs: z.number().int().optional(),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const updateData: any = { status: parsed.data.status };
  if (parsed.data.status === 'ACTIVE')  updateData.startedAt = new Date();
  if (parsed.data.status === 'ENDED')   { updateData.endedAt = new Date(); updateData.durationSecs = parsed.data.durationSecs; }

  const call = await prisma.call.update({ where: { id: req.params.callId }, data: updateData });
  io.to(`delivery:${req.params.id}`).emit('call:status', { callId: call.id, status: call.status });
  return res.json({ success: true, data: call });
});

export { router as deliveryRouter };

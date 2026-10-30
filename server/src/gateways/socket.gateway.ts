// ============================================================
// DROP LOGISTICS — Socket.io Gateway
// Real-time: Rider GPS tracking, order dispatch, status updates
// ============================================================

import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Socket Room Naming Conventions ───────────────────────────
// delivery:{id}  → customer + rider for a specific delivery
// rider:{id}     → messages targeted at a specific rider
// admin          → super-admin room for system-wide events
// business:{id}  → business owner fleet events

// ── Event Names ───────────────────────────────────────────────
export const SOCKET_EVENTS = {
  // Client → Server
  RIDER_LOCATION_UPDATE: 'rider:location',
  RIDER_ONLINE:          'rider:online',
  RIDER_OFFLINE:         'rider:offline',
  ACCEPT_DELIVERY:       'delivery:accept',
  UPDATE_STATUS:         'delivery:status',
  JOIN_DELIVERY_ROOM:    'delivery:join',
  LEAVE_DELIVERY_ROOM:   'delivery:leave',

  // Server → Client
  NEW_ORDER:             'order:new',
  RIDER_LOCATION_BROADCAST: 'rider:location:broadcast',
  DELIVERY_STATUS_CHANGED:  'delivery:status:changed',
  ORDER_ACCEPTED:        'order:accepted',
  ORDER_CANCELLED:       'order:cancelled',
  SYSTEM_MESSAGE:        'system:message',
} as const;

interface TokenPayload {
  userId: string;
  role: string;
  riderId?: string;
}

interface RiderLocationData {
  deliveryId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
}

interface StatusUpdateData {
  deliveryId: string;
  status: string;
}

// ── Connected Riders Map (in-memory; use Redis for production) ─
const onlineRiders = new Map<string, { socketId: string; lat?: number; lng?: number }>();

export function registerSocketGateway(io: Server): void {

  // ── Authentication Middleware ──────────────────────────────
  io.use(async (socket: Socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET!
      ) as TokenPayload;

      socket.data.userId = payload.userId;
      socket.data.role   = payload.role;
      socket.data.riderId = payload.riderId;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  // ── Connection Handler ────────────────────────────────────
  io.on('connection', async (socket: Socket) => {
    const { userId, role, riderId } = socket.data;
    console.log(`[Socket] Connected: ${userId} (${role}) → ${socket.id}`);

    // Auto-join role-based rooms
    socket.join(`user:${userId}`);
    if (role === 'SUPER_ADMIN')    socket.join('admin');
    if (role === 'BUSINESS_OWNER') {
      const biz = await prisma.business.findUnique({ where: { ownerId: userId } });
      if (biz) socket.join(`business:${biz.id}`);
    }
    if (role === 'RIDER' && riderId) {
      socket.join(`rider:${riderId}`);
    }

    // ── Rider: Comes Online ─────────────────────────────────
    socket.on(SOCKET_EVENTS.RIDER_ONLINE, async () => {
      if (role !== 'RIDER' || !riderId) return;

      onlineRiders.set(riderId, { socketId: socket.id });

      await prisma.riderProfile.update({
        where: { id: riderId },
        data:  { isOnline: true, lastSeenAt: new Date() },
      });

      // Broadcast to business owner
      const rider = await prisma.riderProfile.findUnique({
        where: { id: riderId },
        select: { businessId: true },
      });
      if (rider?.businessId) {
        io.to(`business:${rider.businessId}`).emit(SOCKET_EVENTS.SYSTEM_MESSAGE, {
          type: 'RIDER_ONLINE',
          riderId,
          message: 'A rider in your fleet is now online.',
        });
      }

      console.log(`[Socket] Rider ${riderId} is ONLINE`);
    });

    // ── Rider: Goes Offline ──────────────────────────────────
    socket.on(SOCKET_EVENTS.RIDER_OFFLINE, async () => {
      if (role !== 'RIDER' || !riderId) return;
      await setRiderOffline(riderId);
    });

    // ── Rider: GPS Location Update ───────────────────────────
    // This is the core real-time tracking event.
    socket.on(
      SOCKET_EVENTS.RIDER_LOCATION_UPDATE,
      async (data: RiderLocationData) => {
        if (role !== 'RIDER' || !riderId) return;

        const { deliveryId, lat, lng, heading, speed } = data;

        // Validate coordinates
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

        // Update in-memory store
        onlineRiders.set(riderId, { socketId: socket.id, lat, lng });

        // Persist latest location (non-blocking)
        prisma.riderProfile.update({
          where: { id: riderId },
          data:  { lastLatitude: lat, lastLongitude: lng, lastSeenAt: new Date() },
        }).catch(console.error);

        // Log to dispatch (throttled in production)
        prisma.dispatchLog.create({
          data: {
            deliveryId,
            event: 'LOCATION_UPDATE',
            payload: { lat, lng, heading, speed, riderId, ts: Date.now() },
          },
        }).catch(console.error);

        // Broadcast to customer tracking this delivery
        const broadcastPayload = {
          riderId,
          deliveryId,
          lat,
          lng,
          heading,
          speed,
          timestamp: Date.now(),
        };

        io.to(`delivery:${deliveryId}`).emit(
          SOCKET_EVENTS.RIDER_LOCATION_BROADCAST,
          broadcastPayload
        );
      }
    );

    // ── Customer / Rider: Join Delivery Room ─────────────────
    socket.on(SOCKET_EVENTS.JOIN_DELIVERY_ROOM, (deliveryId: string) => {
      socket.join(`delivery:${deliveryId}`);
      console.log(`[Socket] ${userId} joined delivery room: ${deliveryId}`);
    });

    socket.on(SOCKET_EVENTS.LEAVE_DELIVERY_ROOM, (deliveryId: string) => {
      socket.leave(`delivery:${deliveryId}`);
    });

    // ── Rider: Accept Delivery ───────────────────────────────
    socket.on(
      SOCKET_EVENTS.ACCEPT_DELIVERY,
      async (deliveryId: string) => {
        if (role !== 'RIDER' || !riderId) return;

        try {
          const delivery = await prisma.delivery.update({
            where: { id: deliveryId, status: 'PENDING' },
            data: {
              riderId:    userId,
              status:     'ACCEPTED',
              acceptedAt: new Date(),
            },
            include: { customer: { select: { id: true, name: true } } },
          });

          socket.join(`delivery:${deliveryId}`);

          // Notify customer
          io.to(`user:${delivery.customerId}`).emit(SOCKET_EVENTS.ORDER_ACCEPTED, {
            deliveryId,
            riderId,
            message: 'Your rider is on the way!',
          });

          // Confirm to rider
          socket.emit(SOCKET_EVENTS.SYSTEM_MESSAGE, {
            type: 'DELIVERY_ACCEPTED',
            delivery,
          });
        } catch (err) {
          socket.emit(SOCKET_EVENTS.SYSTEM_MESSAGE, {
            type: 'ERROR',
            message: 'Could not accept delivery — it may already be taken.',
          });
        }
      }
    );

    // ── Rider / System: Update Delivery Status ───────────────
    socket.on(
      SOCKET_EVENTS.UPDATE_STATUS,
      async ({ deliveryId, status }: StatusUpdateData) => {
        const allowedStatuses = ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'];
        if (!allowedStatuses.includes(status)) return;

        const timestampField: Record<string, string> = {
          PICKED_UP:  'pickedUpAt',
          DELIVERED:  'deliveredAt',
        };

        try {
          const delivery = await prisma.delivery.update({
            where: { id: deliveryId },
            data: {
              status: status as any,
              ...(timestampField[status] ? { [timestampField[status]]: new Date() } : {}),
            },
          });

          io.to(`delivery:${deliveryId}`).emit(
            SOCKET_EVENTS.DELIVERY_STATUS_CHANGED,
            { deliveryId, status, timestamp: Date.now() }
          );

          // Notify admin room on delivery completion
          if (status === 'DELIVERED') {
            io.to('admin').emit(SOCKET_EVENTS.SYSTEM_MESSAGE, {
              type: 'DELIVERY_COMPLETED',
              deliveryId,
              totalFareNgn: delivery.totalFareNgn,
              platformFeeNgn: delivery.platformFeeNgn,
            });
          }
        } catch (err) {
          console.error(`[Socket] Status update failed for ${deliveryId}:`, err);
        }
      }
    );

    // ── Disconnect ────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`[Socket] Disconnected: ${userId}`);
      if (role === 'RIDER' && riderId) {
        await setRiderOffline(riderId);
      }
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────

async function setRiderOffline(riderId: string): Promise<void> {
  onlineRiders.delete(riderId);
  await prisma.riderProfile.update({
    where: { id: riderId },
    data:  { isOnline: false, lastSeenAt: new Date() },
  }).catch(console.error);
  console.log(`[Socket] Rider ${riderId} is OFFLINE`);
}

/**
 * Dispatch a new order to available riders.
 * Called from the delivery service when a customer books.
 */
export function dispatchNewOrder(
  io: Server,
  businessId: string,
  delivery: Record<string, unknown>
): void {
  io.to(`business:${businessId}`).emit(SOCKET_EVENTS.NEW_ORDER, { delivery });
}

/**
 * Get current online rider count (for admin dashboard).
 */
export function getOnlineRiderCount(): number {
  return onlineRiders.size;
}

export { onlineRiders };

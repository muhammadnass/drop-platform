// ============================================================
// DROP LOGISTICS — Auth Routes
// POST /api/auth/register
// POST /api/auth/login
// GET  /api/auth/me
// POST /api/auth/logout
// ============================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes } from 'crypto';
import { sendPasswordResetEmail } from '../services/email.service';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? '12');
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

// ── Validation Schemas ────────────────────────────────────────

const RegisterSchema = z.object({
  name:     z.string().min(2).max(80),
  email:    z.string().email(),
  phone:    z.string().min(10).max(15).optional(),
  password: z.string().min(8),
  role:     z.enum(['CUSTOMER']).default('CUSTOMER'), // Only customers self-register
});

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// ── Helpers ───────────────────────────────────────────────────

function signToken(payload: object): string {
  // jti makes every token unique even when the same user/role payload is
  // signed twice within the same second (e.g. a double-click on "Sign in",
  // or a client-side retry) — without it, jwt.sign() can produce an
  // identical token string, which collides with the unique constraint on
  // Session.token and crashes the request (previously the whole process,
  // since nothing here was wrapped in try/catch).
  return jwt.sign({ ...payload, jti: randomUUID() }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

function userPublic(user: any) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// ── POST /api/auth/register ────────────────────────────────────
router.post('/register', async (req: Request, res: Response) => {
  try {
    const result = RegisterSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error.flatten() });
    }

    const { name, email, phone, password } = result.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        role: 'CUSTOMER',
        customerProfile: { create: {} },
      },
      include: { customerProfile: true },
    });

    const token = signToken({ userId: user.id, role: user.role });

    await prisma.session.create({
      data: {
        userId:    user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return res.status(201).json({
      success: true,
      data: { user: userPublic(user), token },
    });
  } catch (err) {
    console.error('[auth/register] error:', err);
    return res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  try {
    const result = LoginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error.flatten() });
    }

    const { email, password } = result.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        riderProfile:    true,
        customerProfile: true,
        business:        true,
      },
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, error: 'Account is deactivated' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const tokenPayload: Record<string, unknown> = {
      userId: user.id,
      role:   user.role,
    };
    if (user.riderProfile)    tokenPayload.riderId    = user.riderProfile.id;
    if (user.business)        tokenPayload.businessId = user.business.id;

    const token = signToken(tokenPayload);

    await prisma.session.create({
      data: {
        userId:    user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return res.json({
      success: true,
      data: { user: userPublic(user), token },
    });
  } catch (err) {
    console.error('[auth/login] error:', err);
    return res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: {
      riderProfile:    true,
      customerProfile: true,
      business:        true,
    },
  });

  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  return res.json({ success: true, data: userPublic(user) });
});

// ── PATCH /api/auth/me ── update own name / avatar ─────────────
router.patch('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    name:      z.string().min(2).max(100).optional(),
    avatarUrl: z.string().min(1).max(500).optional(), // our own /uploads/... path, not a strict URL
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data:  parsed.data,
    include: { riderProfile: true, customerProfile: true, business: true },
  });
  return res.json({ success: true, data: userPublic(user) });
});

// ── POST /api/auth/logout ──────────────────────────────────────
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  if (token) {
    await prisma.session.deleteMany({ where: { token } }).catch(() => {});
  }
  return res.json({ success: true, message: 'Logged out' });
});

// ── DELETE /api/auth/me ── Self-service account deletion ──────
// A brand-new account with no history (no deliveries, no business) is
// hard-deleted outright. An account with real history can't be hard-deleted
// without breaking foreign keys on past deliveries/wallet transactions (and
// doing so would also destroy the other party's own order history) — so
// instead it's deactivated and its PII is scrubbed: email/phone are freed up
// for reuse, the password is invalidated, and every session is revoked.
// Either way the account can no longer be logged into after this call.
router.delete('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { riderProfile: true, customerProfile: true, business: true },
    });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const [deliveriesAsCustomer, deliveriesAsRider] = await Promise.all([
      prisma.delivery.count({ where: { customerId: userId } }),
      prisma.delivery.count({ where: { riderId: userId } }),
    ]);
    const hasHistory = deliveriesAsCustomer > 0 || deliveriesAsRider > 0 || !!user.business;

    if (!hasHistory) {
      // Safe to fully remove — nothing else references this account.
      await prisma.$transaction(async (tx) => {
        await tx.session.deleteMany({ where: { userId } });
        if (user.riderProfile) {
          await tx.walletTransaction.deleteMany({ where: { wallet: { riderId: user.riderProfile.id } } });
          await tx.wallet.deleteMany({ where: { riderId: user.riderProfile.id } });
          await tx.riderProfile.delete({ where: { id: user.riderProfile.id } });
        }
        if (user.customerProfile) {
          await tx.customerWalletTransaction.deleteMany({ where: { wallet: { customerId: user.customerProfile.id } } });
          await tx.customerWallet.deleteMany({ where: { customerId: user.customerProfile.id } });
          await tx.customerProfile.delete({ where: { id: user.customerProfile.id } });
        }
        await tx.user.delete({ where: { id: userId } });
      });
      return res.json({ success: true, data: { deleted: true, message: 'Account permanently deleted' } });
    }

    // Has order/business history — deactivate and scrub PII instead of a
    // hard delete, so past deliveries/transactions stay intact for the
    // other party (rider/customer/business) involved in them.
    const randomPassword = await bcrypt.hash(randomUUID(), BCRYPT_ROUNDS);
    await prisma.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          isActive:     false,
          email:        `deleted-${userId}@drop.invalid`,
          phone:        null,
          name:         'Deleted User',
          passwordHash: randomPassword,
        },
      });
      if (user.riderProfile) {
        await tx.riderProfile.update({ where: { id: user.riderProfile.id }, data: { isOnline: false } });
      }
    });
    return res.json({
      success: true,
      data: { deleted: false, deactivated: true, message: 'Account deactivated and personal data removed. Order history is kept for record-keeping.' },
    });
  } catch (err) {
    console.error('[auth/me DELETE] error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete account. Please try again.' });
  }
});

// ── PATCH /api/auth/me ── Update own profile ─────────────────
const UpdateMeSchema = z.object({
  name:      z.string().min(2).max(80).optional(),
  avatarUrl: z.string().max(500_000).optional(), // base64 data URL or https URL
});

router.patch('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = UpdateMeSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error.flatten() });
    }
    const { name, avatarUrl } = result.data;
    if (!name && !avatarUrl) {
      return res.status(400).json({ success: false, error: 'Nothing to update' });
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(name      && { name }),
        ...(avatarUrl && { avatarUrl }),
      },
    });

    return res.json({ success: true, data: userPublic(updated) });
  } catch (err) {
    console.error('[auth/me PATCH] error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

// ── POST /api/auth/forgot-password ───────────────────────────
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    // Always respond OK — never reveal whether an email exists
    if (!user || !user.isActive) {
      return res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
    }

    const token = randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: expiry },
    });

    await sendPasswordResetEmail(user.email, user.name, token);

    return res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error('[auth/forgot-password] error:', err);
    // Still return OK to avoid leaking info
    return res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
  }
});

// ── POST /api/auth/reset-password ────────────────────────────
const ResetPasswordSchema = z.object({
  token:    z.string().min(1),
  password: z.string().min(8),
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const result = ResetPasswordSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error.flatten() });
    }

    const { token, password } = result.data;

    const user = await prisma.user.findUnique({ where: { resetToken: token } });

    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return res.status(400).json({ success: false, error: 'Reset link is invalid or has expired. Please request a new one.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await prisma.$transaction(async (tx) => {
      // Invalidate all existing sessions
      await tx.session.deleteMany({ where: { userId: user.id } });
      // Update password and clear reset token
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, resetToken: null, resetTokenExpiry: null },
      });
    });

    return res.json({ success: true, message: 'Password updated successfully. You can now log in.' });
  } catch (err) {
    console.error('[auth/reset-password] error:', err);
    return res.status(500).json({ success: false, error: 'Failed to reset password. Please try again.' });
  }
});

export { router as authRouter };

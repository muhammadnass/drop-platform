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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

function userPublic(user: any) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// ── POST /api/auth/register ────────────────────────────────────
router.post('/register', async (req: Request, res: Response) => {
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
});

// ── POST /api/auth/login ───────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
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

// ── POST /api/auth/logout ──────────────────────────────────────
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  if (token) {
    await prisma.session.deleteMany({ where: { token } }).catch(() => {});
  }
  return res.json({ success: true, message: 'Logged out' });
});

export { router as authRouter };

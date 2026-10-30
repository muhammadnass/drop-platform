// ============================================================
// DROP LOGISTICS — Backend Server Entry Point
// ============================================================

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { rateLimit } from 'express-rate-limit';

import { registerSocketGateway } from './gateways/socket.gateway';
import { authRouter }     from './routes/auth.routes';
import { deliveryRouter } from './routes/delivery.routes';
import { fareRouter }     from './routes/fare.routes';
import { riderRouter }    from './routes/rider.routes';
import { adminRouter }    from './routes/admin.routes';
import { businessRouter } from './routes/business.routes';
import { paymentRouter }  from './routes/payment.routes';
import { uploadRouter }   from './routes/upload.routes';
import { customerRouter } from './routes/customer.routes';
import { errorHandler }   from './middleware/error.middleware';
import { authMiddleware } from './middleware/auth.middleware';

const PORT        = parseInt(process.env.PORT ?? '4000', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';

const app        = express();
const httpServer = createServer(app);

export const io = new SocketIOServer(httpServer, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'], credentials: true },
  pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL ?? '10000'),
  pingTimeout:  parseInt(process.env.SOCKET_PING_TIMEOUT  ?? '5000'),
});

// ── Global Middleware ─────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Raw body needed for Paystack webhook signature verification
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));   // 10MB for base64 image uploads
app.use(express.urlencoded({ extended: true }));

app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders:   false,
}));

// ── Static file serving for uploaded files ────────────────────
// Serves /uploads/profiles/*, /uploads/plates/*, /uploads/items/*, /uploads/voice-notes/*
const uploadsDir = path.resolve(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsDir));

// ── Health ────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'drop-server', ts: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',       authRouter);
app.use('/api/fare',       fareRouter);
app.use('/api/payments',   paymentRouter);
app.use('/api/uploads',    authMiddleware, uploadRouter);
app.use('/api/deliveries', authMiddleware, deliveryRouter);
app.use('/api/riders',     authMiddleware, riderRouter);
app.use('/api/customers',  authMiddleware, customerRouter);
app.use('/api/admin',      authMiddleware, adminRouter);
app.use('/api/businesses', authMiddleware, businessRouter);

// ── Socket ────────────────────────────────────────────────────
registerSocketGateway(io);

// ── Error Handler ─────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   DROP Logistics Server                  ║
  ║   Running on http://localhost:${PORT}       ║
  ║   Socket.io ready for connections        ║
  ╚══════════════════════════════════════════╝
  `);
});

export default app;

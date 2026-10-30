// ============================================================
// DROP LOGISTICS — Upload Routes (base64 → disk)
// ============================================================

import { Router, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { AuthRequest, authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Ensure upload directories exist
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
['profiles', 'plates', 'items', 'voice-notes'].forEach((dir) => {
  fs.mkdirSync(path.join(UPLOAD_DIR, dir), { recursive: true });
});

// POST /api/uploads/image
// Body: { base64: "data:image/jpeg;base64,...", folder: "profiles"|"plates"|"items" }
// Returns: { url: "/uploads/profiles/abc123.jpg" }
router.post('/image', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { base64, folder = 'items' } = req.body;
  if (!base64 || typeof base64 !== 'string') {
    return res.status(400).json({ success: false, error: 'base64 image required' });
  }
  const allowedFolders = ['profiles', 'plates', 'items'];
  if (!allowedFolders.includes(folder)) {
    return res.status(400).json({ success: false, error: 'Invalid folder' });
  }

  // Parse data URL
  const match = base64.match(/^data:image\/(jpeg|png|webp|gif);base64,(.+)$/);
  if (!match) return res.status(400).json({ success: false, error: 'Invalid image format (use jpeg/png/webp)' });

  const ext     = match[1] === 'jpeg' ? 'jpg' : match[1];
  const data    = Buffer.from(match[2], 'base64');
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (data.length > maxSize) return res.status(400).json({ success: false, error: 'Image too large (max 5MB)' });

  const filename = `${req.user!.userId}-${Date.now()}.${ext}`;
  const filepath = path.join(UPLOAD_DIR, folder, filename);

  fs.writeFileSync(filepath, data);
  const url = `/uploads/${folder}/${filename}`;

  return res.json({ success: true, data: { url } });
});

// POST /api/uploads/voice-note
// Body: { base64: "data:audio/webm;base64,...", deliveryId: "..." }
router.post('/voice-note', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { base64, deliveryId } = req.body;
  if (!base64 || !deliveryId) return res.status(400).json({ success: false, error: 'base64 and deliveryId required' });

  const match = base64.match(/^data:audio\/(webm|mp4|ogg|wav);base64,(.+)$/);
  if (!match) return res.status(400).json({ success: false, error: 'Invalid audio format' });

  const ext      = match[1];
  const data     = Buffer.from(match[2], 'base64');
  const filename = `${req.user!.userId}-${deliveryId}-${Date.now()}.${ext}`;
  const filepath = path.join(UPLOAD_DIR, 'voice-notes', filename);

  fs.writeFileSync(filepath, data);
  const url = `/uploads/voice-notes/${filename}`;

  // Rough duration estimate: webm ~32kbps
  const durationSecs = Math.round(data.length / (32 * 1024 / 8));

  return res.json({ success: true, data: { url, durationSecs } });
});

export { router as uploadRouter };

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
  try {
    const { base64, folder = 'items' } = req.body;
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ success: false, error: 'base64 image required' });
    }
    const allowedFolders = ['profiles', 'plates', 'items'];
    if (!allowedFolders.includes(folder)) {
      return res.status(400).json({ success: false, error: 'Invalid folder' });
    }

    // Parse data URL — accept ANY image/* subtype (phones send jpeg/png/webp/heic/heif
    // depending on OS/camera app; a narrow whitelist here used to silently reject valid
    // photos, and with no try/catch the request would hang forever instead of erroring).
    const match = base64.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ success: false, error: 'Invalid image format' });

    const rawExt = match[1].toLowerCase();
    const ext    = rawExt === 'jpeg' ? 'jpg' : rawExt.replace(/[^a-z0-9]/g, '') || 'jpg';
    const data    = Buffer.from(match[2], 'base64');
    const maxSize = 15 * 1024 * 1024; // 15MB — raised from 5MB, which rejected real phone-camera photos
    if (data.length > maxSize) return res.status(400).json({ success: false, error: 'Image too large (max 15MB)' });

    const filename = `${req.user!.userId}-${Date.now()}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, folder, filename);

    fs.writeFileSync(filepath, data);
    const url = `/uploads/${folder}/${filename}`;

    return res.json({ success: true, data: { url } });
  } catch (err: any) {
    console.error('Image upload failed:', err);
    return res.status(500).json({ success: false, error: 'Upload failed. Please try again.' });
  }
});

// POST /api/uploads/voice-note
// Body: { base64: "data:audio/webm;base64,...", deliveryId: "..." }
router.post('/voice-note', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { base64, deliveryId } = req.body;
    if (!base64 || !deliveryId) return res.status(400).json({ success: false, error: 'base64 and deliveryId required' });

    const match = base64.match(/^data:audio\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ success: false, error: 'Invalid audio format' });

    const ext      = match[1].toLowerCase().replace(/[^a-z0-9]/g, '') || 'webm';
    const data     = Buffer.from(match[2], 'base64');
    const filename = `${req.user!.userId}-${deliveryId}-${Date.now()}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, 'voice-notes', filename);

    fs.writeFileSync(filepath, data);
    const url = `/uploads/voice-notes/${filename}`;

    // Rough duration estimate: webm ~32kbps
    const durationSecs = Math.round(data.length / (32 * 1024 / 8));

    return res.json({ success: true, data: { url, durationSecs } });
  } catch (err: any) {
    console.error('Voice note upload failed:', err);
    return res.status(500).json({ success: false, error: 'Upload failed. Please try again.' });
  }
});

export { router as uploadRouter };

// ============================================================
// DROP LOGISTICS — Field-level encryption (NIN / BVN at rest)
// ============================================================
// AES-256-GCM. These values are government ID numbers (NIN) and bank
// verification numbers (BVN) — they must never be stored in plaintext.
//
// Key source: KYC_ENCRYPTION_KEY env var, a 32-byte key given as base64
// or hex. If it isn't set, we derive a key from JWT_SECRET so the app
// still works out of the box, but this is NOT a substitute for setting a
// dedicated key in production — rotating JWT_SECRET would then also
// silently break decryption of every stored KYC value.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.KYC_ENCRYPTION_KEY;
  if (raw) {
    const buf = /^[0-9a-fA-F]+$/.test(raw) && raw.length === 64
      ? Buffer.from(raw, 'hex')
      : Buffer.from(raw, 'base64');
    if (buf.length === 32) return buf;
    console.warn('[encryption] KYC_ENCRYPTION_KEY is set but not a valid 32-byte key — falling back to a derived key. Fix this before going live.');
  }
  // Fallback: derive a stable 32-byte key from JWT_SECRET so encrypt/decrypt
  // still round-trip correctly without a dedicated key configured.
  return createHash('sha256').update(process.env.JWT_SECRET ?? 'drop-fallback-key').digest();
}

// Format: base64(iv) . base64(authTag) . base64(ciphertext)
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decryptField(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted field');
  const key = getKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

// For display only — never send the full decrypted value back to a client.
export function maskLast4(plaintext: string): string {
  if (plaintext.length <= 4) return '•'.repeat(plaintext.length);
  return '•'.repeat(plaintext.length - 4) + plaintext.slice(-4);
}

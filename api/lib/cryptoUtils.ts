// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · Server-side AES-256-GCM encryption for broker token storage
//
// USAGE
//   import { encrypt, decrypt } from "./lib/cryptoUtils";
//   const stored  = encrypt(accessToken);   // → base64 ciphertext
//   const plain   = decrypt(stored);        // → original string
//
// ENV VAR REQUIRED
//   TRADR_ENCRYPTION_KEY — 64 hex characters (32 bytes).
//   Generate once with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//   Store in Vercel dashboard → Settings → Environment Variables.
//   NEVER commit this value to git.
//
// FORMAT
//   Ciphertext = base64( IV[12] || AuthTag[16] || Encrypted[...] )
//   IV is random per call — same plaintext encrypts differently each time.
// ═══════════════════════════════════════════════════════════════════════════════

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getKey(): Buffer {
  const hex = process.env.TRADR_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "TRADR_ENCRYPTION_KEY env var is missing or wrong length. " +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a plaintext string.
 * Returns a base64-encoded blob safe to store in Postgres text columns.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv  = randomBytes(12); // 96-bit IV for AES-GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag(); // 16-byte auth tag
  // Pack as IV || tag || ciphertext, then base64
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypt a base64 blob produced by `encrypt`.
 * Throws if the key is wrong or data has been tampered with.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const buf       = Buffer.from(ciphertext, "base64");
  const iv        = buf.subarray(0, 12);
  const tag       = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher  = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/**
 * Safely decrypt — returns null instead of throwing.
 * Use when you want to skip a connection rather than crash the cron job.
 */
export function tryDecrypt(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  try { return decrypt(ciphertext); } catch { return null; }
}

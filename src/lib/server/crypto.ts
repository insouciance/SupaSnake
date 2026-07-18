/**
 * App-layer secret encryption + OAuth state signing (Player Identity v1
 * section 8.3/8.5, migration 024).
 *
 * - encryptSecret/decryptSecret: AES-256-GCM with the 32-byte
 *   DISCORD_TOKEN_ENC_KEY (base64 in env). Output format is
 *   base64(iv || authTag || ciphertext) - a single opaque column value.
 *   pgsodium was rejected (deprecated on Supabase; keeps decryption
 *   in-DB) - the DB only ever sees ciphertext.
 * - createOAuthState/verifyOAuthState: HMAC-SHA256-signed {userId, exp}
 *   with a subkey DERIVED from the encryption key (never the raw key),
 *   10-minute expiry. Forged or expired states verify to null.
 *
 * Secrets never leave this module in logs: error paths throw typed
 * errors with NO payload material attached.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

const IV_LENGTH = 12; // GCM standard nonce
const TAG_LENGTH = 16;

export class CryptoConfigError extends Error {}
export class DecryptError extends Error {}

/** The 32-byte AES key from DISCORD_TOKEN_ENC_KEY (base64). */
function encryptionKey(): Buffer {
  const raw = process.env.DISCORD_TOKEN_ENC_KEY;
  if (!raw) {
    throw new CryptoConfigError('DISCORD_TOKEN_ENC_KEY is not set');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new CryptoConfigError('DISCORD_TOKEN_ENC_KEY must be 32 bytes (base64)');
  }
  return key;
}

/**
 * Domain-separated subkey for state HMACs - the raw encryption key is
 * never used directly for signing.
 */
function stateKey(): Buffer {
  return createHmac('sha256', encryptionKey())
    .update('supasnake:discord:oauth-state:v1')
    .digest();
}

/** AES-256-GCM encrypt -> base64(iv || tag || ciphertext). */
export function encryptSecret(plaintext: string): string {
  const key = encryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/** Reverse of encryptSecret. Throws DecryptError on tamper/garbage. */
export function decryptSecret(payload: string): string {
  const key = encryptionKey();
  const raw = Buffer.from(payload, 'base64');
  if (raw.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new DecryptError('Ciphertext too short');
  }
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Never attach cipher material to the error
    throw new DecryptError('Decryption failed (tampered or wrong key)');
  }
}

export interface OAuthState {
  userId: string;
  exp: number;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes (spec)

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

/** Signed OAuth state: base64url(json).base64url(hmac). */
export function createOAuthState(
  userId: string,
  now: number = Date.now()
): string {
  const payload: OAuthState = { userId, exp: now + STATE_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const mac = createHmac('sha256', stateKey()).update(body).digest();
  return `${b64url(body)}.${b64url(mac)}`;
}

/**
 * Verify a state token: null on bad format, bad signature or expiry.
 * Constant-time MAC comparison.
 */
export function verifyOAuthState(
  token: string | null | undefined,
  now: number = Date.now()
): OAuthState | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  let body: Buffer;
  let mac: Buffer;
  try {
    body = Buffer.from(parts[0], 'base64url');
    mac = Buffer.from(parts[1], 'base64url');
  } catch {
    return null;
  }
  const expected = createHmac('sha256', stateKey()).update(body).digest();
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  }
  const state = parsed as Partial<OAuthState>;
  if (typeof state.userId !== 'string' || typeof state.exp !== 'number') {
    return null;
  }
  if (state.exp <= now) return null;
  return { userId: state.userId, exp: state.exp };
}

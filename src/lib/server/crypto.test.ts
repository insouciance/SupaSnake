/**
 * @jest-environment node
 */

/**
 * AES-256-GCM secret encryption + HMAC OAuth state tests (Identity v1
 * section 8.3/8.5). Round-trip, tamper detection (GCM auth tag), wrong
 * key, and the state token's forge/expiry/garbage paths.
 */

import { randomBytes } from 'crypto';
import {
  CryptoConfigError,
  DecryptError,
  createOAuthState,
  decryptSecret,
  encryptSecret,
  verifyOAuthState,
} from './crypto';

const KEY_A = randomBytes(32).toString('base64');
const KEY_B = randomBytes(32).toString('base64');

beforeEach(() => {
  process.env.DISCORD_TOKEN_ENC_KEY = KEY_A;
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips arbitrary strings', () => {
    for (const secret of [
      'a',
      'discord-access-token-abc123',
      'ünïcodé 🐍 tokens',
      'x'.repeat(4096),
    ]) {
      expect(decryptSecret(encryptSecret(secret))).toBe(secret);
    }
  });

  it('produces a fresh IV every call (no two ciphertexts match)', () => {
    const a = encryptSecret('same-secret');
    const b = encryptSecret('same-secret');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same-secret');
    expect(decryptSecret(b)).toBe('same-secret');
  });

  it('rejects tampered ciphertext (auth tag)', () => {
    const payload = encryptSecret('secret-token');
    const raw = Buffer.from(payload, 'base64');
    raw[raw.length - 1] ^= 0xff; // flip a ciphertext bit
    expect(() => decryptSecret(raw.toString('base64'))).toThrow(DecryptError);
  });

  it('rejects a tampered IV and truncated payloads', () => {
    const payload = encryptSecret('secret-token');
    const raw = Buffer.from(payload, 'base64');
    raw[0] ^= 0x01; // flip an IV bit
    expect(() => decryptSecret(raw.toString('base64'))).toThrow(DecryptError);
    expect(() => decryptSecret('AAAA')).toThrow(DecryptError);
    expect(() => decryptSecret('')).toThrow(DecryptError);
  });

  it('rejects decryption under a different key', () => {
    const payload = encryptSecret('secret-token');
    process.env.DISCORD_TOKEN_ENC_KEY = KEY_B;
    expect(() => decryptSecret(payload)).toThrow(DecryptError);
  });

  it('refuses to run without a proper 32-byte key', () => {
    delete process.env.DISCORD_TOKEN_ENC_KEY;
    expect(() => encryptSecret('x')).toThrow(CryptoConfigError);
    process.env.DISCORD_TOKEN_ENC_KEY = Buffer.from('short').toString('base64');
    expect(() => encryptSecret('x')).toThrow(CryptoConfigError);
  });

  it('never leaks the plaintext or key material in error messages', () => {
    const payload = encryptSecret('super-secret-token');
    const raw = Buffer.from(payload, 'base64');
    raw[raw.length - 1] ^= 0xff;
    try {
      decryptSecret(raw.toString('base64'));
      throw new Error('should have thrown');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain('super-secret-token');
      expect(message).not.toContain(KEY_A);
    }
  });
});

describe('OAuth state (HMAC-signed, 10-minute expiry)', () => {
  it('round-trips a userId within the window', () => {
    const token = createOAuthState('player-123');
    const state = verifyOAuthState(token);
    expect(state).not.toBeNull();
    expect(state!.userId).toBe('player-123');
  });

  it('expires after 10 minutes', () => {
    const now = Date.now();
    const token = createOAuthState('player-123', now);
    expect(verifyOAuthState(token, now + 10 * 60 * 1000 - 1)).not.toBeNull();
    expect(verifyOAuthState(token, now + 10 * 60 * 1000)).toBeNull();
    expect(verifyOAuthState(token, now + 11 * 60 * 1000)).toBeNull();
  });

  it('rejects a forged payload (signature over different body)', () => {
    const token = createOAuthState('player-123');
    const [, mac] = token.split('.');
    const forgedBody = Buffer.from(
      JSON.stringify({ userId: 'attacker', exp: Date.now() + 600000 }),
      'utf8'
    ).toString('base64url');
    expect(verifyOAuthState(`${forgedBody}.${mac}`)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = createOAuthState('player-123');
    const [body, mac] = token.split('.');
    const flipped = (mac[0] === 'A' ? 'B' : 'A') + mac.slice(1);
    expect(verifyOAuthState(`${body}.${flipped}`)).toBeNull();
  });

  it('rejects states signed under a different key', () => {
    const token = createOAuthState('player-123');
    process.env.DISCORD_TOKEN_ENC_KEY = KEY_B;
    expect(verifyOAuthState(token)).toBeNull();
  });

  it('rejects garbage and malformed tokens', () => {
    expect(verifyOAuthState(null)).toBeNull();
    expect(verifyOAuthState(undefined)).toBeNull();
    expect(verifyOAuthState('')).toBeNull();
    expect(verifyOAuthState('not-a-state')).toBeNull();
    expect(verifyOAuthState('a.b.c')).toBeNull();
    const bodyOnly = Buffer.from('{}', 'utf8').toString('base64url');
    expect(verifyOAuthState(`${bodyOnly}.`)).toBeNull();
  });
});

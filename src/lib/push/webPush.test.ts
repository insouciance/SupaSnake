/**
 * The transport is verified by DECRYPTING what it produces.
 *
 * A push encryptor that is only asserted against itself proves nothing: every
 * wrong implementation is self-consistent. So this file plays the receiver.
 * It generates a P-256 key pair and a 16-byte auth secret exactly as a browser
 * does, hands the public half to `encryptPushPayload`, and then reverses RFC
 * 8291 with the PRIVATE half. If a single byte of the key derivation, the
 * record delimiter or the RFC 8188 header were wrong, the GCM tag would not
 * verify and `decryptForTest` would throw.
 */

import { createDecipheriv, createECDH, createHmac, randomBytes } from 'node:crypto';
import {
  b64urlDecode,
  b64urlEncode,
  buildVapidAuthorization,
  encryptPushPayload,
  readVapidConfig,
  sendWebPush,
  vapidConfigured,
  VapidConfigError,
} from '@/lib/push/webPush';

// ---------------------------------------------------------------------------
// A browser, played by the test
// ---------------------------------------------------------------------------

function makeSubscriber() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    privateKey: ecdh.getPrivateKey(),
    publicKey: ecdh.getPublicKey(),
    authSecret: randomBytes(16),
  };
}

function hmac(key: Buffer, data: Buffer): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function expand(prk: Buffer, info: string, length: number): Buffer {
  return hmac(prk, Buffer.concat([Buffer.from(info, 'utf8'), Buffer.from([0x01])])).subarray(
    0,
    length
  );
}

/** RFC 8291 / RFC 8188 in reverse, from the receiver's side. */
function decryptForTest(body: Buffer, uaPrivate: Buffer, uaPublic: Buffer, authSecret: Buffer) {
  const salt = body.subarray(0, 16);
  const recordSize = body.readUInt32BE(16);
  const idLength = body.readUInt8(20);
  const serverPublic = body.subarray(21, 21 + idLength);
  const ciphertext = body.subarray(21 + idLength);

  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivate);
  const sharedSecret = ecdh.computeSecret(serverPublic);

  const prkKey = hmac(authSecret, sharedSecret);
  const ikm = hmac(
    prkKey,
    Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublic, serverPublic, Buffer.from([0x01])])
  ).subarray(0, 32);

  const prk = hmac(salt, ikm);
  const cek = expand(prk, 'Content-Encoding: aes128gcm\0', 16);
  const nonce = expand(prk, 'Content-Encoding: nonce\0', 12);

  const tag = ciphertext.subarray(ciphertext.length - 16);
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(tag);
  const record = Buffer.concat([
    decipher.update(ciphertext.subarray(0, ciphertext.length - 16)),
    decipher.final(),
  ]);

  return {
    recordSize,
    delimiter: record[record.length - 1],
    plaintext: record.subarray(0, record.length - 1).toString('utf8'),
  };
}

describe('encryptPushPayload', () => {
  const subscriber = makeSubscriber();
  const keys = { p256dh: b64urlEncode(subscriber.publicKey), auth: b64urlEncode(subscriber.authSecret) };

  it('produces a body the intended recipient can decrypt', () => {
    const payload = JSON.stringify({ title: 'Your week settled', body: 'The week is on its page.' });
    const { body } = encryptPushPayload(payload, keys);

    const decrypted = decryptForTest(
      body,
      subscriber.privateKey,
      subscriber.publicKey,
      subscriber.authSecret
    );

    expect(decrypted.plaintext).toBe(payload);
    // 0x02 — the LAST-record delimiter. 0x01 would leave the receiver waiting.
    expect(decrypted.delimiter).toBe(0x02);
    expect(decrypted.recordSize).toBe(4096);
  });

  it('lays out the RFC 8188 header exactly: salt(16) ‖ rs(4) ‖ idlen(1) ‖ key(65)', () => {
    const { body, salt, serverPublicKey } = encryptPushPayload('{"title":"a","body":"b"}', keys);
    expect(body.subarray(0, 16).equals(salt)).toBe(true);
    expect(body.readUInt32BE(16)).toBe(4096);
    expect(body.readUInt8(20)).toBe(65);
    expect(body.subarray(21, 86).equals(serverPublicKey)).toBe(true);
    expect(serverPublicKey[0]).toBe(0x04);
  });

  it('is non-deterministic — a fresh salt and ephemeral key every time', () => {
    const first = encryptPushPayload('{"title":"a","body":"b"}', keys);
    const second = encryptPushPayload('{"title":"a","body":"b"}', keys);
    expect(first.salt.equals(second.salt)).toBe(false);
    expect(first.serverPublicKey.equals(second.serverPublicKey)).toBe(false);
    expect(first.body.equals(second.body)).toBe(false);
  });

  it('cannot be decrypted with a different auth secret', () => {
    const { body } = encryptPushPayload('{"title":"a","body":"b"}', keys);
    expect(() =>
      decryptForTest(body, subscriber.privateKey, subscriber.publicKey, randomBytes(16))
    ).toThrow();
  });

  it('cannot be decrypted by a different subscriber', () => {
    const other = makeSubscriber();
    const { body } = encryptPushPayload('{"title":"a","body":"b"}', keys);
    expect(() =>
      decryptForTest(body, other.privateKey, other.publicKey, subscriber.authSecret)
    ).toThrow();
  });

  it('refuses malformed subscription keys instead of producing an undeliverable body', () => {
    expect(() =>
      encryptPushPayload('{}', { p256dh: b64urlEncode(randomBytes(64)), auth: keys.auth })
    ).toThrow(/uncompressed P-256/);
    expect(() =>
      encryptPushPayload('{}', { p256dh: keys.p256dh, auth: b64urlEncode(randomBytes(8)) })
    ).toThrow(/16 bytes/);
  });

  it('refuses a payload that would not fit one record', () => {
    expect(() => encryptPushPayload('x'.repeat(5000), keys)).toThrow(/single aes128gcm record/);
  });
});

// ---------------------------------------------------------------------------
// VAPID
// ---------------------------------------------------------------------------

describe('VAPID', () => {
  const original = {
    pub: process.env.VAPID_PUBLIC_KEY,
    priv: process.env.VAPID_PRIVATE_KEY,
    sub: process.env.VAPID_SUBJECT,
  };

  function setKeys() {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    process.env.VAPID_PUBLIC_KEY = b64urlEncode(ecdh.getPublicKey());
    process.env.VAPID_PRIVATE_KEY = b64urlEncode(ecdh.getPrivateKey());
    process.env.VAPID_SUBJECT = 'mailto:ops@supasnake.com';
  }

  function clearKeys() {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
  }

  afterEach(() => {
    clearKeys();
    if (original.pub !== undefined) process.env.VAPID_PUBLIC_KEY = original.pub;
    if (original.priv !== undefined) process.env.VAPID_PRIVATE_KEY = original.priv;
    if (original.sub !== undefined) process.env.VAPID_SUBJECT = original.sub;
  });

  it('reports itself unconfigured when the owner has set no keys', () => {
    clearKeys();
    expect(vapidConfigured()).toBe(false);
    expect(() => readVapidConfig()).toThrow(VapidConfigError);
  });

  it('rejects a subject that is not mailto: or https:', () => {
    setKeys();
    process.env.VAPID_SUBJECT = 'ops@supasnake.com';
    expect(() => readVapidConfig()).toThrow(/mailto:/);
  });

  it('rejects a public key that is not an uncompressed P-256 point', () => {
    setKeys();
    // A fully random 65-byte buffer begins with the valid 0x04 marker about
    // once every 256 runs. Pin the compressed-point marker so this fixture is
    // invalid by construction rather than by probability.
    process.env.VAPID_PUBLIC_KEY = b64urlEncode(
      Buffer.concat([Buffer.from([0x03]), randomBytes(64)])
    );
    expect(() => readVapidConfig()).toThrow(/uncompressed P-256/);
  });

  it('builds a JWS whose audience is the endpoint ORIGIN, never the full path', () => {
    setKeys();
    const header = buildVapidAuthorization(
      'https://fcm.googleapis.com/fcm/send/abc123-secret-subscriber-id'
    );
    const [, token] = /^vapid t=([^,]+), k=(.+)$/.exec(header) ?? [];
    const [, payload, signature] = token.split('.');
    const claims = JSON.parse(b64urlDecode(payload).toString('utf8'));

    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toBe('mailto:ops@supasnake.com');
    expect(JSON.stringify(claims)).not.toContain('abc123-secret-subscriber-id');
    // ES256 is a raw r‖s pair; a DER signature would be ~70 bytes and rejected.
    expect(b64urlDecode(signature)).toHaveLength(64);
  });

  it('advertises the public key so the push service can verify the signature', () => {
    setKeys();
    const header = buildVapidAuthorization('https://updates.push.services.mozilla.com/wpush/v2/x');
    expect(header).toContain(`k=${process.env.VAPID_PUBLIC_KEY}`);
  });

  it('expires within RFC 8292 limits', () => {
    setKeys();
    const now = Date.UTC(2026, 6, 26, 12);
    const header = buildVapidAuthorization('https://example.com/p/1', readVapidConfig(), now);
    const claims = JSON.parse(
      b64urlDecode(header.split('.')[1]).toString('utf8')
    );
    expect(claims.exp).toBeGreaterThan(Math.floor(now / 1000));
    expect(claims.exp - Math.floor(now / 1000)).toBeLessThanOrEqual(24 * 60 * 60);
  });
});

// ---------------------------------------------------------------------------
// sendWebPush — the only function that talks to a push service
// ---------------------------------------------------------------------------

describe('sendWebPush', () => {
  const subscriber = makeSubscriber();
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    p256dh: b64urlEncode(subscriber.publicKey),
    auth: b64urlEncode(subscriber.authSecret),
  };

  it('sends NOTHING when the flag is off — no fetch is even attempted', async () => {
    const fetchImpl = jest.fn();
    const result = await sendWebPush(subscription, '{}', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'failed', httpStatus: null, detail: 'flag-off' });
  });
});

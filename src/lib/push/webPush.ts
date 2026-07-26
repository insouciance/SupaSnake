/**
 * Web Push transport — VAPID (RFC 8292) and aes128gcm (RFC 8188 / RFC 8291).
 *
 * WHY THIS IS HAND-WRITTEN AND NOT A DEPENDENCY
 *
 *   The obvious choice is the `web-push` package. It is not here for two
 *   reasons. The first is that it pulls a transitive tree in order to do what
 *   `node:crypto` already does natively — ECDH on P-256, HKDF, AES-128-GCM and
 *   an ES256 signature. The second matters more: an npm package cannot be
 *   round-tripped in a unit test. Everything below is verified in
 *   `webPush.test.ts` by DECRYPTING the produced body with the recipient's
 *   private key, which is the only test of a push encryptor that means
 *   anything without a live push service.
 *
 *   The algorithm is not invented here. It is RFC 8291 §3.4 followed exactly:
 *
 *     ecdh_secret = ECDH(server_private, ua_public)
 *     PRK_key     = HMAC-SHA-256(auth_secret, ecdh_secret)
 *     key_info    = "WebPush: info" || 0x00 || ua_public || server_public
 *     IKM         = HMAC-SHA-256(PRK_key, key_info || 0x01)
 *     PRK         = HMAC-SHA-256(salt, IKM)
 *     CEK         = HMAC-SHA-256(PRK, "Content-Encoding: aes128gcm\0\x01")[0..16]
 *     NONCE       = HMAC-SHA-256(PRK, "Content-Encoding: nonce\0\x01")[0..12]
 *
 *   and the body is the RFC 8188 header (salt‖rs‖idlen‖keyid) followed by one
 *   AES-128-GCM record whose plaintext is the payload with a trailing 0x02
 *   last-record delimiter.
 *
 * ── NOTHING HERE SENDS BY ITSELF ───────────────────────────────────────────
 *
 *   `sendWebPush` performs the POST, and it is the ONLY function in the
 *   codebase that talks to a push service. It refuses — before composing
 *   anything — unless every one of these holds:
 *
 *     · `NEXT_PUBLIC_PWA_V1` is armed;
 *     · `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are all
 *       set and well-formed.
 *
 *   The VAPID key pair and subject are the OWNER'S to generate and configure;
 *   they are deliberately absent from `.env.example`'s defaults and from every
 *   deployment this work package touches. Until they exist this module is
 *   inert, and that is the intended state at merge.
 *
 * ── WHAT THE TRANSPORT IS NOT ALLOWED TO KNOW ──────────────────────────────
 *
 *   It takes an endpoint, two keys and a string. It has no access to the
 *   player, the trigger, or the message's meaning, and it cannot compose,
 *   edit or fall back on any copy — so no Rule 5 or Rule 7 decision can be
 *   made down here, where nothing would sweep it.
 */

import {
  createECDH,
  createCipheriv,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign as cryptoSign,
} from 'node:crypto';
import { PWA_V1_ENABLED } from '@/lib/pwa/config';

/** RFC 8188 record size. One record is always enough: payloads are ~200 bytes. */
const RECORD_SIZE = 4096;

/** RFC 8292 caps a VAPID token's lifetime at 24 hours; 12 is comfortable. */
const VAPID_TOKEN_TTL_SECONDS = 12 * 60 * 60;

/** How long a push service should hold an undelivered notification. */
export const DEFAULT_TTL_SECONDS = 12 * 60 * 60;

export function b64urlDecode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

export function b64urlEncode(value: Buffer): string {
  return value.toString('base64url');
}

// ---------------------------------------------------------------------------
// VAPID
// ---------------------------------------------------------------------------

export interface VapidConfig {
  /** Raw uncompressed P-256 public point, 65 bytes, base64url. */
  publicKey: string;
  /** Raw P-256 private scalar, 32 bytes, base64url. */
  privateKey: string;
  /** `mailto:` or `https:` contact for the push service operator (RFC 8292). */
  subject: string;
}

export class VapidConfigError extends Error {}

/** True when the owner has configured a usable VAPID identity. */
export function vapidConfigured(): boolean {
  try {
    readVapidConfig();
    return true;
  } catch {
    return false;
  }
}

/** The owner's VAPID identity, validated. Throws rather than half-working. */
export function readVapidConfig(): VapidConfig {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();

  if (!publicKey || !privateKey || !subject) {
    throw new VapidConfigError(
      'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must all be set'
    );
  }
  if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) {
    throw new VapidConfigError('VAPID_SUBJECT must be a mailto: or https: URL');
  }

  const publicBytes = b64urlDecode(publicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 0x04) {
    throw new VapidConfigError(
      'VAPID_PUBLIC_KEY must be a base64url uncompressed P-256 point (65 bytes)'
    );
  }
  if (b64urlDecode(privateKey).length !== 32) {
    throw new VapidConfigError('VAPID_PRIVATE_KEY must be a base64url 32-byte scalar');
  }

  return { publicKey, privateKey, subject };
}

/**
 * The signing key, imported as a JWK rather than assembled as PKCS#8 DER by
 * hand. Node has understood EC JWKs since 16, and the byte-slicing version of
 * this is a place to make a silent mistake.
 */
function vapidSigningKey(config: VapidConfig) {
  const publicBytes = b64urlDecode(config.publicKey);
  return createPrivateKey({
    format: 'jwk',
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: config.privateKey,
      x: b64urlEncode(publicBytes.subarray(1, 33)),
      y: b64urlEncode(publicBytes.subarray(33, 65)),
    },
  });
}

/**
 * The `Authorization: vapid t=…, k=…` header for one push service origin.
 *
 * `aud` is the ORIGIN of the endpoint, never the full endpoint: the path
 * carries the subscription identifier, and RFC 8292 scopes the token to the
 * service, not to the subscriber.
 */
export function buildVapidAuthorization(
  endpoint: string,
  config: VapidConfig = readVapidConfig(),
  now: number = Date.now()
): string {
  const audience = new URL(endpoint).origin;

  const header = b64urlEncode(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64urlEncode(
    Buffer.from(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(now / 1000) + VAPID_TOKEN_TTL_SECONDS,
        sub: config.subject,
      })
    )
  );
  const signingInput = `${header}.${payload}`;

  // `ieee-p1363` gives the raw r‖s pair JWS requires; the DER default would
  // be silently rejected by every push service.
  const signature = cryptoSign('sha256', Buffer.from(signingInput), {
    key: vapidSigningKey(config),
    dsaEncoding: 'ieee-p1363',
  });

  return `vapid t=${signingInput}.${b64urlEncode(signature)}, k=${config.publicKey}`;
}

// ---------------------------------------------------------------------------
// aes128gcm
// ---------------------------------------------------------------------------

function hmacSha256(key: Buffer, data: Buffer): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

/** HKDF-Expand with a single output block, which is all RFC 8291 needs. */
function hkdfExpand(prk: Buffer, info: Buffer, length: number): Buffer {
  return hmacSha256(prk, Buffer.concat([info, Buffer.from([0x01])])).subarray(0, length);
}

export interface ClientKeys {
  /** base64url, the browser's `p256dh`: an uncompressed P-256 point. */
  p256dh: string;
  /** base64url, the browser's 16-byte `auth` secret. */
  auth: string;
}

export interface EncryptedPush {
  body: Buffer;
  salt: Buffer;
  serverPublicKey: Buffer;
}

/**
 * Encrypt one payload for one subscription. `salt` and `serverKeys` are
 * injectable so the round-trip test can pin RFC test vectors; production never
 * passes them and both are freshly random per notification.
 */
export function encryptPushPayload(
  payload: string,
  keys: ClientKeys,
  options: { salt?: Buffer; serverPrivateKey?: Buffer } = {}
): EncryptedPush {
  const uaPublic = b64urlDecode(keys.p256dh);
  const authSecret = b64urlDecode(keys.auth);

  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new Error('Subscription p256dh must be an uncompressed P-256 point');
  }
  if (authSecret.length !== 16) {
    throw new Error('Subscription auth secret must be 16 bytes');
  }

  const ecdh = createECDH('prime256v1');
  if (options.serverPrivateKey) ecdh.setPrivateKey(options.serverPrivateKey);
  else ecdh.generateKeys();

  const serverPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(uaPublic);
  const salt = options.salt ?? randomBytes(16);

  // RFC 8291 §3.4 — the auth secret is the HKDF salt for the IKM derivation,
  // and the key_info binds both public keys so a swapped key derives nothing.
  const prkKey = hmacSha256(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    uaPublic,
    serverPublic,
  ]);
  const ikm = hkdfExpand(prkKey, keyInfo, 32);

  const prk = hmacSha256(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);

  const plaintext = Buffer.from(payload, 'utf8');
  // 0x02 is RFC 8188's LAST-record delimiter. 0x01 would announce that another
  // record follows, and the receiver would wait for one that never arrives.
  const record = Buffer.concat([plaintext, Buffer.from([0x02])]);
  if (record.length + 16 > RECORD_SIZE) {
    throw new Error('Push payload exceeds a single aes128gcm record');
  }

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(RECORD_SIZE, 0);
  const header = Buffer.concat([
    salt,
    recordSize,
    Buffer.from([serverPublic.length]),
    serverPublic,
  ]);

  return { body: Buffer.concat([header, ciphertext]), salt, serverPublicKey: serverPublic };
}

// ---------------------------------------------------------------------------
// The POST
// ---------------------------------------------------------------------------

export interface PushSubscriptionKeys extends ClientKeys {
  endpoint: string;
}

export type PushDeliveryStatus = 'sent' | 'gone' | 'failed';

export interface PushDeliveryResult {
  status: PushDeliveryStatus;
  /** HTTP status from the push service, or null if the request never went. */
  httpStatus: number | null;
  /** Short reason, for the operational log. Never player-facing. */
  detail?: string;
}

/**
 * Deliver one encrypted notification.
 *
 * `gone` (404/410) means the subscription is dead at the push service — the
 * caller revokes the row rather than retrying forever. Every other non-2xx is
 * `failed`, which is retried on the next occurrence and never escalated into a
 * second notification for the same one.
 */
export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  payload: string,
  options: { ttlSeconds?: number; fetchImpl?: typeof fetch; now?: number } = {}
): Promise<PushDeliveryResult> {
  if (!PWA_V1_ENABLED) {
    return { status: 'failed', httpStatus: null, detail: 'flag-off' };
  }

  let config: VapidConfig;
  try {
    config = readVapidConfig();
  } catch (error) {
    return {
      status: 'failed',
      httpStatus: null,
      detail: error instanceof Error ? error.message : 'vapid-unconfigured',
    };
  }

  const body = encryptPushPayload(payload, subscription).body;
  const doFetch = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await doFetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: buildVapidAuthorization(subscription.endpoint, config, options.now),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(options.ttlSeconds ?? DEFAULT_TTL_SECONDS),
        // "normal" is the default and is stated anyway: `high` wakes a sleeping
        // device, and neither of the two triggers is worth waking anyone for.
        Urgency: 'normal',
      },
      body: new Uint8Array(body),
    });
  } catch (error) {
    return {
      status: 'failed',
      httpStatus: null,
      detail: error instanceof Error ? error.message : 'network-error',
    };
  }

  if (response.status === 404 || response.status === 410) {
    return { status: 'gone', httpStatus: response.status };
  }
  if (response.status >= 200 && response.status < 300) {
    return { status: 'sent', httpStatus: response.status };
  }
  return { status: 'failed', httpStatus: response.status, detail: `http-${response.status}` };
}

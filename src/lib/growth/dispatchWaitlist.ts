/**
 * The Dispatch waitlist state machine (Constitution §11.6).
 *
 * Double opt-in, expressed as pure functions so the one rule that matters
 * can be tested rather than trusted: **an address that has not confirmed is
 * never mailable.** `isMailable` is the only gate any sender may consult,
 * and it reads the confirmation timestamp, not the status string alone.
 *
 * Rule 7: the Dispatch is product news and settlement results. No message
 * built on this list is ever commercial, and every one carries the
 * unsubscribe link backed by `unsubscribeTokenHash`.
 */

import { createHash, randomBytes } from 'node:crypto';

export type WaitlistStatus = 'pending' | 'confirmed' | 'unsubscribed';

export interface WaitlistRow {
  id: string;
  email: string;
  status: WaitlistStatus;
  confirmationSentAt: string | null;
  confirmationExpiresAt: string | null;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
}

/** A confirmation link is good for 48 hours, then the address must ask again. */
export const CONFIRMATION_TTL_MS = 48 * 60 * 60 * 1000;

/** Minimum gap between confirmation emails to one address. */
export const CONFIRMATION_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Deliberately permissive: one @, no whitespace, a dot in the domain. Address
 * validity is settled by the confirmation email actually arriving, which is
 * the entire point of double opt-in — a stricter regex only rejects valid
 * exotic addresses.
 */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Normalise to the stored form, or null when it cannot be an address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (!EMAIL_PATTERN.test(email)) return null;
  return email;
}

/** A URL-safe single-use token. Only its digest is ever persisted. */
export function createToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Shape of a token as it appears in a link; rejects junk before any query. */
export function isWellFormedToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

export type SubscribeAction =
  /** No row for this address: create one and send the confirmation. */
  | 'create'
  /** A pending or previously unsubscribed row: issue a fresh token and send. */
  | 'reissue'
  /** Already confirmed: change nothing, send nothing, say the same thing. */
  | 'already-confirmed'
  /** A confirmation went out moments ago: do not send another. */
  | 'throttled';

/**
 * What a subscribe request should do. The caller returns an identical
 * response for every outcome — the endpoint must not disclose whether an
 * address is on the list.
 */
export function decideSubscribe(
  existing: WaitlistRow | null,
  now: Date = new Date(),
  cooldownMs: number = CONFIRMATION_COOLDOWN_MS
): SubscribeAction {
  if (!existing) return 'create';
  if (existing.status === 'confirmed') return 'already-confirmed';

  const sentAt = existing.confirmationSentAt
    ? Date.parse(existing.confirmationSentAt)
    : NaN;
  if (Number.isFinite(sentAt) && now.getTime() - sentAt < cooldownMs) {
    return 'throttled';
  }
  return 'reissue';
}

export type ConfirmOutcome =
  | 'confirmed'
  | 'already-confirmed'
  | 'expired'
  | 'invalid';

/**
 * What a confirmation attempt should do. A row is only promoted from a
 * `pending` status with an unexpired token — never from `unsubscribed`,
 * which must go back through a fresh subscribe request, and never from a
 * missing or mismatched token.
 */
export function decideConfirm(
  row: WaitlistRow | null,
  now: Date = new Date()
): ConfirmOutcome {
  if (!row) return 'invalid';
  if (row.status === 'confirmed') return 'already-confirmed';
  if (row.status !== 'pending') return 'invalid';

  const expiresAt = row.confirmationExpiresAt
    ? Date.parse(row.confirmationExpiresAt)
    : NaN;
  if (!Number.isFinite(expiresAt)) return 'invalid';
  if (now.getTime() > expiresAt) return 'expired';

  return 'confirmed';
}

/**
 * The only question a sender may ask. Confirmed status AND a confirmation
 * timestamp: either alone is insufficient, so a partially written row can
 * never be mailed.
 */
export function isMailable(row: WaitlistRow | null | undefined): boolean {
  if (!row) return false;
  return row.status === 'confirmed' && Boolean(row.confirmedAt);
}

/** Expiry stamp for a token minted now. */
export function confirmationExpiry(
  now: Date = new Date(),
  ttlMs: number = CONFIRMATION_TTL_MS
): string {
  return new Date(now.getTime() + ttlMs).toISOString();
}

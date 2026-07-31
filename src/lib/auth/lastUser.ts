/**
 * Last-user marker - prevents silent identity loss.
 *
 * Records who was signed in on this device so that, if the Supabase session
 * disappears (storage cleared, refresh token expired), we never silently
 * create a fresh anonymous account over a previous identity:
 * - previous user had an email account -> prompt "Welcome back, sign in"
 * - previous user was anonymous       -> warn progress may be unrecoverable
 */

export const LAST_USER_KEY = 'supasnake-last-user';
let lossNoticeShownThisDocument = false;

export interface LastUserMarker {
  userId: string;
  isAnonymous: boolean;
  /** Partially masked email for the "Welcome back" prompt (never full PII). */
  emailHint: string | null;
  updatedAt: string;
}

export type AnonymousSignInGate =
  /** No prior identity on this device - proceed silently. */
  | 'proceed'
  /** Prior registered account - block silent anonymous sign-in. */
  | 'welcome-back'
  /** Prior anonymous account lost - warn once before creating a new one. */
  | 'warn-progress-loss';

/** Mask an email for display: "jo***@example.com" */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

function getStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  try {
    // constitution-allow: local-progress  identity-loss guard stores account routing metadata, never progress
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readLastUser(storage?: Storage): LastUserMarker | null {
  const store = getStorage(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(LAST_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastUserMarker>;
    if (typeof parsed.userId !== 'string' || typeof parsed.isAnonymous !== 'boolean') {
      return null;
    }
    return {
      userId: parsed.userId,
      isAnonymous: parsed.isAnonymous,
      emailHint: typeof parsed.emailHint === 'string' ? parsed.emailHint : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function recordLastUser(
  user: { id: string; is_anonymous?: boolean; email?: string | null },
  storage?: Storage
): void {
  const store = getStorage(storage);
  if (!store) return;
  const marker: LastUserMarker = {
    userId: user.id,
    isAnonymous: user.is_anonymous ?? false,
    emailHint: maskEmail(user.email),
    updatedAt: new Date().toISOString(),
  };
  try {
    store.setItem(LAST_USER_KEY, JSON.stringify(marker));
  } catch {
    // Storage full/unavailable - marker is best-effort
  }
}

export function clearLastUser(storage?: Storage): void {
  lossNoticeShownThisDocument = false;
  const store = getStorage(storage);
  if (!store) return;
  try {
    store.removeItem(LAST_USER_KEY);
  } catch {
    // ignore
  }
}

/**
 * Decide what should happen before creating a NEW anonymous session.
 * Call only when there is currently no session.
 */
export function evaluateAnonymousSignInGate(
  marker: LastUserMarker | null,
  _storage?: Storage
): AnonymousSignInGate {
  if (!marker) return 'proceed';
  if (!marker.isAnonymous) return 'welcome-back';

  // Previous anonymous identity is gone - warn exactly once.
  if (lossNoticeShownThisDocument) return 'proceed';
  return 'warn-progress-loss';
}

/** Mark the one-time "previous progress may be unrecoverable" notice as shown. */
export function markProgressLossNoticed(_storage?: Storage): void {
  // Presentation memory only. A notice about server-account continuity is not
  // itself allowed to become browser-persistent progression state.
  lossNoticeShownThisDocument = true;
}

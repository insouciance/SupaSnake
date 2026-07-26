/**
 * The permission flow, as pure logic (Constitution Rule 1, Rule 5, §12.4).
 *
 * `Notification.requestPermission()` is a one-shot: a browser that has been
 * asked and refused will not ask again, and in most browsers an unprompted
 * request from a page the user did not interact with is silently denied and
 * burns the chance. So the request is only ever made from a deliberate click
 * on the settings panel, never on load, never on a timer, and never anywhere
 * a run could be live.
 *
 *   · RULE 1 — `canRequestPermission` refuses while a run is active AND
 *     refuses on any surface that is not the settings page. The panel is only
 *     mounted on `/settings`, so this is a second lock on a door that is
 *     already in a different building; it exists because "the permission
 *     request must be impossible mid-run" is a property worth being able to
 *     point at a function for.
 *
 *   · NO PRE-PROMPT ANYWHERE ELSE. There is no "enable notifications?"
 *     interstitial after a run, no toast, no badge on the settings link. A
 *     player finds this the way they find every other preference.
 *
 *   · CONSENT IS PER TRIGGER. Turning notifications on does not subscribe
 *     somebody to both; the panel sends the exact list of triggers ticked,
 *     and `validateSubscription` refuses an empty one. There is no
 *     "recommended" default and no pre-ticked box.
 *
 * `applicationServerKey` conversion lives here too, because the browser's
 * `pushManager.subscribe` wants raw bytes and the owner configures a base64url
 * string.
 */

import { PUSH_TRIGGER_IDS, type PushTriggerId } from '@/lib/push/triggers';

/** The surface the opt-in panel is allowed to exist on. Exactly one. */
export const PUSH_OPT_IN_SURFACE = '/settings';

export interface PermissionEligibility {
  flagEnabled: boolean;
  /** `'serviceWorker' in navigator && 'PushManager' in window`. */
  supported: boolean;
  pathname: string;
  /** The live game store. */
  runActive: boolean;
  /** `Notification.permission`. */
  permission: NotificationPermission | 'unsupported';
}

/**
 * May this click result in a `Notification.requestPermission()` call?
 *
 * `denied` returns false: the browser has already decided, asking again does
 * nothing, and the panel says so in words instead of firing a no-op.
 */
export function canRequestPermission(input: PermissionEligibility): boolean {
  if (!input.flagEnabled) return false;
  if (!input.supported) return false;
  if (input.runActive) return false;
  if (input.pathname !== PUSH_OPT_IN_SURFACE) return false;
  if (input.permission === 'denied' || input.permission === 'unsupported') return false;
  return true;
}

/**
 * The consented set, from what the panel has ticked. Filtered through the
 * permitted ids, so a stale client build cannot consent anybody into an id
 * this deployment does not recognise.
 */
export function consentedTriggers(selected: Iterable<string>): PushTriggerId[] {
  const wanted = new Set(selected);
  return PUSH_TRIGGER_IDS.filter((id) => wanted.has(id));
}

/**
 * base64url → the bytes `pushManager.subscribe` requires.
 *
 * Typed over an explicit `ArrayBuffer` rather than the default
 * `ArrayBufferLike`, because `BufferSource` excludes `SharedArrayBuffer` and
 * TypeScript is right to insist.
 */
export function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The panel's words, in one place so the Rule 5 and Rule 7 sweeps read exactly
 * what a player reads.
 *
 * Note what is absent: no count of what they would have received, no "players
 * who turn this on come back more", no consequence for leaving it off. The
 * last line states the ceiling plainly, because the honest thing to tell
 * somebody being asked for notification permission is how many they will get.
 */
export const PUSH_OPT_IN_COPY = {
  title: 'Notifications',
  intro:
    'Two things can reach your device, and only if you ask for them here. Nothing else ever will.',
  ceiling: 'At most one a week for the Serpent, and one a day for the Signal.',
  unsupported: 'This browser cannot show notifications. Everything still works without them.',
  blocked:
    'Your browser has notifications switched off for this site. You can change that in its site settings.',
  enable: 'Turn on',
  disable: 'Turn off',
  saveError: 'Could not save that. Please try again.',
} as const;

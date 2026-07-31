import type {
  GameOverGenome,
  SnakeTerminalReplayProof,
} from '@/lib/game/SnakeGameLogic';
import {
  parseImpactFromSettlement,
  recoverRunImpact,
  type RunImpactEnvelope,
} from '@/lib/game/runImpactClient';
import { isDurablyPendingSettlement } from '@/lib/game/settlementResponse';

/**
 * Tab-memory retry queue for unsent settlement requests.
 *
 * Progress must never be stored in localStorage, sessionStorage, IndexedDB,
 * or another client database. The authoritative run already exists on the
 * server; this queue only retries the end request while this JavaScript
 * context survives. If the server settled but the response was lost, receipt
 * recovery returns the canonical impact envelope instead of replaying a
 * client-authored account of progress.
 */

export const REWARD_OUTBOX_MAX_ENTRIES = 20;
export const REWARD_OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Read-only migration key used by production builds that predate the
 * server-owned settlement queue. New code never writes this key. It remains
 * named here solely so an already-stored run can reach the authoritative
 * endpoint before the obsolete browser copy is destroyed.
 */
export const LEGACY_REWARD_OUTBOX_KEY = 'supasnake-reward-outbox';

export interface RewardOutboxEntry {
  /** Account authority that produced this tab-memory claim. */
  ownerId?: string;
  sessionId: string;
  score: number;
  dna_earned: number;
  duration_seconds: number;
  food_count?: number;
  extracted?: boolean;
  mutations?: Array<{ id: string; atFood: number }>;
  phoenix_triggered_at_food?: number;
  cosmic?: {
    combo_dna_bonus: number;
    combo_score_bonus: number;
    max_chain: number;
  };
  genome?: GameOverGenome;
  /** In-memory exclusive lease for continuity-era runs; never persisted. */
  leaseToken?: string;
  /** Canonical replay evidence for continuity-era terminalization. */
  replay?: SnakeTerminalReplayProof;
  expectedRevision?: number;
  timestamp: number;
}

export interface ReplayResult {
  replayed: number;
  dropped: number;
  remaining: number;
  impacts: RunImpactEnvelope[];
  securedPendingSessionIds: string[];
}

let memoryQueue: RewardOutboxEntry[] = [];
let legacyDrainInFlight: { token: string; promise: Promise<ReplayResult> } | null = null;
// All tab-memory replays share one writer. Home, Game, `online`, and React
// Strict Mode may request a drain together; serializing the snapshot/reconcile
// section prevents an older replay from replacing entries queued while its
// network request was in flight.
let memoryReplayTail: Promise<void> = Promise.resolve();

function isValidEntry(value: unknown): value is RewardOutboxEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RewardOutboxEntry>;
  const replayValid = entry.replay === undefined || (
    typeof entry.replay === 'object' &&
    entry.replay !== null &&
    Number.isSafeInteger(entry.replay.fromTick) &&
    Number.isSafeInteger(entry.replay.toTick) &&
    entry.replay.fromTick >= 0 &&
    entry.replay.toTick >= entry.replay.fromTick &&
    Number.isSafeInteger(entry.replay.actionOffset) &&
    entry.replay.actionOffset >= 0 &&
    Array.isArray(entry.replay.actions) &&
    entry.replay.actions.every(
      (action, index, actions) =>
        Number.isSafeInteger(action?.tick) &&
        action.tick >= entry.replay!.fromTick &&
        action.tick <= entry.replay!.toTick &&
        (index === 0 || action.tick >= actions[index - 1].tick)
    )
  );
  return (
    typeof entry.sessionId === 'string' &&
    entry.sessionId.length > 0 &&
    (entry.ownerId === undefined ||
      (typeof entry.ownerId === 'string' && entry.ownerId.length > 0)) &&
    typeof entry.score === 'number' &&
    typeof entry.dna_earned === 'number' &&
    typeof entry.duration_seconds === 'number' &&
    typeof entry.timestamp === 'number' &&
    (entry.food_count === undefined || typeof entry.food_count === 'number') &&
    (entry.extracted === undefined || typeof entry.extracted === 'boolean') &&
    (entry.mutations === undefined || Array.isArray(entry.mutations)) &&
    (entry.phoenix_triggered_at_food === undefined ||
      typeof entry.phoenix_triggered_at_food === 'number') &&
    (entry.cosmic === undefined ||
      (typeof entry.cosmic === 'object' && entry.cosmic !== null)) &&
    (entry.genome === undefined ||
      (typeof entry.genome === 'object' && entry.genome !== null)) &&
    (entry.leaseToken === undefined ||
      (typeof entry.leaseToken === 'string' && entry.leaseToken.length >= 32)) &&
    replayValid &&
    (entry.expectedRevision === undefined ||
      (Number.isSafeInteger(entry.expectedRevision) && entry.expectedRevision >= 1)) &&
    (entry.replay === undefined ||
      (entry.expectedRevision !== undefined && entry.leaseToken !== undefined))
  );
}

/** Read a defensive copy of this tab's queue. */
export function readOutbox(): RewardOutboxEntry[] {
  return memoryQueue.map((entry) => ({ ...entry }));
}

function pruneMemoryQueue(now: number = Date.now()): void {
  memoryQueue = memoryQueue.filter(
    (entry) => now - entry.timestamp <= REWARD_OUTBOX_MAX_AGE_MS
  );
}

export function pruneOutbox(now: number = Date.now()): RewardOutboxEntry[] {
  pruneMemoryQueue(now);
  return readOutbox();
}

function entryAuthorityKey(entry: RewardOutboxEntry): string {
  return `${entry.ownerId ?? 'legacy'}:${entry.sessionId}`;
}

export function enqueueReward(entry: RewardOutboxEntry): void {
  if (!isValidEntry(entry)) return;
  pruneMemoryQueue();
  const key = entryAuthorityKey(entry);
  memoryQueue = memoryQueue.filter(
    (queued) => entryAuthorityKey(queued) !== key
  );
  memoryQueue.push({ ...entry });
  while (memoryQueue.length > REWARD_OUTBOX_MAX_ENTRIES) memoryQueue.shift();
}

export function clearOutbox(): void {
  memoryQueue = [];
}

async function responseImpact(
  response: Response,
  entry: RewardOutboxEntry,
  token: string,
  fetchFn: typeof fetch
): Promise<{
  impact: RunImpactEnvelope | null;
  securedPending: boolean;
  leaseConflict: boolean;
  canonical: boolean;
  reason: string | null;
}> {
  let reason: string | null = null;
  let alreadyEnded = false;
  try {
    const body = await response.json();
    const bodyRecord = body && typeof body === 'object'
      ? body as Record<string, unknown>
      : null;
    reason = typeof bodyRecord?.reason === 'string' ? bodyRecord.reason : null;
    alreadyEnded = bodyRecord?.alreadyEnded === true;
    if (
      reason === 'lease_conflict'
    ) {
      // This tab no longer owns the run. Retrying the stale terminal claim can
      // never succeed and must not be mistaken for an idempotent settlement.
      return {
        impact: null,
        securedPending: false,
        leaseConflict: true,
        canonical: false,
        reason,
      };
    }
    const direct = parseImpactFromSettlement(body);
    if (direct) {
      return {
        impact: direct,
        securedPending: false,
        leaseConflict: false,
        canonical: true,
        reason,
      };
    }
    // A 202 with this exact server contract means the immutable result is
    // already in the durable ingress. The browser must stop retrying and, for
    // a retired persisted queue, delete its local copy immediately. Receipt
    // recovery belongs to the server and may not exist until schema 061.
    if (isDurablyPendingSettlement(body)) {
      return {
        impact: null,
        securedPending: true,
        leaseConflict: false,
        canonical: true,
        reason,
      };
    }
  } catch {
    // A legacy or empty duplicate response still has a recovery path.
  }
  const recovered = await recoverRunImpact(entry.sessionId, token, fetchFn);
  return {
    impact: recovered,
    securedPending: false,
    leaseConflict: false,
    canonical: alreadyEnded || recovered !== null,
    reason,
  };
}

function browserStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  try {
    // constitution-allow: local-progress one-time migration reads only the retired reward key so server settlement can precede deletion
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readLegacyOutbox(storage?: Storage): {
  entries: RewardOutboxEntry[];
  keyPresent: boolean;
} {
  const store = browserStorage(storage);
  if (!store) return { entries: [], keyPresent: false };
  try {
    const raw = store.getItem(LEGACY_REWARD_OUTBOX_KEY);
    if (raw === null) return { entries: [], keyPresent: false };
    const parsed: unknown = JSON.parse(raw);
    return {
      entries: Array.isArray(parsed) ? parsed.filter(isValidEntry) : [],
      keyPresent: true,
    };
  } catch {
    // An unreadable legacy blob cannot be settled. Removing it is the only
    // direction that restores the no-browser-progress invariant.
    return { entries: [], keyPresent: true };
  }
}

function removeLegacyOutbox(storage?: Storage): void {
  const store = browserStorage(storage);
  if (!store) return;
  try {
    store.removeItem(LEGACY_REWARD_OUTBOX_KEY);
  } catch {
    // Hardened/private contexts may refuse storage access. Nothing new is
    // written, and the next page lifecycle makes the same destructive pass.
  }
}

async function submitEntry(
  entry: RewardOutboxEntry,
  token: string,
  fetchFn: typeof fetch,
  options: { preserveOwnershipMismatch?: boolean } = {}
): Promise<
  | {
      status: 'settled';
      impact: RunImpactEnvelope | null;
      securedPending: boolean;
    }
  | { status: 'transient' }
  | { status: 'rejected' }
> {
  try {
    const response = await fetchFn('/api/game/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(entry.replay
        ? {
            action: 'terminal',
            sessionId: entry.sessionId,
            replay: entry.replay,
            expectedRevision: entry.expectedRevision,
            leaseToken: entry.leaseToken,
          }
        : {
            action: 'end',
            sessionId: entry.sessionId,
            score: entry.score,
            dna_earned: entry.dna_earned,
            duration_seconds: entry.duration_seconds,
            died: !(entry.extracted === true),
            victory: false,
            ...(typeof entry.food_count === 'number'
              ? { food_count: entry.food_count }
              : {}),
            ...(entry.extracted !== undefined ? { extracted: entry.extracted } : {}),
            ...(entry.mutations !== undefined ? { mutations: entry.mutations } : {}),
            ...(entry.phoenix_triggered_at_food !== undefined
              ? { phoenix_triggered_at_food: entry.phoenix_triggered_at_food }
              : {}),
            ...(entry.genome !== undefined ? { genome: entry.genome } : {}),
            ...(entry.leaseToken !== undefined ? { leaseToken: entry.leaseToken } : {}),
          }),
    });

    if (response.ok || response.status === 409) {
      const impactResult = await responseImpact(response, entry, token, fetchFn);
      if (impactResult.leaseConflict) {
        console.error(
          `Settlement retry lost its run lease; dropping stale session ${entry.sessionId}`
        );
        return { status: 'rejected' };
      }
      if (response.status === 409 && !impactResult.canonical) {
        if (
          impactResult.reason === 'checkpoint_conflict' ||
          impactResult.reason === 'terminal_intent_required'
        ) {
          return { status: 'transient' };
        }
        return { status: 'rejected' };
      }
      return {
        status: 'settled',
        impact: impactResult.impact,
        securedPending: impactResult.securedPending,
      };
    }
    if (
      response.status === 401 ||
      response.status >= 500 ||
      (options.preserveOwnershipMismatch === true &&
        (response.status === 403 || response.status === 404))
    ) {
      return { status: 'transient' };
    }
    console.error(
      `Settlement retry rejected (status ${response.status}), dropping session ${entry.sessionId}`
    );
    return { status: 'rejected' };
  } catch (error) {
    console.error('Settlement retry network error:', error);
    return { status: 'transient' };
  }
}

/**
 * One-time production migration for queues written by older builds.
 *
 * The legacy value is never modified or extended. It is removed only after
 * every valid entry reached an authoritative terminal response, so a network
 * outage cannot turn the browser-storage cleanup into lost earned progress.
 * Successfully replayed entries may be sent again while another legacy entry
 * is transient; session settlement and receipt recovery are idempotent.
 */
async function drainLegacyRewardOutboxOnce(
  token: string,
  storage?: Storage,
  fetchFn: typeof fetch = fetch
): Promise<ReplayResult> {
  const legacy = readLegacyOutbox(storage);
  if (!legacy.keyPresent) {
    return {
      replayed: 0,
      dropped: 0,
      remaining: 0,
      impacts: [],
      securedPendingSessionIds: [],
    };
  }
  if (legacy.entries.length === 0) {
    removeLegacyOutbox(storage);
    return {
      replayed: 0,
      dropped: 0,
      remaining: 0,
      impacts: [],
      securedPendingSessionIds: [],
    };
  }

  let replayed = 0;
  let dropped = 0;
  let remaining = 0;
  const impacts: RunImpactEnvelope[] = [];
  const securedPendingSessionIds: string[] = [];
  for (const entry of legacy.entries) {
    // A retired queue predates account ownership metadata. A 403/404 under
    // account B therefore cannot prove account A's claim is invalid; retain
    // it so switching back to the originating account can complete recovery.
    const result = await submitEntry(entry, token, fetchFn, {
      preserveOwnershipMismatch: true,
    });
    if (result.status === 'settled') {
      replayed += 1;
      if (result.impact) impacts.push(result.impact);
      if (result.securedPending) securedPendingSessionIds.push(entry.sessionId);
    } else if (result.status === 'rejected') {
      dropped += 1;
    } else {
      remaining += 1;
    }
  }

  if (remaining === 0) removeLegacyOutbox(storage);
  return { replayed, dropped, remaining, impacts, securedPendingSessionIds };
}

export function drainLegacyRewardOutbox(
  token: string,
  storage?: Storage,
  fetchFn: typeof fetch = fetch
): Promise<ReplayResult> {
  // React Strict Mode, token refresh, Home and Game can all request the
  // migration at once. Coalesce only the real browser/default-fetch path;
  // explicit test/injected transports remain independently observable.
  const coalesce = storage === undefined && fetchFn === fetch;
  if (coalesce && legacyDrainInFlight?.token === token) {
    return legacyDrainInFlight.promise;
  }
  const promise = drainLegacyRewardOutboxOnce(token, storage, fetchFn);
  if (!coalesce) return promise;
  legacyDrainInFlight = { token, promise };
  const clear = () => {
    if (legacyDrainInFlight?.promise === promise) legacyDrainInFlight = null;
  };
  void promise.then(clear, clear);
  return promise;
}

/**
 * Retry this tab's queued settlements. 2xx and already-settled 409 responses
 * both recover the canonical receipt. Only transient failures remain queued.
 */
async function replayRewardOutboxOnce(
  token: string,
  fetchFn: typeof fetch = fetch,
  ownerId?: string
): Promise<ReplayResult> {
  pruneMemoryQueue();
  // Preserve object identity for the final compare-and-reconcile. An entry
  // enqueued while these requests are in flight is a different object and is
  // therefore never removed by this replay's outcome.
  const allEntries = [...memoryQueue];
  // New claims are account-keyed. When an authority is supplied, never send
  // another account's terminal payload under this token and never remove it
  // because that expected ownership check answered 404. Ownerless entries are
  // retained for the old in-memory bundle to lose naturally on reload; the
  // separately handled legacy-storage migration has its own explicit drain.
  const entries = allEntries.filter((entry) =>
    ownerId === undefined ? entry.ownerId === undefined : entry.ownerId === ownerId
  );
  const untouched = allEntries.filter((entry) => !entries.includes(entry));
  if (entries.length === 0) {
    return {
      replayed: 0,
      dropped: 0,
      remaining: untouched.length,
      impacts: [],
      securedPendingSessionIds: [],
    };
  }

  let replayed = 0;
  let dropped = 0;
  const impacts: RunImpactEnvelope[] = [];
  const securedPendingSessionIds: string[] = [];
  const outcomes = new Map<RewardOutboxEntry, 'remove' | 'keep'>();

  for (const entry of entries) {
    const result = await submitEntry(entry, token, fetchFn);
    if (result.status === 'settled') {
      replayed += 1;
      outcomes.set(entry, 'remove');
      if (result.impact) impacts.push(result.impact);
      if (result.securedPending) securedPendingSessionIds.push(entry.sessionId);
    } else if (result.status === 'rejected') {
      dropped += 1;
      outcomes.set(entry, 'remove');
    } else {
      outcomes.set(entry, 'keep');
    }
  }

  pruneMemoryQueue();
  memoryQueue = memoryQueue.filter((entry) => outcomes.get(entry) !== 'remove');
  return {
    replayed,
    dropped,
    remaining: memoryQueue.length,
    impacts,
    securedPendingSessionIds,
  };
}

export function replayRewardOutbox(
  token: string,
  fetchFn: typeof fetch = fetch,
  ownerId?: string
): Promise<ReplayResult> {
  const run = memoryReplayTail.then(
    () => replayRewardOutboxOnce(token, fetchFn, ownerId),
    () => replayRewardOutboxOnce(token, fetchFn, ownerId)
  );
  memoryReplayTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

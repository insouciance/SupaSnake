import type { GameOverGenome } from '@/lib/game/SnakeGameLogic';

/**
 * Reward Outbox - localStorage-backed queue of unsent game-session-end
 * payloads.
 *
 * When the game-over POST to /api/game/session fails (tab closed at death,
 * network drop, expired token), the run's rewards are queued here and
 * replayed on the next app load with a fresh token. The server dedupes by
 * sessionId (an already-ended session returns 409), so replays are safe.
 */

export const REWARD_OUTBOX_KEY = 'supasnake-reward-outbox';

/** Queue is capped; oldest entries are dropped first. */
export const REWARD_OUTBOX_MAX_ENTRIES = 20;

/** Entries older than this are considered expired and dropped. */
export const REWARD_OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface RewardOutboxEntry {
  sessionId: string;
  score: number;
  dna_earned: number;
  duration_seconds: number;
  /**
   * Raw foods eaten (Design v2). Optional so entries queued by older
   * builds still replay - the server falls back to legacy validation
   * when it is absent.
   */
  food_count?: number;
  /** True when the run ended through the exit portal (Design v2). */
  extracted?: boolean;
  /** Mutation picks in order (Design v2 Phase 2); optional for old entries. */
  mutations?: Array<{ id: string; atFood: number }>;
  /** Phoenix trigger food index, when it fired (Phase 2). */
  phoenix_triggered_at_food?: number;
  /** COSMIC bounded-trust combo summary (Phase 2). */
  cosmic?: {
    combo_dna_bonus: number;
    combo_score_bonus: number;
    max_chain: number;
  };
  /** Genome-only trace. Required to replay a run_seed-backed session. */
  genome?: GameOverGenome;
  /** Epoch ms when the run ended (used for expiry). */
  timestamp: number;
}

export interface ReplayResult {
  replayed: number;
  /** Entries dropped as permanently rejected (4xx) or expired. */
  dropped: number;
  /** Entries kept for a future attempt (network / 5xx / 401). */
  remaining: number;
}

function getStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function isValidEntry(e: unknown): e is RewardOutboxEntry {
  if (!e || typeof e !== 'object') return false;
  const entry = e as Partial<RewardOutboxEntry>;
  return (
    typeof entry.sessionId === 'string' &&
    entry.sessionId.length > 0 &&
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
      (typeof entry.genome === 'object' && entry.genome !== null))
  );
}

export function readOutbox(storage?: Storage): RewardOutboxEntry[] {
  const store = getStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(REWARD_OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

function writeOutbox(entries: RewardOutboxEntry[], storage?: Storage): void {
  const store = getStorage(storage);
  if (!store) return;
  try {
    if (entries.length === 0) {
      store.removeItem(REWARD_OUTBOX_KEY);
    } else {
      store.setItem(REWARD_OUTBOX_KEY, JSON.stringify(entries));
    }
  } catch (err) {
    console.error('Reward outbox write failed:', err);
  }
}

/** Drop expired entries; returns the fresh queue. */
export function pruneOutbox(storage?: Storage, now: number = Date.now()): RewardOutboxEntry[] {
  const entries = readOutbox(storage);
  const fresh = entries.filter((e) => now - e.timestamp <= REWARD_OUTBOX_MAX_AGE_MS);
  if (fresh.length !== entries.length) {
    writeOutbox(fresh, storage);
  }
  return fresh;
}

/**
 * Queue an unsent session-end payload. Dedupes by sessionId and caps the
 * queue at REWARD_OUTBOX_MAX_ENTRIES (oldest dropped first).
 */
export function enqueueReward(entry: RewardOutboxEntry, storage?: Storage): void {
  if (!isValidEntry(entry)) return;
  const entries = pruneOutbox(storage, Date.now()).filter(
    (e) => e.sessionId !== entry.sessionId
  );
  entries.push(entry);
  while (entries.length > REWARD_OUTBOX_MAX_ENTRIES) {
    entries.shift();
  }
  writeOutbox(entries, storage);
}

export function clearOutbox(storage?: Storage): void {
  writeOutbox([], storage);
}

/**
 * Replay all queued entries against /api/game/session with the given token.
 *
 * Per entry:
 * - 2xx  -> delivered, removed
 * - 409  -> session already ended (server dedupe), removed
 * - 401  -> token problem, kept for a future replay with a fresh token
 * - other 4xx -> permanently rejected, removed
 * - network error / 5xx -> kept for a future replay
 */
export async function replayRewardOutbox(
  token: string,
  storage?: Storage,
  fetchFn: typeof fetch = fetch
): Promise<ReplayResult> {
  const entries = pruneOutbox(storage, Date.now());
  if (entries.length === 0) {
    return { replayed: 0, dropped: 0, remaining: 0 };
  }

  let replayed = 0;
  let dropped = 0;
  const keep: RewardOutboxEntry[] = [];

  for (const entry of entries) {
    try {
      const response = await fetchFn('/api/game/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'end',
          sessionId: entry.sessionId,
          score: entry.score,
          dna_earned: entry.dna_earned,
          duration_seconds: entry.duration_seconds,
          died: !(entry.extracted === true),
          victory: false,
          // Design v2 fields; omitted for entries queued by older builds
          // (the server then uses its legacy validation path)
          ...(typeof entry.food_count === 'number'
            ? { food_count: entry.food_count }
            : {}),
          ...(entry.extracted !== undefined ? { extracted: entry.extracted } : {}),
          // Phase 2 fields (mutations / Phoenix / COSMIC combo claim)
          ...(entry.mutations !== undefined ? { mutations: entry.mutations } : {}),
          ...(entry.phoenix_triggered_at_food !== undefined
            ? { phoenix_triggered_at_food: entry.phoenix_triggered_at_food }
            : {}),
          ...(entry.cosmic !== undefined ? { cosmic: entry.cosmic } : {}),
          ...(entry.genome !== undefined ? { genome: entry.genome } : {}),
        }),
      });

      if (response.ok || response.status === 409) {
        replayed += response.ok ? 1 : 0;
        dropped += response.ok ? 0 : 1;
      } else if (response.status === 401 || response.status >= 500) {
        keep.push(entry);
      } else {
        // Permanent 4xx rejection - retrying will never succeed
        console.error(
          `Reward outbox entry rejected (status ${response.status}), dropping session ${entry.sessionId}`
        );
        dropped += 1;
      }
    } catch (err) {
      // Network failure - keep for next load
      console.error('Reward outbox replay network error:', err);
      keep.push(entry);
    }
  }

  writeOutbox(keep, storage);
  return { replayed, dropped, remaining: keep.length };
}

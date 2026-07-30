import type { GameOverGenome } from '@/lib/game/SnakeGameLogic';
import {
  parseImpactFromSettlement,
  recoverRunImpact,
  type RunImpactEnvelope,
} from '@/lib/game/runImpactClient';

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

export interface RewardOutboxEntry {
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
  timestamp: number;
}

export interface ReplayResult {
  replayed: number;
  dropped: number;
  remaining: number;
  impacts: RunImpactEnvelope[];
}

let memoryQueue: RewardOutboxEntry[] = [];

function isValidEntry(value: unknown): value is RewardOutboxEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RewardOutboxEntry>;
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

/** Read a defensive copy of this tab's queue. */
export function readOutbox(): RewardOutboxEntry[] {
  return memoryQueue.map((entry) => ({ ...entry }));
}

export function pruneOutbox(now: number = Date.now()): RewardOutboxEntry[] {
  memoryQueue = memoryQueue.filter(
    (entry) => now - entry.timestamp <= REWARD_OUTBOX_MAX_AGE_MS
  );
  return readOutbox();
}

export function enqueueReward(entry: RewardOutboxEntry): void {
  if (!isValidEntry(entry)) return;
  memoryQueue = pruneOutbox().filter(
    (queued) => queued.sessionId !== entry.sessionId
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
): Promise<RunImpactEnvelope | null> {
  try {
    const body = await response.json();
    const direct = parseImpactFromSettlement(body);
    if (direct) return direct;
  } catch {
    // A legacy or empty duplicate response still has a recovery path.
  }
  return recoverRunImpact(entry.sessionId, token, fetchFn);
}

/**
 * Retry this tab's queued settlements. 2xx and already-settled 409 responses
 * both recover the canonical receipt. Only transient failures remain queued.
 */
export async function replayRewardOutbox(
  token: string,
  fetchFn: typeof fetch = fetch
): Promise<ReplayResult> {
  const entries = pruneOutbox();
  if (entries.length === 0) {
    return { replayed: 0, dropped: 0, remaining: 0, impacts: [] };
  }

  let replayed = 0;
  let dropped = 0;
  const impacts: RunImpactEnvelope[] = [];
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
          ...(typeof entry.food_count === 'number'
            ? { food_count: entry.food_count }
            : {}),
          ...(entry.extracted !== undefined ? { extracted: entry.extracted } : {}),
          ...(entry.mutations !== undefined ? { mutations: entry.mutations } : {}),
          ...(entry.phoenix_triggered_at_food !== undefined
            ? { phoenix_triggered_at_food: entry.phoenix_triggered_at_food }
            : {}),
          ...(entry.genome !== undefined ? { genome: entry.genome } : {}),
        }),
      });

      if (response.ok || response.status === 409) {
        replayed += 1;
        const impact = await responseImpact(response, entry, token, fetchFn);
        if (impact) impacts.push(impact);
      } else if (response.status === 401 || response.status >= 500) {
        keep.push(entry);
      } else {
        console.error(
          `Settlement retry rejected (status ${response.status}), dropping session ${entry.sessionId}`
        );
        dropped += 1;
      }
    } catch (error) {
      console.error('Settlement retry network error:', error);
      keep.push(entry);
    }
  }

  memoryQueue = keep;
  return { replayed, dropped, remaining: keep.length, impacts };
}

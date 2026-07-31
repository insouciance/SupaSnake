import type { GameSessionStartPayload } from '@/lib/ftue/launchFlow';
import {
  SNAKE_RULES_VERSION,
  type SnakeCheckpointV1,
} from '@/lib/game/SnakeGameLogic';

export type RunContinuityPhase =
  | 'preparing'
  | 'prepared'
  | 'active'
  | 'settling'
  | 'incompatible'
  | 'legacy';

export class RunContinuityClientError extends Error {
  constructor(
    message: string,
    public readonly reason: string | null,
    public readonly status: number
  ) {
    super(message);
    this.name = 'RunContinuityClientError';
  }
}

/**
 * Async recovery belongs to the auth/session identity that started it. A late
 * response from a signed-out or switched account must never enter the board.
 */
export function matchesContinuityAuthority(
  expectedToken: string,
  currentToken: string | null | undefined,
  expectedSessionId?: string,
  currentSessionId?: string | null,
  expectedUserId?: string,
  currentUserId?: string | null
): boolean {
  // User identity is the stable authority across an ordinary access-token
  // refresh. Callers that do not have the user id retain the stricter token
  // comparison. In both cases a switched account is rejected.
  const authMatches = expectedUserId === undefined
    ? expectedToken.length > 0 && currentToken === expectedToken
    : expectedUserId.length > 0 && currentUserId === expectedUserId;
  return authMatches &&
    (expectedSessionId === undefined || currentSessionId === expectedSessionId);
}

export interface ActiveRunView {
  sessionId: string;
  phase: RunContinuityPhase;
  startedAt: string;
  activatedAt: string | null;
  energyCommitted: number;
  canContinue: boolean;
  requiresAbandon: boolean;
  manifest: GameSessionStartPayload | null;
  checkpoint: SnakeCheckpointV1 | null;
  checkpointRevision: number;
  checkpointSavedAt: string | null;
  leaseToken: string | null;
  leaseEpoch: number;
}

function responseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseActiveRun(value: unknown): ActiveRunView | null {
  const row = responseRecord(value);
  if (
    typeof row.sessionId !== 'string' ||
    !['preparing', 'prepared', 'active', 'settling', 'incompatible', 'legacy'].includes(String(row.phase))
  ) {
    return null;
  }
  const manifest = responseRecord(row.manifest);
  const checkpoint = responseRecord(row.checkpoint);
  return {
    sessionId: row.sessionId,
    phase: row.phase as RunContinuityPhase,
    startedAt: typeof row.startedAt === 'string' ? row.startedAt : '',
    activatedAt: typeof row.activatedAt === 'string' ? row.activatedAt : null,
    energyCommitted: Math.max(0, Number(row.energyCommitted) || 0),
    canContinue: row.canContinue === true,
    requiresAbandon: row.requiresAbandon === true,
    manifest:
      typeof manifest.sessionId === 'string'
        ? (manifest as GameSessionStartPayload)
        : null,
    checkpoint:
      checkpoint.version === 1 &&
      checkpoint.engineVersion === 'snake-engine-v1' &&
      checkpoint.rulesVersion === SNAKE_RULES_VERSION
        ? (checkpoint as unknown as SnakeCheckpointV1)
        : null,
    checkpointRevision: Math.max(0, Number(row.checkpointRevision) || 0),
    checkpointSavedAt:
      typeof row.checkpointSavedAt === 'string' ? row.checkpointSavedAt : null,
    leaseToken: typeof row.leaseToken === 'string' ? row.leaseToken : null,
    leaseEpoch: Math.max(0, Number(row.leaseEpoch) || 0),
  };
}

export function createRunStartRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi?.getRandomValues !== 'function') {
    throw new Error('Secure run-start IDs are unavailable in this browser');
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
}

async function jsonRecord(response: Response): Promise<Record<string, unknown>> {
  try {
    return responseRecord(await response.json());
  } catch {
    return {};
  }
}

function responseError(
  response: Response,
  body: Record<string, unknown>,
  fallback: string
): RunContinuityClientError {
  return new RunContinuityClientError(
    typeof body.error === 'string' ? body.error : fallback,
    typeof body.reason === 'string' ? body.reason : null,
    response.status
  );
}

export async function fetchActiveRun(
  accessToken: string,
  fetcher: typeof fetch = fetch
): Promise<ActiveRunView | null> {
  const response = await fetcher('/api/game/session', {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await jsonRecord(response);
  if (!response.ok) {
    throw responseError(response, body, 'Could not read the active run');
  }
  return parseActiveRun(body.activeRun);
}

export async function activatePreparedRun(
  accessToken: string,
  sessionId: string,
  openingCheckpoint: SnakeCheckpointV1,
  fetcher: typeof fetch = fetch
): Promise<ActiveRunView> {
  const response = await fetcher('/api/game/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: 'activate',
      sessionId,
      checkpoint: openingCheckpoint,
    }),
  });
  const body = await jsonRecord(response);
  if (!response.ok) {
    throw responseError(response, body, 'Could not activate the run');
  }
  const activeRun = parseActiveRun(body.activeRun);
  if (!activeRun || activeRun.phase !== 'active') {
    throw new Error('Run activation returned incomplete data');
  }
  return activeRun;
}

export async function resumeCheckpointedRun(
  accessToken: string,
  sessionId: string,
  fetcher: typeof fetch = fetch
): Promise<ActiveRunView> {
  const response = await fetcher('/api/game/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action: 'resume', sessionId }),
  });
  const body = await jsonRecord(response);
  if (!response.ok) {
    throw responseError(response, body, 'Could not resume the run');
  }
  const activeRun = parseActiveRun(body.activeRun);
  if (
    !activeRun ||
    activeRun.phase !== 'active' ||
    !activeRun.checkpoint ||
    !activeRun.manifest ||
    !activeRun.leaseToken
  ) {
    throw new Error('Run resume returned incomplete state');
  }
  return activeRun;
}

export interface CheckpointReceipt {
  revision: number;
  savedAt: string;
}

/**
 * One in-flight write plus one replaceable latest proposal. Every caller gets
 * a completion promise, but bursts never retain an unbounded chain of full
 * board snapshots in memory.
 */
export class LatestOnlyAsyncQueue<T> {
  private active = false;
  private pending: {
    value: T;
    waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>;
  } | null = null;

  constructor(private readonly write: (value: T) => Promise<void>) {}

  enqueue(value: T): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      if (this.pending) {
        this.pending.value = value;
        this.pending.waiters.push({ resolve, reject });
      } else {
        this.pending = { value, waiters: [{ resolve, reject }] };
      }
    });
    void this.drain();
    return promise;
  }

  private async drain(): Promise<void> {
    if (this.active) return;
    this.active = true;
    try {
      while (this.pending) {
        const proposal = this.pending;
        this.pending = null;
        try {
          await this.write(proposal.value);
          proposal.waiters.forEach(({ resolve }) => resolve());
        } catch (error) {
          proposal.waiters.forEach(({ reject }) => reject(error));
        }
      }
    } finally {
      this.active = false;
      // A proposal can arrive after the loop observes null but before this
      // finally runs. Re-enter rather than leaving it stranded.
      if (this.pending) void this.drain();
    }
  }
}

export async function saveActiveRunCheckpoint(
  accessToken: string,
  sessionId: string,
  expectedRevision: number,
  checkpoint: SnakeCheckpointV1,
  leaseToken: string,
  options: {
    fetcher?: typeof fetch;
    keepalive?: boolean;
    signal?: AbortSignal;
  } = {}
): Promise<CheckpointReceipt> {
  const response = await (options.fetcher ?? fetch)('/api/game/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    keepalive: options.keepalive === true,
    signal: options.signal,
    body: JSON.stringify({
      action: 'checkpoint',
      sessionId,
      expectedRevision,
      checkpoint,
      leaseToken,
    }),
  });
  const body = await jsonRecord(response);
  if (!response.ok) {
    throw responseError(response, body, 'Could not secure the run checkpoint');
  }
  const receipt = responseRecord(body.checkpoint);
  const revision = Number(receipt.revision);
  if (!Number.isSafeInteger(revision) || revision < 1 || typeof receipt.savedAt !== 'string') {
    throw new Error('Run checkpoint returned an incomplete receipt');
  }
  return { revision, savedAt: receipt.savedAt };
}

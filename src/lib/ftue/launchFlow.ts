import type { FtueBootstrapResponse } from './types';

export type LaunchPhase =
  | 'idle'
  | 'authenticating'
  | 'bootstrapping'
  | 'loading-run'
  | 'board-ready'
  | 'failed';

export interface LaunchState {
  phase: LaunchPhase;
  error: string | null;
}

export type LaunchEvent =
  | { type: 'BEGIN'; alreadyAuthenticated: boolean }
  | { type: 'AUTHENTICATED' }
  | { type: 'BOOTSTRAPPED' }
  | { type: 'RUN_LOADED' }
  | { type: 'FAIL'; error: string }
  | { type: 'RESET' };

export const INITIAL_LAUNCH_STATE: LaunchState = { phase: 'idle', error: null };

/**
 * Pure transition function used by Home. Invalid/stale completion events are
 * ignored, which prevents a late request from skipping a launch prerequisite.
 */
export function transitionLaunch(
  state: LaunchState,
  event: LaunchEvent
): LaunchState {
  if (event.type === 'FAIL') return { phase: 'failed', error: event.error };
  if (event.type === 'RESET') return INITIAL_LAUNCH_STATE;

  switch (state.phase) {
    case 'idle':
    case 'failed':
      return event.type === 'BEGIN'
        ? {
            phase: event.alreadyAuthenticated ? 'bootstrapping' : 'authenticating',
            error: null,
          }
        : state;
    case 'authenticating':
      return event.type === 'AUTHENTICATED'
        ? { phase: 'bootstrapping', error: null }
        : state;
    case 'bootstrapping':
      return event.type === 'BOOTSTRAPPED'
        ? { phase: 'loading-run', error: null }
        : state;
    case 'loading-run':
      return event.type === 'RUN_LOADED'
        ? { phase: 'board-ready', error: null }
        : state;
    case 'board-ready':
      return state;
  }
}

export const LAUNCH_PHASE_LABEL: Record<LaunchPhase, string> = {
  idle: 'Launch',
  authenticating: 'Launching…',
  bootstrapping: 'Launching…',
  'loading-run': 'Launching…',
  'board-ready': 'Launching…',
  failed: 'Retry',
};

export interface GameSessionStartPayload {
  sessionId: string;
  /** Server-authoritative recovered stock and immutable run commitment. */
  energy?: {
    state: 'charged' | 'lean' | 'exempt';
    available: number;
    capacity: number;
    recoveryIntervalSeconds: number;
    recoveryStartedAt: string;
    nextRecoveryAt: string | null;
    recoveryProgress: number;
    serverNow: string;
    committed: number;
    commitmentMultiplierBps: number;
    remaining: number;
    perDay: number;
    usedToday: number;
    day: string;
    refillsAt: string | null;
    visible: boolean;
  };
  /** Compatibility alias during migration 059 rollout. */
  charge?: GameSessionStartPayload['energy'];
  freePlay?: boolean;
  traits?: unknown;
  mutationPool?: unknown;
  mastery?: unknown;
  anomaly?: unknown;
  genome?: unknown;
  gauntletBan?: unknown;
  [key: string]: unknown;
}

export interface LaunchHandoff {
  version: 1;
  createdAt: number;
  userId: string;
  mode: 'earn' | 'free';
  bootstrap: FtueBootstrapResponse;
  run: GameSessionStartPayload;
}

type Fetcher = typeof fetch;

export class LaunchFlowError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'LaunchFlowError';
  }
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function bootstrapForLaunch(
  accessToken: string,
  fetcher: Fetcher = fetch
): Promise<FtueBootstrapResponse> {
  const response = await fetcher('/api/player/bootstrap', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await responseBody(response);

  if (!response.ok) {
    throw new LaunchFlowError(
      typeof body.error === 'string' ? body.error : 'Could not prepare your player',
      response.status
    );
  }

  const bootstrap = body as unknown as FtueBootstrapResponse;
  if (
    bootstrap.ftueV2 !== true ||
    !bootstrap.equippedSnake?.id ||
    !bootstrap.player?.id
  ) {
    throw new LaunchFlowError('Player setup returned incomplete data');
  }
  return bootstrap;
}

async function startSession(
  accessToken: string,
  snakeId: string,
  mode: 'earn' | 'free',
  fetcher: Fetcher,
  signalObjectiveId?: string
): Promise<GameSessionStartPayload> {
  // Constitution §7.2 / §8.6: taking the day's Signal and starting the run it
  // is taken for are ONE act. Migration 049's `begin_signal_objective_run`
  // binds the day's attempt to an OPEN run, and the charge is decided in the
  // same request — so the objective travels with the START, as a lookup key
  // among the day's server-derived three. Taking it in a separate call after
  // an ordinary start would burn a charge on the run §8.6 makes exempt.
  //
  // `mode: 'signal'` is a REQUEST, never a grant: the server derives the day,
  // resolves the id among that day's three and confirms this run owns the
  // day's one attempt. Miss any of those and it is an ordinary run, which is
  // why nothing here reads the answer back as permission.
  const signalRun = typeof signalObjectiveId === 'string' && signalObjectiveId.length > 0;
  const response = await fetcher('/api/game/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(
      signalRun
        ? { action: 'start', mode: 'signal', signalObjectiveId, snake_id: snakeId }
        : { action: 'start', mode, snake_id: snakeId }
    ),
  });
  const body = await responseBody(response);

  if (!response.ok) {
    throw new LaunchFlowError(
      typeof body.error === 'string' ? body.error : 'Could not load the run',
      response.status,
      typeof body.retryAfterMs === 'number' ? body.retryAfterMs : undefined
    );
  }
  if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) {
    throw new LaunchFlowError('Run setup returned incomplete data');
  }

  return body as unknown as GameSessionStartPayload;
}

export async function prepareLaunchHandoff(
  accessToken: string,
  userId: string,
  bootstrap: FtueBootstrapResponse,
  fetcher: Fetcher = fetch,
  /**
   * The Signal objective the player took on Home, if they took one (§7.2).
   * Absent on an ordinary LAUNCH, which is every launch the Signal surface was
   * not used for — so this parameter can never make an ordinary run a Signal
   * run by default.
   */
  signalObjectiveId?: string
): Promise<LaunchHandoff> {
  // One-click Launch is always an EARNING run (Constitution §8.6). It used
  // to inspect the player's energy and silently hand them a practice run
  // instead when the bar was empty, plus a retry-as-free recovery for the
  // "Not enough energy" 400. Both are gone with the gate that produced
  // them: the server no longer rejects a start for lack of charges, so
  // there is no race to recover from and no reason to demote the player's
  // run without asking.
  const mode: 'earn' | 'free' = 'earn';

  const run: GameSessionStartPayload = await startSession(
    accessToken,
    bootstrap.equippedSnake.id,
    mode,
    fetcher,
    signalObjectiveId
  );

  return {
    version: 1,
    createdAt: Date.now(),
    userId,
    mode,
    bootstrap,
    run,
  };
}

const LAUNCH_HANDOFF_MAX_AGE_MS = 5 * 60 * 1000;
let pendingLaunchHandoff: string | null = null;

/** The client-side handoff channel is page memory, never browser storage. */
export function launchHandoffStorageAvailable(): boolean {
  return typeof window !== 'undefined';
}

export function storeLaunchHandoff(handoff: LaunchHandoff): boolean {
  try {
    pendingLaunchHandoff = JSON.stringify(handoff);
    return true;
  } catch {
    return false;
  }
}

/** Consume-on-read prevents back navigation from reusing a prepared run. */
export function consumeLaunchHandoff(
  expectedUserId: string,
  now = Date.now()
): LaunchHandoff | null {
  const raw = pendingLaunchHandoff;
  pendingLaunchHandoff = null;
  if (!raw) return null;

  try {
    const handoff = JSON.parse(raw) as Partial<LaunchHandoff>;
    if (
      handoff.version !== 1 ||
      handoff.userId !== expectedUserId ||
      typeof handoff.createdAt !== 'number' ||
      now - handoff.createdAt < 0 ||
      now - handoff.createdAt > LAUNCH_HANDOFF_MAX_AGE_MS ||
      !handoff.bootstrap?.equippedSnake?.id ||
      !handoff.run?.sessionId ||
      (handoff.mode !== 'earn' && handoff.mode !== 'free')
    ) {
      return null;
    }
    return handoff as LaunchHandoff;
  } catch {
    return null;
  }
}

/** Read-only diagnostic for UI tests; returns a detached copy. */
export function peekLaunchHandoff(): LaunchHandoff | null {
  if (!pendingLaunchHandoff) return null;
  try {
    return JSON.parse(pendingLaunchHandoff) as LaunchHandoff;
  } catch {
    return null;
  }
}

/** Clear the page-memory channel on auth boundaries and between tests. */
export function clearLaunchHandoff(): void {
  pendingLaunchHandoff = null;
}

/**
 * The server has accepted, validated and durably frozen this earning result,
 * but one or more exact-once progression stages still need to finish. This is
 * terminal for every client retry queue: the server owns recovery from here.
 */
export function isDurablyPendingSettlement(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  return response.accepted === true &&
    response.pendingSettlement === true &&
    response.clientRetryRequired === false;
}

/** A generic `alreadyEnded` response is not proof that a run paid. Only the
 * lifecycle's explicit completed reason may acknowledge settlement without an
 * impact receipt; abandonment, expiry and disconnection are zero-reward ends. */
export function isCanonicalCompletedSettlement(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  return response.alreadyEnded === true && response.endReason === 'completed';
}

/**
 * Rewardless practice has no Career impact envelope, but it still needs one
 * server-authored terminal receipt. This compact result is sufficient to keep
 * direct completion, tab-memory retry, and reload recovery on identical score
 * and outcome truth without pretending practice created progression.
 */
export interface FreePlaySettlementResult {
  sessionId: string;
  score: number;
  outcome: 'extracted' | 'crashed';
  dnaCredited: 0;
  yieldDna: number;
  hypotheticalDna: number;
  valid: boolean;
  ascendance: unknown | null;
  genome: unknown | null;
  playerDna: number | null;
}

function responseRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function parseFreePlaySettlementResult(
  value: unknown,
  expectedSessionId?: string
): FreePlaySettlementResult | null {
  const response = responseRecord(value);
  const validation = responseRecord(response?.validation);
  const player = responseRecord(response?.player);
  if (
    response?.success !== true ||
    response.freePlay !== true ||
    typeof response.sessionId !== 'string' ||
    (expectedSessionId !== undefined && response.sessionId !== expectedSessionId) ||
    validation?.extracted !== true && validation?.extracted !== false
  ) return null;
  const score = finiteNonNegative(validation.score);
  const yieldDna = finiteNonNegative(validation.yieldDna);
  const hypotheticalDna = finiteNonNegative(response.hypotheticalDna);
  if (score === null || yieldDna === null || hypotheticalDna === null) return null;
  return {
    sessionId: response.sessionId,
    score,
    outcome: validation.extracted === true ? 'extracted' : 'crashed',
    dnaCredited: 0,
    yieldDna,
    hypotheticalDna,
    valid: validation.valid === true,
    ascendance: validation.ascendance ?? null,
    genome: response.genome ?? null,
    playerDna: finiteNonNegative(player?.dna),
  };
}

/**
 * The server has accepted, validated and durably frozen this earning result,
 * but one or more exact-once progression stages still need to finish. This is
 * terminal for every client retry queue: the server owns recovery from here.
 */
export function isDurablyPendingSettlement(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  return response.accepted === true && response.pendingSettlement === true;
}

/** A generic `alreadyEnded` response is not proof that a run paid. Only the
 * lifecycle's explicit completed reason may acknowledge settlement without an
 * impact receipt; abandonment, expiry and disconnection are zero-reward ends. */
export function isCanonicalCompletedSettlement(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  return response.alreadyEnded === true && response.endReason === 'completed';
}

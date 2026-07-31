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

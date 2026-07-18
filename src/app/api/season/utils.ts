/**
 * Season API - RPC error translation (claim_season_tier RAISE EXCEPTION
 * codes from migration 021 -> HTTP status + user-facing message).
 */

export function mapSeasonRpcError(message: string): {
  status: number;
  error: string;
  code: string;
} | null {
  const codes: Array<{ code: string; status: number; error: string }> = [
    { code: 'NO_ACTIVE_SEASON', status: 400, error: 'No season is live right now' },
    { code: 'NO_TIER_AT_LEVEL', status: 400, error: 'No milestone at that level' },
    { code: 'PLAYER_NOT_FOUND', status: 404, error: 'Player not found' },
    { code: 'LEVEL_NOT_REACHED', status: 400, error: 'That milestone is not reached yet' },
    { code: 'ALREADY_CLAIMED', status: 409, error: 'Milestone already claimed' },
  ];
  for (const entry of codes) {
    if (message.includes(entry.code)) {
      return { status: entry.status, error: entry.error, code: entry.code };
    }
  }
  return null;
}

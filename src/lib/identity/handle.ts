/**
 * Handle rules (Player Identity v1, PLAYER_IDENTITY_V1.md section 3) -
 * the client/server mirror of migration 022's SQL:
 *
 * - HANDLE_REGEX mirrors the players_handle_format CHECK (ASCII-only by
 *   design - kills the Unicode-confusable impersonation class).
 * - normalizeHandle mirrors normalize_handle(TEXT): lowercase, strip
 *   '_', leet map 0->o 1->i 3->e 4->a 5->s 7->t 8->b $->s @->a. Used by
 *   the availability endpoint so the pre-claim answer matches what
 *   claim_handle will decide.
 * - generatedHandleFor mirrors the player_identity_view fallback
 *   (section 3.2): handler-NNNN from the last 4 hex digits of the
 *   player UUID as an integer, mod 10000, zero-padded. Deterministic,
 *   zero writes; real handles cannot contain '-', so the two name
 *   spaces can never collide.
 */

export const HANDLE_REGEX = /^[A-Za-z0-9_]{3,16}$/;

const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  $: 's',
  '@': 'a',
};

/** Leet-normalized form of a handle candidate (denylist matching). */
export function normalizeHandle(handle: string): string {
  return handle
    .toLowerCase()
    .replace(/_/g, '')
    .replace(/[0134578$@]/g, (ch) => LEET_MAP[ch] ?? ch);
}

/**
 * The derived guest name for a player id (section 3.2). Mirrors the SQL:
 * last 4 hex digits of the UUID, parsed as an integer, mod 10000,
 * zero-padded to 4.
 */
export function generatedHandleFor(playerId: string): string {
  const hex = playerId.replace(/-/g, '').slice(-4);
  const n = Number.parseInt(hex, 16);
  const nnnn = Number.isFinite(n) ? n % 10000 : 0;
  return `handler-${String(nnnn).padStart(4, '0')}`;
}

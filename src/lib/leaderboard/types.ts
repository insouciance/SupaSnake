/**
 * Leaderboard types - the wire contract of GET /api/leaderboard.
 *
 * Constitution §6.1: Score is the skill number. Generation-based "skill
 * brackets" are DELETED - they bucketed players by bred generation, which is
 * bought with DNA, and then called the result "skill" (GT §9.3). Bracketing
 * returns only if population ever justifies score-percentile brackets, and
 * never by anything purchasable. Do not reintroduce `SkillBracket`.
 *
 * Rule 2: a leaderboard entry carries no genome, generation, collection,
 * account or purchase state. It is (player, score, when, dynasty).
 */

export type LeaderboardType = 'global' | 'weekly' | 'daily';

/**
 * `board` - the ranked page from `offset` (the browsable board).
 * `you`   - the default view: top 3 plus your position ±5.
 */
export type LeaderboardView = 'board' | 'you';

/**
 * Identity fields for a leaderboard row (Player Identity v1 section 4) -
 * what the Player Card row variant renders. Absent pre-migration-022.
 */
export interface LeaderboardIdentity {
  handle: string;
  isGenerated: boolean;
  title: string | null;
  clanTag: string | null;
  founder: boolean;
  /** SupaSnake Premium supporter flair (migration 028) - cosmetic only. */
  premium?: boolean;
  badges: Array<{ id: string; name: string; rarity: string }>;
  avatarDynasty: string | null;
  avatarVariantId: string | null;
  avatarVariantName: string | null;
  avatarRarity: string | null;
  mastery: Record<string, number>;
  /** Legacy Score (Identity v1 section 6.2); 0 pre-migration-023. */
  legacyScore: number;
}

export interface LeaderboardEntry {
  /** Competition rank: equal scores share a rank, the next rank skips. */
  rank: number;
  /** `players.id` - NEVER `auth.users.id`. See `LeaderboardViewer`. */
  playerId: string;
  playerName: string;
  score: number;
  /** Dynasty the ranked run was played in. */
  dynasty: string | null;
  /** ISO timestamp the ranked run ended. */
  achievedAt: string;
  /** Player Card fields (migration 022+); rows without it render legacy. */
  identity?: LeaderboardIdentity;
}

/**
 * The requesting player's position.
 *
 * `playerId` is in the `players.id` space - the same space as
 * `LeaderboardEntry.playerId`. This is the fix for GT §9.3: the page used to
 * compare `entry.playerId` (a `players.id`) with the Supabase auth user id,
 * which is a different UUID, so "your rank" and the "(You)" highlight could
 * never fire. Clients must compare against `viewer.playerId`, never against
 * their auth user id.
 *
 * `null` on the response means the request carried no usable credentials.
 * `ranked: false` means the player has no eligible run in this window.
 */
export interface LeaderboardViewer {
  playerId: string;
  ranked: boolean;
  rank: number | null;
  score: number | null;
}

export interface LeaderboardResponse {
  type: LeaderboardType;
  view: LeaderboardView;
  /** `'all'` or a dynasty id. */
  dynasty: string;
  /** Content version the ranked runs are comparable under (§6.1). */
  contentVersion: string;
  /**
   * The render list.
   * `view=board`: the ranked page starting at `offset`.
   * `view=you`:   `top` then `window`, de-duplicated, in rank order.
   */
  entries: LeaderboardEntry[];
  /** The leading three entries. Always present. */
  top: LeaderboardEntry[];
  /** The viewer ±5. Empty when there is no viewer or the viewer is unranked. */
  window: LeaderboardEntry[];
  viewer: LeaderboardViewer | null;
  /** Distinct players with an eligible run in this window. */
  total: number;
  /**
   * True when the eligible-run scan hit its hard cap, so ranks below the cap
   * may be incomplete. False on every board this population can produce; it
   * exists so the condition is observable rather than silent.
   */
  truncated: boolean;
}

export interface LeaderboardFilter {
  type: LeaderboardType;
  view?: LeaderboardView;
  dynasty?: string;
  limit?: number;
  offset?: number;
}

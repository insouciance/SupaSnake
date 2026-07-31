/**
 * Clan rollout switches (Constitution §9.2–9.4, §9.3's population gates,
 * §12.1 slot 7).
 *
 * Three flags, ALL DEFAULTED OFF, each read from the same build-time constant
 * on the client and the server so a deployment can never split a layer's
 * existence between the two halves.
 *
 *   NEXT_PUBLIC_CLAN_V2        the reworked clan itself — founding, invite
 *                              codes, the alive-only directory, the hunt panel
 *                              and paired weeks. The Phase 1 gate arms it.
 *   NEXT_PUBLIC_CLAN_GAUNTLET  §12.1 slot 7: the pre-built Gauntlet (scouting,
 *                              blind picks, research tree) and the legacy duel
 *                              surface it rides on.
 *   NEXT_PUBLIC_CLAN_PLAYOFFS  §12.1 slot 7: season playoffs and the champions
 *                              bracket.
 *
 * WHAT "OFF" MEANS FOR THE GATED LAYERS, PRECISELY
 *
 * Hiding is NOT deleting (Rule 5, Rule 6). With the Gauntlet and playoff flags
 * off:
 *
 *   - `GET /api/clan/duel` and `GET /api/clan/gauntlet` answer 200 with
 *     `{ available: false }` and touch no row. In particular they no longer
 *     reach `get_clan_duel`, whose lazy in-SQL settlement is the only writer on
 *     those paths — so a hidden layer cannot quietly keep grading clans;
 *   - every row they own — `clan_duels`, `gauntlet_picks`, `clan_research`,
 *     `clan_tithes`, `season_champions` — is left exactly where it is. Nothing
 *     in WP-1.02's migration drops one. The day the gates open, the state is
 *     the state it was;
 *   - the panels do not render, so there is no affordance to click.
 *
 * THE GATE CRITERIA ARE PUBLIC (§9.3)
 *
 * They live below as constants, and they are deliberately NOT surfaced as a
 * live counter: §9.2 forbids displaying total-population counts anywhere. The
 * developer measures, then flips the flag.
 */

/** The reworked clan surface. Exact string `true`, or it is off. */
export const CLAN_V2_ENABLED = process.env.NEXT_PUBLIC_CLAN_V2 === 'true';

/** §12.1 slot 7 — the Gauntlet, opened rather than built. */
export const CLAN_GAUNTLET_ENABLED = process.env.NEXT_PUBLIC_CLAN_GAUNTLET === 'true';

/** §12.1 slot 7 — season playoffs. */
export const CLAN_PLAYOFFS_ENABLED = process.env.NEXT_PUBLIC_CLAN_PLAYOFFS === 'true';

/**
 * §9.3's population gates, written down so the criteria are public and the
 * flip is a measurement rather than a mood.
 *
 *   Gauntlet:  ≥25 clans with ≥3 weekly-active members, sustained four weeks.
 *   Playoffs:  ≥16 gate-open clans.
 */
export const CLAN_POPULATION_GATES = {
  gauntlet: {
    clans: 25,
    weeklyActiveMembersPerClan: 3,
    sustainedWeeks: 4,
  },
  playoffs: {
    gateOpenClans: 16,
  },
} as const;

/**
 * How recently a clan must have hunted to appear in the directory (§9.2:
 * "the directory shows only clans that hunted this week or last, so it is
 * short and alive rather than long and dead").
 */
export const DIRECTORY_ALIVE_WEEKS = 2;

/**
 * Competitive-clan economy and integrity dials (Constitution v1.7 §9.2).
 *
 * These are server inputs, not client-authored prices or rewards. Each value
 * is clamped before it reaches an RPC, and migration 062 independently
 * enforces hard ceilings so a bad deployment value cannot create an unbounded
 * sink or faucet. The RPC snapshots the accepted values into its audit row;
 * changing a dial never rewrites an assignment or reward already earned.
 */
function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function configuredBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return raw === 'true';
}

export const CLAN_ECONOMY_CONFIG = Object.freeze({
  /** Clearly quoted, atomic DNA sink for founding a clan. */
  foundingDnaCost: boundedInteger(process.env.CLAN_FOUNDING_DNA_COST, 500, 1, 100_000),
  /** A direct handle invitation expires; an expired invite never admits. */
  invitationLifetimeSeconds: boundedInteger(
    process.env.CLAN_INVITATION_LIFETIME_SECONDS,
    7 * 24 * 60 * 60,
    60 * 60,
    30 * 24 * 60 * 60
  ),
  battleRewards: Object.freeze({
    /** Every player with at least one validated Energy contribution receives this. */
    participationDna: boundedInteger(
      process.env.CLAN_BATTLE_PARTICIPATION_DNA,
      100,
      0,
      1_000
    ),
    /** Added to participation for contributors on the victorious side. */
    victorBonusDna: boundedInteger(
      process.env.CLAN_BATTLE_VICTOR_BONUS_DNA,
      100,
      0,
      1_000
    ),
    /** Added to participation for contributors in a genuine stalemate. */
    stalemateBonusDna: boundedInteger(
      process.env.CLAN_BATTLE_STALEMATE_BONUS_DNA,
      50,
      0,
      1_000
    ),
    /** Mirrors the independent SQL ceiling on every individual reward dial. */
    maxComponentDna: 1_000,
  }),
  glory: Object.freeze({
    /** Schema and Constitution hard-cap this at exactly two seats. */
    maxSeats: 2,
    /** Once-per-holder/battle recognition, never a score multiplier. */
    rewardDna: boundedInteger(process.env.CLAN_GLORY_REWARD_DNA, 250, 0, 1_000),
    /** Veteran recognition defaults to one completed week of tenure. */
    minimumTenureSeconds: boundedInteger(
      process.env.CLAN_GLORY_MIN_TENURE_SECONDS,
      7 * 24 * 60 * 60,
      0,
      365 * 24 * 60 * 60
    ),
    /** A real positive-Energy result must have moved at least one Depth. */
    minimumContributionDepth: boundedInteger(
      process.env.CLAN_GLORY_MIN_CONTRIBUTION_DEPTH,
      1,
      1,
      1_000_000_000
    ),
    /** Conservative defaults; both choices are snapshotted in the audit. */
    allowOwnerSelfAward: configuredBoolean(process.env.CLAN_GLORY_ALLOW_SELF_AWARD, false),
    allowPendingReassignment: configuredBoolean(
      process.env.CLAN_GLORY_ALLOW_PENDING_REASSIGNMENT,
      false
    ),
  }),
});

export const CLAN_DIRECTORY_LIMITS = Object.freeze({
  defaultPageSize: 50,
  maxPageSize: 100,
  maxSearchLength: 40,
  maxOffset: 10_000,
});

/** Invite codes: the acquisition artifact (§11.3, Rule 14). */
export const CLAN_INVITE_CODE_LENGTH = 8;

/** `^[A-HJ-NP-Z2-9]{8}$` — 32 symbols; I, O, 0 and 1 are left out so the
 *  code survives being read aloud in a Discord voice channel. */
export const CLAN_INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

export function isValidClanInviteCode(code: unknown): code is string {
  return typeof code === 'string' && CLAN_INVITE_CODE_PATTERN.test(code);
}

/** The shareable link for an invite code (Rule 14: if it matters it has a URL). */
export function clanInviteUrl(code: string, origin = ''): string {
  return `${origin}/clan/join/${code}`;
}

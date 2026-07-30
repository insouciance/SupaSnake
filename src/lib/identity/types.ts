/**
 * Player identity types (Player Identity v1 section 4) - the TS mirror
 * of migration 022's player_identity_view row plus the trimmed identity
 * objects the list RPCs embed (anomaly board rows, scouting rosters).
 * One read path, one shape: everything the Player Card renders.
 */

export type IdentityProvenance =
  | 'earned'
  | 'lineage'
  | 'discovery'
  | 'clan'
  | 'supporter';

export interface IdentityBadge {
  id: string;
  name: string;
  rarity: string;
  position?: number;
  /** Supporter is decorative; every other class names earned provenance. */
  provenance?: IdentityProvenance;
  /** Inventory source when supplied by a richer read than the identity view. */
  source?: string | null;
}

/** Conservative provenance for the shipped catalog and embedded cards. */
export function badgeProvenance(badge: IdentityBadge): IdentityProvenance {
  if (badge.provenance) return badge.provenance;
  const clue = `${badge.source ?? ''} ${badge.id} ${badge.name}`.toLowerCase();
  if (/premium|supporter|keeper|patron|purchase|shop/.test(clue)) return 'supporter';
  if (/clan|victor|stalemate|serpent|battle_honor/.test(clue)) return 'clan';
  if (/lineage|pedigree|generation|ascendance/.test(clue)) return 'lineage';
  if (/codex|genome|discovery|record|weaver/.test(clue)) return 'discovery';
  return 'earned';
}

export interface BannerRender {
  kind?: string;
  from?: string;
  to?: string;
  animated?: boolean;
}

/** Full identity row from player_identity_view. */
export interface PlayerIdentity {
  playerId: string;
  userId: string | null;
  handle: string | null;
  displayHandle: string;
  isGenerated: boolean;
  isFounder: boolean;
  /** SupaSnake Premium supporter flair (migration 028) - cosmetic only. */
  isPremium: boolean;
  title: string | null;
  bannerId: string | null;
  bannerRender: BannerRender | null;
  badges: IdentityBadge[];
  avatar: {
    variantId: string;
    variantName: string;
    rarity: string;
    dynasty: string;
    generation: number;
  } | null;
  clanTag: string | null;
  clanName: string | null;
  /** Dynasty -> mastery level (0-10), e.g. { PRIMAL: 7, CYBER: 2 }. */
  mastery: Record<string, number>;
  /**
   * Legacy Score (Identity v1 section 6.2): sum of banked record tier
   * points. 0 pre-migration-023 (the view column does not exist yet).
   */
  legacyScore: number;
}

/** Raw view row (snake_case, as Supabase returns it). */
export interface PlayerIdentityRow {
  player_id: string;
  user_id: string | null;
  handle: string | null;
  display_handle: string;
  is_generated_name: boolean;
  is_founder: boolean;
  title_id: string | null;
  title: string | null;
  banner_id: string | null;
  banner_render: BannerRender | null;
  badges: IdentityBadge[] | null;
  avatar_variant_id: string | null;
  avatar_variant_name: string | null;
  avatar_rarity: string | null;
  avatar_dynasty: string | null;
  avatar_generation: number | null;
  clan_tag: string | null;
  clan_name: string | null;
  mastery: Record<string, number> | null;
  /** Appended by migration 023 - absent (undefined) before it applies. */
  legacy_score?: number | null;
  /** Appended by migration 028 - absent (undefined) before it applies. */
  is_premium?: boolean | null;
}

/** Map a raw view row into the app-facing identity shape. */
export function identityFromRow(row: PlayerIdentityRow): PlayerIdentity {
  return {
    playerId: row.player_id,
    userId: row.user_id ?? null,
    handle: row.handle ?? null,
    displayHandle: row.display_handle,
    isGenerated: row.is_generated_name === true,
    isFounder: row.is_founder === true,
    isPremium: row.is_premium === true,
    title: row.title ?? null,
    bannerId: row.banner_id ?? null,
    bannerRender: row.banner_render ?? null,
    badges: Array.isArray(row.badges) ? row.badges : [],
    avatar:
      row.avatar_variant_id && row.avatar_variant_name
        ? {
            variantId: row.avatar_variant_id,
            variantName: row.avatar_variant_name,
            rarity: row.avatar_rarity ?? 'common',
            dynasty: (row.avatar_dynasty ?? 'COSMIC').toUpperCase(),
            generation: row.avatar_generation ?? 1,
          }
        : null,
    clanTag: row.clan_tag ?? null,
    clanName: row.clan_name ?? null,
    mastery: row.mastery ?? {},
    legacyScore: row.legacy_score ?? 0,
  };
}

/**
 * Trimmed identity object embedded by list RPCs (get_anomaly_board rows,
 * get_gauntlet scouting roster) - enough for the row-variant card.
 */
export interface EmbeddedIdentity {
  handle: string;
  is_generated?: boolean;
  title?: string | null;
  clan_tag?: string | null;
  founder?: boolean;
  premium?: boolean;
  badges?: IdentityBadge[] | null;
  avatar_dynasty?: string | null;
}

/**
 * Lift an embedded (trimmed) identity into the full PlayerCard shape.
 * No avatar variant data rides along in the trimmed form, so the card
 * renders its snake-silhouette placeholder chip.
 */
export function identityFromEmbedded(embedded: EmbeddedIdentity): PlayerIdentity {
  return {
    playerId: '',
    userId: null,
    handle: embedded.is_generated ? null : embedded.handle,
    displayHandle: embedded.handle,
    isGenerated: embedded.is_generated === true,
    isFounder: embedded.founder === true,
    isPremium: embedded.premium === true,
    title: embedded.title ?? null,
    bannerId: null,
    bannerRender: null,
    badges: Array.isArray(embedded.badges) ? embedded.badges : [],
    avatar: null,
    clanTag: embedded.clan_tag ?? null,
    clanName: null,
    mastery: {},
    legacyScore: 0,
  };
}

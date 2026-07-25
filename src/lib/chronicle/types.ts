/**
 * Chronicle types (Player Identity v1 sections 6 + 7) - the shared shape
 * of the career surface: the records cabinet, PB timeline, collection
 * log, season chapters and clan history. Served by /api/chronicle (own)
 * and /api/profile/[handle] (public); rendered by the Chronicle
 * components and the /p/[handle] page.
 */

import type { PlayerIdentity } from '@/lib/identity/types';

export type RecordCategory =
  | 'extraction'
  | 'dynasty'
  | 'collection'
  | 'gauntlet'
  | 'veterancy'
  | 'legacy';

/** Tier index (1-5) -> display name (section 6). */
export const TIER_NAMES = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Apex'] as const;

/** Tier index (1-5) -> badge rarity (section 5.5 tier->rarity map). */
export const TIER_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

/** Category -> capstone title (section 6.4). */
export const CAPSTONE_TITLES: Record<RecordCategory, { id: string; name: string }> = {
  extraction: { id: 'title_extractor_prime', name: 'Extractor Prime' },
  dynasty: { id: 'title_apex_handler', name: 'Apex Handler' },
  collection: { id: 'title_grand_curator', name: 'Grand Curator' },
  gauntlet: { id: 'title_warmaster', name: 'Warmaster' },
  veterancy: { id: 'title_old_guard', name: 'Old Guard' },
  legacy: { id: 'title_perennial', name: 'Perennial' },
};

export const CATEGORY_LABELS: Record<RecordCategory, string> = {
  extraction: 'Extraction',
  dynasty: 'Dynasty Depth',
  collection: 'Collection',
  gauntlet: 'Gauntlet',
  veterancy: 'Veterancy',
  legacy: 'Legacy',
};

/** One record with the player's progress (definitions x player_records). */
export interface ChronicleRecord {
  id: string;
  name: string;
  category: RecordCategory;
  dynasty: string | null;
  measures: string;
  thresholds: number[];
  tierPoints: number[];
  value: number;
  /** 0 = unranked, 1-5 = Bronze..Apex. */
  tier: number;
}

export interface CapstoneProgress {
  category: RecordCategory;
  titleId: string;
  titleName: string;
  /** Lowest tier across the category's records (drives the ring). */
  minTier: number;
  /** All records at Diamond+ - the title is unlocked. */
  unlocked: boolean;
  /** All records at Apex - the animated treatment (section 6.4). */
  apex: boolean;
}

export interface RecordsCabinetData {
  records: ChronicleRecord[];
  capstones: CapstoneProgress[];
}

/** Weekly personal best (chronicle_pb_timeline row). */
export interface PbTimelinePoint {
  weekStart: string;
  dynasty: string;
  bestScore: number;
  runs: number;
}

/** A moment annotation on the timeline (cosmetic acquisitions). */
export interface PbAnnotation {
  weekStart: string;
  label: string;
  rarity: string;
  cosmeticId: string;
}

export interface PbTimelineData {
  points: PbTimelinePoint[];
  annotations: PbAnnotation[];
}

/** Collection-log entry: silhouettes are content (section 7.2). */
export interface CollectionLogEntry {
  variantId: string;
  name: string;
  dynasty: string;
  rarity: string;
  sortOrder: number;
  /** First-acquired date (OSRS collection log); null = undiscovered. */
  acquiredAt: string | null;
  generation: number | null;
}

export interface SeasonChapter {
  seq: number;
  name: string;
  theme: string;
  startsOn: string;
  endsOn: string;
  active: boolean;
  /** Season-track level reached (player_battle_pass); null = never joined. */
  trackLevel: number | null;
  maxLevel: number | null;
  completed: boolean;
  champion: { clanName: string; clanTag: string | null } | null;
  /** Rostered member of the champion clan at settlement (section 6.1 Crowned). */
  crowned: boolean;
}

export interface ClanRatingPoint {
  weekStart: string;
  ratingAfter: number;
  delta: number;
}

export interface ClanRivalry {
  opponentName: string;
  opponentTag: string | null;
  wins: number;
  losses: number;
  ties: number;
}

export interface ClanSection {
  name: string;
  tag: string;
  rating: number;
  ratingHistory: ClanRatingPoint[];
  rivalries: ClanRivalry[];
}

/**
 * A career footnote: something a player once did that no longer changes what
 * they can do. Retired systems land here rather than being deleted (R6) - the
 * first inhabitants are the aim-system unlocks retired by WP-0.07 (§15
 * overturn 10). Trivia is never a reward, a gate, or a claimable.
 */
export interface TriviaEntry {
  id: string;
  label: string;
  detail: string;
}

/**
 * The Chronicle payload. Sections are null when their infrastructure is
 * not live yet (pre-021/023) or when the public empty-state rules hide
 * them (section 7.2: <5 earning runs = header + collection log only).
 */
export interface ChroniclePayload {
  identity: PlayerIdentity;
  legacyScore: number;
  /** Migration 023 live (records tables exist). */
  recordsLive: boolean;
  earningRuns: number;
  /** Public <5-earning-runs empty-state rule applied (section 7.2). */
  limited: boolean;
  records: RecordsCabinetData | null;
  pbTimeline: PbTimelineData | null;
  collectionLog: CollectionLogEntry[];
  seasons: SeasonChapter[] | null;
  clan: ClanSection | null;
  /** Career footnotes (retired systems). Empty = no section rendered. */
  trivia: TriviaEntry[];
}

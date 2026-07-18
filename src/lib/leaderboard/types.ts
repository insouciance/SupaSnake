/**
 * Leaderboard Types
 * Per BA-001: Skill-based brackets for competitive fairness
 */

export type LeaderboardType = 'global' | 'weekly' | 'daily';

export type SkillBracket = 'beginner' | 'intermediate' | 'advanced' | 'master';

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
  badges: Array<{ id: string; name: string; rarity: string }>;
  avatarDynasty: string | null;
  avatarVariantId: string | null;
  avatarVariantName: string | null;
  avatarRarity: string | null;
  mastery: Record<string, number>;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  playerName: string;
  score: number;
  highestGeneration: number;
  collectionCount: number;
  bracket: SkillBracket;
  updatedAt: string;
  /** Player Card fields (migration 022+); rows without it render legacy. */
  identity?: LeaderboardIdentity;
}

export interface LeaderboardFilter {
  type: LeaderboardType;
  bracket?: SkillBracket;
  region?: string;
  limit?: number;
  offset?: number;
}

/**
 * Get skill bracket based on highest generation
 * Per BA-001: Brackets prevent pay-to-win perception
 */
export function getSkillBracket(highestGeneration: number): SkillBracket {
  if (highestGeneration <= 5) return 'beginner';
  if (highestGeneration <= 10) return 'intermediate';
  if (highestGeneration <= 20) return 'advanced';
  return 'master';
}

/**
 * Bracket display names
 */
export const BRACKET_NAMES: Record<SkillBracket, string> = {
  beginner: 'Beginner (Gen 1-5)',
  intermediate: 'Intermediate (Gen 6-10)',
  advanced: 'Advanced (Gen 11-20)',
  master: 'Master (Gen 21+)',
};

/**
 * Bracket colors for UI
 */
export const BRACKET_COLORS: Record<SkillBracket, string> = {
  beginner: '#4ADE80',    // Green
  intermediate: '#60A5FA', // Blue
  advanced: '#A78BFA',     // Purple
  master: '#F59E0B',       // Gold
};

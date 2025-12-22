/**
 * Clan Types
 * Per SO-001: 40% of DAU target in clans
 * Per SO-002: No daily requirements
 */

export type ClanRole = 'owner' | 'officer' | 'member';

export interface Clan {
  id: string;
  name: string;
  tag: string; // 2-6 uppercase alphanumeric
  description: string;
  ownerId: string;
  memberCount: number;
  maxMembers: number; // 20-50 per game docs
  totalScore: number;
  weeklyScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClanMember {
  playerId: string;
  clanId: string;
  role: ClanRole;
  weeklyContribution: number;
  totalContribution: number;
  joinedAt: string;
}

export interface ClanInvite {
  id: string;
  clanId: string;
  playerId: string;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: string;
  expiresAt: string;
}

/**
 * Clan energy bonus configuration
 * Per SO-001: +1 energy every 6 hours if in active clan
 */
export const CLAN_BONUS_CONFIG = {
  energyBonusAmount: 1,
  energyBonusIntervalHours: 6,
  energyBonusIntervalMs: 6 * 60 * 60 * 1000,
};

/**
 * Clan limits
 */
export const CLAN_LIMITS = {
  minMembers: 20,
  maxMembers: 50,
  minNameLength: 3,
  maxNameLength: 20,
  minTagLength: 2,
  maxTagLength: 6,
};

/**
 * Validate clan name
 */
export function isValidClanName(name: string): boolean {
  return (
    name.length >= CLAN_LIMITS.minNameLength &&
    name.length <= CLAN_LIMITS.maxNameLength
  );
}

/**
 * Validate clan tag (2-6 uppercase alphanumeric)
 */
export function isValidClanTag(tag: string): boolean {
  return (
    new RegExp(`^[A-Z0-9]{${CLAN_LIMITS.minTagLength},${CLAN_LIMITS.maxTagLength}}$`).test(tag)
  );
}

/**
 * Calculate if clan energy bonus is available
 */
export function canClaimClanBonus(lastClaimTime: number | null): boolean {
  if (!lastClaimTime) return true;

  const now = Date.now();
  const timeSinceClaim = now - lastClaimTime;
  return timeSinceClaim >= CLAN_BONUS_CONFIG.energyBonusIntervalMs;
}

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
 * `CLAN_BONUS_CONFIG` ("+1 energy every 6 hours in an active clan") used
 * to live here, next to a `canClaimClanBonus()` helper. Both are gone.
 *
 * There is no energy balance to credit any more (Constitution §8.6: the
 * day's charges are DERIVED, never granted), the RPC behind the promise
 * -- `claim_clan_energy_bonus`, migration 007 -- had no caller in `src/`
 * and wrote to the wrong key besides, and Rule 8 forbids a clan number
 * that pays. The clan page advertised the bonus in two places and
 * rendered a Claim button with no `onClick`; WP-0.03 removed the copy,
 * the button, the config and the RPC together, so nothing survives to
 * make the promise again.
 */

/**
 * Clan limits
 *
 * `minMembers: 20` is deliberately absent. It was never enforced
 * anywhere (GROUND_TRUTH §10) and it contradicts the product: a clan of
 * one is a first-class citizen (Constitution §9.2), founded solo and
 * able to hunt solo. WP-1.02 lowers `maxMembers` to 12; until it lands,
 * 50 is what the join path actually enforces.
 */
export const CLAN_LIMITS = {
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

/** Clan contracts (Constitution v1.7 §9.2–9.5). */

import { CLAN_INVITE_CODE_PATTERN } from './config';

/** `owner` is the internal authority key; player-facing copy says Leader. */
export type ClanRole = 'owner' | 'co_leader' | 'member';
export type ClanRoleLabel = 'Leader' | 'Co-leader' | 'Member';
export type ClanJoinPolicy = 'open' | 'application' | 'invite_only';

export const CLAN_ROLE_LABELS: Readonly<Record<ClanRole, ClanRoleLabel>> = Object.freeze({
  owner: 'Leader',
  co_leader: 'Co-leader',
  member: 'Member',
});

export const CLAN_PERMISSIONS = Object.freeze({
  owner: Object.freeze({
    invite: true,
    reviewApplications: true,
    removeMembers: true,
    manageCoLeaders: true,
    manageSettings: true,
    transferOwnership: true,
    assignGlory: true,
  }),
  co_leader: Object.freeze({
    invite: true,
    reviewApplications: true,
    removeMembers: true,
    manageCoLeaders: false,
    manageSettings: false,
    transferOwnership: false,
    assignGlory: false,
  }),
  member: Object.freeze({
    invite: false,
    reviewApplications: false,
    removeMembers: false,
    manageCoLeaders: false,
    manageSettings: false,
    transferOwnership: false,
    assignGlory: false,
  }),
} satisfies Readonly<Record<ClanRole, Readonly<Record<string, boolean>>>>);

export function clanRoleLabel(role: ClanRole): ClanRoleLabel {
  return CLAN_ROLE_LABELS[role];
}

export function asClanRole(value: unknown): ClanRole {
  return value === 'owner' || value === 'co_leader' ? value : 'member';
}

export function isClanJoinPolicy(value: unknown): value is ClanJoinPolicy {
  return value === 'open' || value === 'application' || value === 'invite_only';
}

export interface Clan {
  id: string;
  name: string;
  tag: string; // 2-6 uppercase alphanumeric
  description: string;
  ownerId: string;
  memberCount: number;
  maxMembers: number; // 1-12 (§12.2)
  joinPolicy: ClanJoinPolicy;
  /** Weekly Depth carried: the clan's best week, and its lifetime sum. */
  bestWeekDepth?: number;
  lifetimeDepth?: number;
  createdAt: string;
  updatedAt: string;
  /** Set when the clan was disbanded; its records stay readable forever. */
  disbandedAt?: string | null;
}

export interface ClanMember {
  playerId: string;
  clanId: string;
  role: ClanRole;
  joinedAt: string;
  /** Null means no eligible positive-Energy battle result, never a fabricated zero. */
  currentBestFiveDepth?: number | null;
  currentContributionRank?: number | null;
}

export interface ClanApplication {
  id: string;
  clanId: string;
  applicantId: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  createdAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
}

export interface ClanGlorySeat {
  id: string;
  clanId: string;
  seat: 1 | 2;
  holderUserId: string;
  assignedByUserId: string;
  sourceCycleIndex: number;
  effectiveCycleIndex: number;
  effectiveAt: string;
  evidenceDepth: number;
  evidenceRank: number;
  rewardDna: number;
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
 * Energy cannot be credited by a clan (Constitution §8.6: recovery is its
 * only source), the RPC behind the promise
 * -- `claim_clan_energy_bonus`, migration 007 -- had no caller in `src/`
 * and wrote to the wrong key besides, and Rule 8 forbids a clan number
 * that pays. The clan page advertised the bonus in two places and
 * rendered a Claim button with no `onClick`; WP-0.03 removed the copy,
 * the button, the config and the RPC together, so nothing survives to
 * make the promise again.
 */

/**
 * Clan limits (Constitution §9.2 and the §12.2 caps).
 *
 * `maxMembers: 12` — "clan size 1–12, soft-full at 6" [H]. At six every
 * member is visibly load-bearing in the weekly sum; at fifty, forty are
 * wallpaper. The 50 that shipped is gone and migration 048 moves the CHECK
 * constraint with it, so the cap is enforced in the schema and not only in
 * the route.
 *
 * `minMembers` is deliberately absent and always will be. A clan of one is
 * a first-class citizen: it is founded solo, it hunts solo, it holds records
 * solo, and it appears in the directory solo.
 *
 * `softFullMembers: 6` is a PRESENTATION threshold, never a mechanical one.
 * Nothing reads it to gate, price, reward or rank anything — a clan of seven
 * is not penalised and a clan of six is not rewarded.
 */
export const CLAN_LIMITS = {
  maxMembers: 12,
  softFullMembers: 6,
  minNameLength: 3,
  maxNameLength: 20,
  minTagLength: 2,
  maxTagLength: 6,
};

/**
 * Validate clan name.
 *
 * §9.2's moderation bound: names are filtered, heraldry is preset-only and
 * there are no free-text descriptions at launch. The character class is the
 * filter's first half — letters, digits, spaces, hyphens and apostrophes,
 * nothing that can carry markup or a URL.
 */
const CLAN_NAME_CHARACTERS = /^[A-Za-z0-9][A-Za-z0-9 '\-]*[A-Za-z0-9]$/;

export function isValidClanName(name: string): boolean {
  return (
    typeof name === 'string' &&
    name.length >= CLAN_LIMITS.minNameLength &&
    name.length <= CLAN_LIMITS.maxNameLength &&
    CLAN_NAME_CHARACTERS.test(name) &&
    !/\s{2,}/.test(name)
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
 * Derive a tag from a clan name when the founder did not pick one.
 *
 * §9.2: "Founding is one tap plus a name." A tag is a display convenience,
 * not a decision to make someone take. Uniqueness is settled in SQL by
 * `found_clan`, which appends a digit on collision.
 */
export function suggestClanTag(name: string): string {
  const words = String(name).toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  const initials = words.map((word) => word[0]).join('');
  const candidate =
    initials.length >= CLAN_LIMITS.minTagLength
      ? initials
      : (words[0] ?? 'CLAN');
  const trimmed = candidate.slice(0, CLAN_LIMITS.maxTagLength);
  return trimmed.length >= CLAN_LIMITS.minTagLength ? trimmed : 'CLAN';
}

export { CLAN_INVITE_CODE_PATTERN };

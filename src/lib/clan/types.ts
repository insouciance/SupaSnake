/**
 * Clan types (Constitution §9.2–9.4, Rule 8).
 *
 * WHAT WP-1.02 TOOK OUT OF THIS FILE, AND WHY
 *
 *   `ClanRole` no longer has an `officer`. §9.2 allows plain roster
 *   management and forbids "any officer lever keyed to output"; the
 *   acceptance criterion for this work package is the stronger, structural
 *   one — *no officer lever exists*. A rank that can be given and taken is
 *   the affordance that makes evaluation feel available, so the rank is
 *   gone: `owner | member`, and the owner's only roster powers are removal
 *   and handing the clan over. Neither reads a number about the person.
 *
 *   `ClanMember.weeklyContribution` / `.totalContribution` are gone with the
 *   columns behind them (migration 048). They were the pre-Constitution
 *   graded-contribution pair — the exact shape Rule 8 forbids, and the shape
 *   a "minimum weekly DNA" cut line would have been built on. What a member
 *   gives the clan is their Depth, which is additive, uncapped and displayed
 *   without a bar (§9.2's "additive, not evaluative").
 *
 *   `Clan.weeklyScore` / `.totalScore` are gone for the same reason plus one
 *   more: §12.2 caps public numbers at TWO — Score and Depth. A third clan
 *   number that ranked clans against each other was over that cap.
 */

import { CLAN_INVITE_CODE_PATTERN } from './config';

export type ClanRole = 'owner' | 'member';

export interface Clan {
  id: string;
  name: string;
  tag: string; // 2-6 uppercase alphanumeric
  description: string;
  ownerId: string;
  memberCount: number;
  maxMembers: number; // 1-12 (§12.2)
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

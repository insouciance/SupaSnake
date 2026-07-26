/**
 * The reads behind the two artifact classes whose numbers must be real
 * (WP-1.08): the Serpent settlement card and the clan card.
 *
 * §11.3 quotes the settlement card verbatim — "HOLLOW FANG reached Depth
 * 48,210 — best week yet" — and a Depth is a public number (§12.2). A
 * public number that a stranger could type into a query string is not a
 * number, so these two cards read `serpent_weeks`, `serpent_week_clans` and
 * `clans` and render nothing they did not find there.
 *
 * RULE 11 — every Supabase error is checked and reported. Each read below
 * distinguishes three outcomes and never conflates them:
 *
 *   found      → render the card
 *   not found  → 404 the artifact (a missing week is not an error)
 *   errored    → console.error + Sentry, then 404, because a card built
 *                from a failed read would be a card of zeroes and a zero
 *                Depth on a public URL reads as a loss (Rules 5 and 6).
 *
 * The absent-infrastructure case is separated deliberately: before
 * migration 046 is applied the Serpent tables do not exist, and a missing
 * relation is a deployment state, not an incident to page a human about.
 *
 * READ-ONLY. Nothing in this file writes, and no export takes a value that
 * could become one.
 */

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ANOMALIES, isAnomalyId } from '@/shared/game/anomalies';
import {
  serpentModifiersForWeek,
  serpentWeekIndex,
  serpentWeekKeyToDate,
  serpentWeekSeed,
} from '@/shared/game/serpent';

/** Postgres codes for "the table/column isn't there yet". */
const MISSING_INFRA_CODES = new Set(['42P01', '42703', 'PGRST205', 'PGRST204']);

function isMissingInfra(error: { code?: string | null } | null): boolean {
  return Boolean(error?.code && MISSING_INFRA_CODES.has(error.code));
}

/**
 * Report a Supabase failure exactly once, in one shape, and never for the
 * pre-migration case. Returns true when the caller should treat the read as
 * a hard failure.
 */
function reportReadFailure(
  where: string,
  error: { message?: string; code?: string | null } | null,
  extra: Record<string, unknown>
): boolean {
  if (!error) return false;
  if (isMissingInfra(error)) return true;
  console.error(`${where} failed:`, { ...extra, error });
  Sentry.captureException(new Error(`${where} failed: ${error.message ?? 'unknown'}`), {
    extra: { ...extra, code: error.code },
  });
  return true;
}

/** The week key shape the artifact URL carries: a Monday, `YYYY-MM-DD`. */
export const WEEK_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The clan tag shape the schema enforces: 2–6 uppercase alphanumerics. */
export const CLAN_TAG_PATTERN = /^[A-Z0-9]{2,6}$/;

export interface SerpentWeekArtifact {
  weekKey: string;
  weekIndex: number;
  seed: string;
  modifierNames: string[];
  settled: boolean;
  clan: {
    name: string;
    tag: string;
    depth: number;
    bestWeek: boolean;
    contributingMembers: number;
  } | null;
}

function modifierNames(ids: readonly unknown[]): string[] {
  return ids.filter(isAnomalyId).map((id) => ANOMALIES[id].name);
}

/**
 * The week itself is a function of the UTC calendar (`serpent.ts`), so a
 * week card renders correctly even before the week has a row — which is
 * what makes "the hunt is open" shareable on a Monday morning.
 */
export function derivedSerpentWeek(weekKey: string): SerpentWeekArtifact | null {
  if (!WEEK_KEY_PATTERN.test(weekKey)) return null;
  const date = serpentWeekKeyToDate(weekKey);
  if (Number.isNaN(date.getTime())) return null;
  // Only a Monday names a Serpent week; anything else is a malformed link.
  if (date.getUTCDay() !== 1) return null;

  return {
    weekKey,
    weekIndex: serpentWeekIndex(date),
    seed: serpentWeekSeed(weekKey),
    modifierNames: modifierNames(serpentModifiersForWeek(date)),
    settled: false,
    clan: null,
  };
}

/**
 * Load a Serpent week artifact, optionally scoped to one clan's settled
 * standing. Returns the derived week when the database has nothing to add.
 */
export async function loadSerpentWeekArtifact(
  supabase: SupabaseClient,
  weekKey: string,
  clanTag: string | null
): Promise<SerpentWeekArtifact | null> {
  const derived = derivedSerpentWeek(weekKey);
  if (!derived) return null;

  const { data: week, error: weekError } = await supabase
    .from('serpent_weeks')
    .select('id, seed, modifiers, settled_at')
    .eq('week_start', weekKey)
    .maybeSingle();

  if (weekError) {
    reportReadFailure('Serpent week artifact lookup', weekError, { weekKey });
    return derived;
  }
  if (!week) return derived;

  const stored: SerpentWeekArtifact = {
    ...derived,
    seed: typeof week.seed === 'string' && week.seed ? week.seed : derived.seed,
    modifierNames: Array.isArray(week.modifiers)
      ? modifierNames(week.modifiers)
      : derived.modifierNames,
    settled: week.settled_at !== null,
  };

  if (!clanTag || !CLAN_TAG_PATTERN.test(clanTag)) return stored;

  const { data: clan, error: clanError } = await supabase
    .from('clans')
    .select('id, name, tag, best_week_depth')
    .eq('tag', clanTag)
    .is('disbanded_at', null)
    .maybeSingle();

  if (clanError) {
    reportReadFailure('Serpent settlement clan lookup', clanError, { weekKey, clanTag });
    return stored;
  }
  if (!clan) return stored;

  const { data: standing, error: standingError } = await supabase
    .from('serpent_week_clans')
    .select('depth, contributing_members')
    .eq('week_id', week.id)
    .eq('clan_id', clan.id)
    .maybeSingle();

  if (standingError) {
    reportReadFailure('Serpent settlement standing lookup', standingError, {
      weekKey,
      clanTag,
    });
    return stored;
  }
  if (!standing) return stored;

  const depth = Number(standing.depth) || 0;
  const best = Number(clan.best_week_depth) || 0;

  return {
    ...stored,
    clan: {
      name: String(clan.name),
      tag: String(clan.tag),
      depth,
      // "Best week yet" only when this week IS the monotonic best. Never a
      // comparative that could read as a decline (Rules 5 and 6).
      bestWeek: depth > 0 && depth >= best,
      contributingMembers: Number(standing.contributing_members) || 0,
    },
  };
}

export interface ClanArtifact {
  name: string;
  tag: string;
  memberCount: number;
  lifetimeDepth: number;
  bestWeekDepth: number;
}

/** The clan card's read. Public facts only: no roster, no member numbers. */
export async function loadClanArtifact(
  supabase: SupabaseClient,
  tag: string
): Promise<ClanArtifact | null> {
  if (!CLAN_TAG_PATTERN.test(tag)) return null;

  const { data, error } = await supabase
    .from('clans')
    .select('name, tag, member_count, lifetime_depth, best_week_depth')
    .eq('tag', tag)
    .is('disbanded_at', null)
    .maybeSingle();

  if (error) {
    reportReadFailure('Clan artifact lookup', error, { tag });
    return null;
  }
  if (!data) return null;

  return {
    name: String(data.name),
    tag: String(data.tag),
    memberCount: Number(data.member_count) || 0,
    lifetimeDepth: Number(data.lifetime_depth) || 0,
    bestWeekDepth: Number(data.best_week_depth) || 0,
  };
}

/**
 * The auto-composed settlement post (Constitution §11.6).
 *
 * "Weekly Serpent settlements auto-compose into a shareable post: top clans,
 * record Depths, world-firsts, the week's named conditions. The operator's job
 * is to press publish."
 *
 * This module is the "auto-compose" half. It is pure: a settled week — the
 * `GET /api/serpent/panel` payload plus a week key — goes in, a post comes out.
 * Nothing here publishes, schedules, queues or notifies. Publishing is a tap,
 * always, by a person (WP-1.09: the player is never auto-published anywhere
 * without acting), which is why this returns a `SharePayload` for
 * `ShareArtifactButton` rather than performing a send.
 *
 * IT DOES NOT INVENT A SECOND COMPOSER
 *
 *   WP-1.08 already owns the settlement artifact: `settlementLines` writes the
 *   card's sentences, `serpentWeekArtifactUrl` addresses the week, and
 *   `payload` guarantees the URL is the last line of `text` (the WP-0.08
 *   defect). All three are imported, none is re-implemented. The post is
 *   `settlementShare`'s payload with the week's conditions and its records
 *   appended: same title, same URL, same opening lines, asserted line-for-line
 *   in the test so the two cannot drift into two different artifacts.
 *
 * IT DOES NOT INVENT A SECOND VOICE
 *
 *   The week's facts and their phrasing come from WP-1.07's `briefing` module
 *   (`readWeekBriefing`, `segments`, `signedSegments`, `formatWeekStart`), so
 *   the post says what the Monday briefing says. One week, one reading.
 *
 * N = 1 IS THE DEFAULT CASE, NOT THE EDGE
 *
 *   A clan of one composes a real post about a real clan; a player with no
 *   clan at all composes a post about their own week. Neither is degraded,
 *   neither apologises, and neither renders an empty roster. §9.3's promise is
 *   that the design works at every population, and a marketing surface that
 *   only works once there are ten clans is a surface that never starts.
 *
 * RULE 5, RULE 6, RULE 7
 *
 *   Every line reports what the week ADDED. There is no decline, no loss, no
 *   "you dropped to", no streak-broken and no decay, because no number this
 *   post can read is ever written downward. And nothing here is commercial:
 *   `composeSettlementPost` sweeps its own output through the Rule 7
 *   vocabulary and throws rather than returning a post that sells something.
 */

import {
  readWeekBriefing,
  segments,
  signedSegments,
  type WeekBriefing,
} from '@/lib/serpent/briefing';
import { sweepMessage } from '@/lib/growth/commercialLanguage';
import type { SerpentPanel } from '@/lib/server/serpent';
import {
  payload,
  serpentWeekArtifactUrl,
  settlementLines,
  type SharePayload,
} from '@/lib/share/artifactUrls';
import {
  describeSerpentModifier,
  describeSerpentWeek,
  serpentWeekIndex,
  serpentWeekKeyToDate,
} from '@/shared/game/serpent';
import { formatAmount } from '@/shared/format/amount';

/** One auto-composed post, ready for a person to press publish on. */
export interface SettlementPost {
  /** The week the post describes, `YYYY-MM-DD`. */
  weekKey: string;
  /** The week's ordinal, as the artifact card numbers it. */
  weekIndex: number;
  /** The single sentence the post leads with. */
  headline: string;
  /** The body, one fact per line. Never a call to buy anything. */
  lines: string[];
  /** The week's named conditions, joined; `'No modifier'` when it drew none. */
  conditions: string;
  /** One-tap publish payload: title, text (URL on the last line), url. */
  share: SharePayload;
}

/** What the post can say about the clan, once a settled week is read. */
export interface SettlementPostClan {
  name: string;
  tag: string;
  depth: number;
  /** The clan's deepest week is this one. Only ever good news (Rule 6). */
  bestWeek: boolean;
  contributingMembers: number;
}

function clanFromPanel(panel: SerpentPanel, weekKey: string): SettlementPostClan | null {
  const clan = panel.clan;
  if (!clan) return null;

  const history = panel.history.find((entry) => entry.weekStart === weekKey);
  // The panel folds the CURRENT week live; a past week's clan Depth is on the
  // settled history row. Neither is invented when both are absent.
  const isCurrent = panel.week?.weekStart === weekKey;
  const depth = isCurrent ? clan.depth : (history?.clanDepth ?? null);
  if (depth === null) return null;

  return {
    name: clan.name,
    tag: clan.tag ?? '',
    depth,
    // `bestWeekDepth` is clamped upward at settlement, so equality means this
    // week set it. A strictly-greater test would silently drop the very week
    // that became the record.
    bestWeek: depth > 0 && depth >= clan.bestWeekDepth,
    contributingMembers: clan.members.filter((member) => member.depth > 0).length,
  };
}

/**
 * The records this week wrote, as sentences (§11.6's "record Depths,
 * world-firsts"). Read from the Chronicle, which only ever carries records —
 * `personal_best_week` and `clan_best_week` — so nothing here can be a loss.
 */
export function recordLines(panel: SerpentPanel, weekKey: string): string[] {
  const lines: string[] = [];
  for (const entry of panel.chronicle) {
    if (entry.weekStart !== weekKey) continue;
    if (entry.kind === 'personal_best_week') {
      lines.push(
        entry.previousDepth > 0
          ? `A deepest week: ${segments(entry.depth)}, past a standing ${segments(
              entry.previousDepth
            )}.`
          : `A first week on the hunt: ${segments(entry.depth)}.`
      );
    } else if (entry.kind === 'clan_best_week') {
      lines.push(
        entry.previousDepth > 0
          ? `A clan's deepest week: ${segments(entry.depth)}, past a standing ${segments(
              entry.previousDepth
            )}.`
          : `A clan's first settled week: ${segments(entry.depth)}.`
      );
    }
  }
  return lines;
}

/**
 * Compose the post for one settled week.
 *
 * Returns `null` when the key names no Serpent week, or a week that has not
 * started — a post about a week that does not exist is worse than no post.
 * A week that has started but not submerged still composes: the operator may
 * want to read it, and every line is true of the week so far.
 *
 * @throws if its own output trips the Rule 7 sweep. Deliberately loud: a post
 * that sells something must never reach a share sheet, and a silent `null`
 * would look like "no post this week" instead of "the copy broke Rule 7".
 */
export function composeSettlementPost(
  panel: SerpentPanel,
  weekKey: string,
  now: Date | number = Date.now()
): SettlementPost | null {
  const briefing = readWeekBriefing(panel, weekKey, now);
  if (!briefing) return null;

  const date = serpentWeekKeyToDate(weekKey);
  const definition = describeSerpentWeek(date);
  const weekIndex = serpentWeekIndex(date);
  const modifierNames = definition.modifiers.map((id) => describeSerpentModifier(id).name);
  const conditions = modifierNames.length > 0 ? modifierNames.join(' · ') : 'No modifier';

  const clan = clanFromPanel(panel, weekKey);

  // The base sentences are WP-1.08's, unchanged. Everything below appends.
  const base = clan
    ? settlementLines({
        weekKey,
        weekIndex,
        clanName: clan.name,
        clanTag: clan.tag,
        depth: clan.depth,
        bestWeek: clan.bestWeek,
        contributingMembers: clan.contributingMembers,
      })
    : soloLines(weekKey, briefing);

  const lines = [...base, `Conditions: ${conditions}`, ...recordLines(panel, weekKey)];

  const title = clan
    ? `SupaSnake — ${clan.name} · Serpent week ${weekKey}`
    : `SupaSnake — Serpent week ${weekKey}`;

  const share = payload(
    title,
    lines,
    serpentWeekArtifactUrl(weekKey, clan?.tag || null)
  );

  const post: SettlementPost = {
    weekKey,
    weekIndex,
    headline: base[1] ?? base[0] ?? '',
    lines,
    conditions,
    share,
  };

  const hits = sweepMessage({ title: share.title, text: share.text });
  if (hits.length > 0) {
    throw new Error(`Settlement post violates Rule 7: ${hits.join('; ')}`);
  }
  return post;
}

// ---------------------------------------------------------------------------
// The world-scale post — what §11.6 actually asks the operator to publish
// ---------------------------------------------------------------------------

/** One clan's settled week, as the world roll-up reads it. */
export interface WorldSettlementClan {
  name: string;
  tag: string | null;
  depth: number;
  contributingMembers: number;
}

/**
 * The whole game's week, read from the settled rows.
 *
 * §11.6: "top clans, record Depths, world-firsts, the week's named
 * conditions." All four, and nothing else — no arrivals, no revenue, no
 * conversion, no "join now".
 */
export interface WorldSettlement {
  weekKey: string;
  /** The week's deepest clans. Named, never numbered (Rule 8: no positions). */
  clans: readonly WorldSettlementClan[];
  /** How many players set their deepest week. A count of records, not a rank. */
  personalRecords: number;
  /** How many clans set their deepest week. */
  clanRecords: number;
  /** How many of those clans had never settled a week before — world-firsts. */
  clanFirsts: number;
}

/**
 * Compose the operator's post for the whole week.
 *
 * The same refusals and the same Rule 7 guard as the player-scoped composer,
 * and the same `payload` assembly, so the URL is the last line here too.
 */
export function composeWorldSettlementPost(
  world: WorldSettlement,
  now: Date | number = Date.now()
): SettlementPost | null {
  const { weekKey } = world;
  const date = serpentWeekKeyToDate(weekKey);
  if (Number.isNaN(date.getTime())) return null;
  const definition = describeSerpentWeek(date);
  if (definition.weekStart !== weekKey) return null;
  if (new Date(definition.startsAt).getTime() > new Date(now).getTime()) return null;

  const weekIndex = serpentWeekIndex(date);
  const modifierNames = definition.modifiers.map((id) => describeSerpentModifier(id).name);
  const conditions = modifierNames.length > 0 ? modifierNames.join(' · ') : 'No modifier';

  const lines = [
    `SUPASNAKE · World Serpent · week of ${weekKey}`,
    `Conditions: ${conditions}`,
  ];

  if (world.clans.length === 0) {
    // A week nobody settled still gets an honest post. It says so.
    lines.push('No clan settled a Depth this week.');
  } else {
    for (const clan of world.clans) {
      lines.push(
        `${clan.name.toUpperCase()} — Depth ${formatAmount(clan.depth)} · ${
          clan.contributingMembers
        } ${clan.contributingMembers === 1 ? 'member hunted' : 'members hunted'}`
      );
    }
  }

  if (world.personalRecords > 0) {
    lines.push(
      `${world.personalRecords} ${
        world.personalRecords === 1 ? 'hunter' : 'hunters'
      } went deeper than they ever had.`
    );
  }
  if (world.clanRecords > 0) {
    lines.push(
      `${world.clanRecords} ${
        world.clanRecords === 1 ? 'clan' : 'clans'
      } set a deepest week${
        world.clanFirsts > 0
          ? `, ${world.clanFirsts} of them for the first time`
          : ''
      }.`
    );
  }

  const share = payload(
    `SupaSnake — Serpent week ${weekKey}`,
    lines,
    serpentWeekArtifactUrl(weekKey, null)
  );

  const hits = sweepMessage({ title: share.title, text: share.text });
  if (hits.length > 0) {
    throw new Error(`Settlement post violates Rule 7: ${hits.join('; ')}`);
  }

  return {
    weekKey,
    weekIndex,
    headline: lines[2] ?? lines[1],
    lines,
    conditions,
    share,
  };
}

/**
 * The no-clan reading — a hunter of one. Same two-line shape as
 * `settlementLines` so the post's structure does not change with population,
 * and the second line is still the headline.
 */
function soloLines(weekKey: string, briefing: WeekBriefing): string[] {
  // Same kicker string `settlementLines` writes, so the post's first line does
  // not change shape when a player happens to have no clan.
  const kicker = `SUPASNAKE · World Serpent · week of ${weekKey}`;
  if (!briefing.hunted) {
    return [
      kicker,
      'The week ran its course and submerged.',
      'The Serpent surfaces again every Monday.',
    ];
  }
  const depth = segments(briefing.yourDepth);
  // `priorBest === 0` is a first week, not a zero-to-beat: the briefing draws
  // the same distinction, and "a deepest week, by +1,240" would be a strange
  // thing to say to somebody who has only ever hunted once.
  const headline = !briefing.deepestYet
    ? `Depth ${depth} fed to the Serpent.`
    : briefing.priorBest > 0
      ? `Depth ${depth} — a deepest week, by ${signedSegments(briefing.deltaVsPriorBest)}.`
      : `Depth ${depth} — a first week on the hunt.`;
  return [kicker, headline, 'Hunted without a clan — this Depth is one player’s.'];
}

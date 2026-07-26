/**
 * The World Report — return without debt (Constitution §7.5).
 *
 * "When a player comes back after three or more absent days, one screen —
 * never blocking Launch, Rule 1 and the two-tap law intact — reports what
 * moved... It is written as news ('HOLLOW FANG reached Depth 51,000 without
 * you — they left the door open'), never as debt: no claims, no catch-up
 * tasks, nothing owed."
 *
 * This module is the pure half. A last-seen timestamp, the player's Serpent
 * panel and the world's settled weeks go in; a reading comes out. It is pure
 * so the cases that matter — three days, a month, a season, a world with two
 * players in it — can be asserted without a DOM and without a database.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT COMPOSES HISTORY. IT DOES NOT PRODUCE ANY.
 *
 *   Every fact here is already written, already settled and already readable
 *   at its own URL: a Serpent week's roll-up, the player's standing numbers,
 *   today's Signal from the shipped calendar. Nothing in this file reads a new
 *   table, and nothing in this file can write one — it takes data and returns
 *   strings. §12.2 says the World Report is "not a new daily or weekly
 *   surface, not a new currency, not a new claim"; the way that is guaranteed
 *   is that there is nothing here for a claim to be attached to.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOW IT IS KEPT DEBT-FREE — FOUR DEVICES, NOT ONE
 *
 *   1. NOTHING IT READS CAN GO DOWN. `bestWeekDepth` and `lifetimeDepth` are
 *      monotonic by construction (§7.3, Rule 6); a week's roll-up is a record
 *      of what was ADDED. There is no subtractive number in this module's
 *      inputs, so there is no subtractive number it could render even by
 *      mistake. This is the load-bearing one: the others are belt and braces.
 *
 *   2. IT NEVER ENUMERATES BEYOND `WORLD_REPORT_WEEK_LIMIT`. A season away is
 *      thirteen submerged weeks. Thirteen lines is a punch-list, and a
 *      punch-list is a backlog with better typography — so past four, the
 *      report SUMMARISES and stops. A longer absence produces a report of the
 *      same length, not a longer one.
 *
 *   3. IT ALWAYS SAYS WHAT STILL STANDS. `standing` is the one section that
 *      cannot be omitted at any population or any absence length, and its last
 *      line is the invariant stated outright: nothing of yours moved. R5 is
 *      not merely obeyed here, it is reported.
 *
 *   4. IT SWEEPS ITS OWN COPY. `sweepReturn` refuses the whole report on a
 *      loss, expiry, backlog, debt, claim or currency word — the same loud
 *      refusal `composeSettlementPost` uses for Rule 7, for the same reason:
 *      a bad edit must fail, not ship. Foreign strings (clan names, shipped
 *      engine copy) are redacted first, because this is a lint over the copy
 *      the product authors, not over what a player named their clan.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT DOES NOT INVENT A SECOND AGGREGATOR OR A SECOND VOICE
 *
 *   The world's weeks come from `readWorldRollup` and are read through
 *   `composeWorldSettlementPost` (WP-1.09), so a week the operator published
 *   and the same week in a returning player's report cannot disagree about
 *   conditions or clans. The phrasing — `segments`, `formatWeekStart` — is
 *   WP-1.07's Monday briefing, because §7.5 is that briefing over a longer
 *   span, and the day is `describeSignalDay`, the one authoritative derivation
 *   (§7.2). No calendar, no aggregator and no vocabulary is re-declared here.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * N = 1 IS THE DEFAULT CASE, NOT THE EDGE
 *
 *   This game has two real players. A return screen that needs a crowd is a
 *   return screen that never works, so the spine of the report is THE
 *   CALENDAR, NOT THE POPULATION. Weeks surfaced and submerged under named
 *   conditions whether or not anyone hunted them; a Signal is up today
 *   whether or not anyone took it; the player's own records still stand
 *   whether or not anyone passed them. Every one of those is real news at
 *   N = 1, and all three sections survive an empty world. The crowd-dependent
 *   material — other clans, record counts — is additive: present when there is
 *   a world to report, silently absent when there is not. Nothing apologises
 *   for a small world and nothing renders an empty roster.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RULE 8, RULE 14
 *
 *   Clans are named and never graded. No position, no rank number, no cut
 *   line, no "top", no bar: the deepest clans of a week are printed in some
 *   order because a sentence has an order, exactly as §11.6's post prints
 *   them. And every fact carries the canonical URL it came from — a Serpent
 *   week at `/w/[week]`, a Signal day at `/s/[day]`, both of which already
 *   have OG images and a way in. The report itself mints no URL: it is a
 *   reading of one player's absence, and a private timeline is not a
 *   "meaningful artifact" in R14's sense — it is personal data. R14 is
 *   satisfied by every line being linkable, not by publishing the person.
 */

import {
  composeWorldSettlementPost,
  type WorldSettlement,
  type WorldSettlementClan,
} from '@/lib/growth/settlementPost';
import { formatWeekStart, segments } from '@/lib/serpent/briefing';
import {
  WORLD_REPORT_CLAN_LIMIT,
  WORLD_REPORT_MIN_ABSENT_DAYS,
  WORLD_REPORT_SPAN_DAYS,
  WORLD_REPORT_WEEK_LIMIT,
} from '@/lib/report/config';
import { redact, sweepReturn } from '@/lib/report/returnLanguage';
import type { SerpentPanel, SerpentPanelClan } from '@/lib/server/serpent';
import { serpentWeekArtifactUrl, signalArtifactUrl } from '@/lib/share/artifactUrls';
import {
  describeSerpentWeek,
  serpentWeekEnd,
  serpentWeekKey,
  serpentWeekStart,
} from '@/shared/game/serpent';
import { describeSignalDay, signalDayIndex } from '@/shared/game/signal';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * A hard stop on the week walk. Ten years of Mondays: long enough that no real
 * absence reaches it, short enough that a corrupt timestamp cannot spin.
 */
const MAX_WEEK_WALK = 520;

/** How long the world ran. A description of a calendar, never a tier. */
export type WorldReportSpan = 'days' | 'week' | 'month' | 'season';

export type WorldReportSectionId = 'weeks' | 'clan' | 'records' | 'standing' | 'today';

/** One sentence, and the canonical artifact it came from (Rule 14). */
export interface WorldReportLine {
  text: string;
  /** Absolute URL of the artifact this line reads. Never a claim endpoint. */
  href?: string;
}

export interface WorldReportSection {
  id: WorldReportSectionId;
  title: string;
  lines: WorldReportLine[];
}

/**
 * The whole reading.
 *
 * Note what is NOT in this shape, and may never be added: no balance, no
 * amount, no currency, no `claimUrl`, no `expiresAt`, no `pending`, no
 * `owed`, no rank, no position, no percentage of anything. A returning player
 * is handed sentences and links, and that is the entire contract.
 */
export interface WorldReport {
  /** Whole days since their last run started. */
  awayDays: number;
  span: WorldReportSpan;
  /** How many Serpent weeks submerged while they were away. */
  weeksSubmerged: number;
  headline: string;
  sections: WorldReportSection[];
  /** Every canonical URL the report cites, deduped, in reading order. */
  links: string[];
}

export interface WorldReportInput {
  /**
   * ISO timestamp of the player's most recent run. `null` means they have
   * never played — a first visit is not a return, and gets no report.
   */
  lastSeenAt: string | null;
  /** Their standings. Read, never written. */
  panel: SerpentPanel;
  /**
   * The world's settled weeks, from `readWorldRollup`. Only the weeks the
   * report will actually name need be supplied; a week with no entry still
   * reads, on its conditions alone.
   */
  weeks: readonly WorldSettlement[];
}

// ---------------------------------------------------------------------------
// The calendar
// ---------------------------------------------------------------------------

/** Whole days between a last run and now. Never negative. */
export function daysAway(lastSeenAt: string, now: Date | number = Date.now()): number {
  const last = new Date(lastSeenAt).getTime();
  if (Number.isNaN(last)) return 0;
  return Math.max(0, Math.floor((new Date(now).getTime() - last) / DAY_MS));
}

/** Which of §7.5's three bands this absence reads as. */
export function absenceSpan(days: number): WorldReportSpan {
  if (days >= WORLD_REPORT_SPAN_DAYS.season) return 'season';
  if (days >= WORLD_REPORT_SPAN_DAYS.month) return 'month';
  if (days >= WORLD_REPORT_SPAN_DAYS.week) return 'week';
  return 'days';
}

/**
 * The Serpent weeks that submerged while they were away, newest first.
 *
 * Derived from the CALENDAR, not from any row — the same choice
 * `defaultBriefingWeek` makes, and for the same reason: the player who most
 * needs this reading is the one with no row for any of these weeks. A week
 * counts when its exclusive end passed during the absence, which is exactly
 * when the hunt settled and the Chronicle was written.
 */
export function submergedWeeksWhileAway(
  lastSeenAt: string,
  now: Date | number = Date.now()
): string[] {
  const last = new Date(lastSeenAt).getTime();
  const nowMs = new Date(now).getTime();
  if (Number.isNaN(last) || nowMs <= last) return [];

  const weeks: string[] = [];
  let start = serpentWeekStart(last).getTime();
  for (let i = 0; i < MAX_WEEK_WALK; i += 1) {
    const end = serpentWeekEnd(start).getTime();
    if (end > nowMs) break;
    weeks.push(describeSerpentWeek(start).weekStart);
    start += WEEK_MS;
  }
  return weeks.reverse();
}

// ---------------------------------------------------------------------------
// The clan
// ---------------------------------------------------------------------------

/**
 * Match the player's clan inside a week's roll-up. Tag first when both carry
 * one — tags are unique, names need not be — and name otherwise.
 */
function isSameClan(mine: SerpentPanelClan, theirs: WorldSettlementClan): boolean {
  if (mine.tag && theirs.tag) return mine.tag === theirs.tag;
  return mine.name === theirs.name;
}

/** What the player's clan did in the weeks the report is reading. */
export interface ClanWhileAway {
  name: string;
  /** Depth the clan settled across those weeks. Only ever additive (Rule 6). */
  depth: number;
  /** How many of those weeks it settled a Depth in. */
  weeks: number;
}

export function clanWhileAway(
  clan: SerpentPanelClan | null,
  weeks: readonly WorldSettlement[]
): ClanWhileAway | null {
  if (!clan) return null;
  let depth = 0;
  let hunted = 0;
  for (const week of weeks) {
    const mine = week.clans.find((entry) => isSameClan(clan, entry));
    if (!mine || mine.depth <= 0) continue;
    depth += mine.depth;
    hunted += 1;
  }
  return { name: clan.name, depth, weeks: hunted };
}

// ---------------------------------------------------------------------------
// The composer
// ---------------------------------------------------------------------------

const SPAN_CLAUSE: Record<WorldReportSpan, string> = {
  days: 'The world kept running.',
  week: 'A week of the world ran without you.',
  month: 'A month of the world ran without you.',
  season: 'A season of the world ran without you.',
};

/**
 * The sentence the whole feature exists to be allowed to say.
 *
 * It is stated as a fact about the world, not a reassurance about the player,
 * because a reassurance implies there was a reason to worry. Asserted
 * verbatim in the test so no edit can quietly soften it into a hedge.
 */
export const STANDING_INVARIANT =
  'Nothing of yours moved while you were away. Records, snakes, lineage and history are exactly where you left them.';

function weekLine(
  weekKey: string,
  world: WorldSettlement | undefined,
  now: Date | number,
  quoted: string[]
): WorldReportLine {
  // Composing through WP-1.09 even for a week with no roll-up means the
  // conditions in a returning player's report and the conditions in the
  // operator's published post come from one function, never two.
  const settlement: WorldSettlement = world ?? {
    weekKey,
    clans: [],
    personalRecords: 0,
    clanRecords: 0,
    clanFirsts: 0,
  };
  const post = composeWorldSettlementPost(settlement, now);
  const conditions = post?.conditions ?? 'No modifier';
  const when = formatWeekStart(weekKey);

  const named = settlement.clans.slice(0, WORLD_REPORT_CLAN_LIMIT);
  for (const clan of named) quoted.push(clan.name.toUpperCase());

  const tail =
    named.length === 0
      ? 'the Serpent surfaced and submerged unhunted.'
      : `${named
          .map((clan) => `${clan.name.toUpperCase()} reached Depth ${segments(clan.depth)}`)
          .join(', ')}.`;

  return {
    text: `Week of ${when} · ${conditions} — ${tail}`,
    href: serpentWeekArtifactUrl(weekKey),
  };
}

function weeksSection(
  weekKeys: string[],
  byKey: Map<string, WorldSettlement>,
  now: Date | number,
  quoted: string[]
): WorldReportSection {
  const lines: WorldReportLine[] = [];
  if (weekKeys.length === 0) {
    lines.push({ text: 'The Serpent has not submerged since your last run.' });
  } else {
    lines.push({
      text: `${weekKeys.length} Serpent ${
        weekKeys.length === 1 ? 'week' : 'weeks'
      } surfaced and submerged.`,
    });
    const named = weekKeys.slice(0, WORLD_REPORT_WEEK_LIMIT);
    for (const key of named) lines.push(weekLine(key, byKey.get(key), now, quoted));

    const rest = weekKeys.length - named.length;
    if (rest > 0) {
      // Summarised, never enumerated. This one sentence is what keeps a
      // season's return the same length as a week's.
      lines.push({
        text: `${rest} earlier ${rest === 1 ? 'week' : 'weeks'} settled before those.`,
      });
    }
  }
  return { id: 'weeks', title: 'While you were under', lines };
}

function clanSection(clan: ClanWhileAway, quoted: string[]): WorldReportSection {
  const name = clan.name.toUpperCase();
  quoted.push(name);
  const text =
    clan.depth <= 0
      ? `${name} has been quiet — no Depth settled while you were away.`
      : clan.weeks === 1
        ? `${name} reached Depth ${segments(clan.depth)} without you — they left the door open.`
        : `${name} fed the Serpent ${segments(clan.depth)} across ${clan.weeks} weeks without you — they left the door open.`;
  return { id: 'clan', title: 'Your clan', lines: [{ text }] };
}

function recordsSection(weeks: readonly WorldSettlement[]): WorldReportSection | null {
  let personal = 0;
  let clans = 0;
  let firsts = 0;
  for (const week of weeks) {
    personal += week.personalRecords;
    clans += week.clanRecords;
    firsts += week.clanFirsts;
  }
  const lines: WorldReportLine[] = [];
  if (personal > 0) {
    lines.push({
      text: `${personal} ${personal === 1 ? 'hunter' : 'hunters'} went deeper than they ever had.`,
    });
  }
  if (clans > 0) {
    lines.push({
      text: `${clans} ${clans === 1 ? 'clan' : 'clans'} set a deepest week${
        firsts > 0 ? `, ${firsts} of them for the first time` : ''
      }.`,
    });
  }
  // At N = 1 there is nothing here and the section simply is not there. It
  // does not render an empty state, because "no records were set" is not news.
  if (lines.length === 0) return null;
  return { id: 'records', title: 'What the world set', lines };
}

function standingSection(panel: SerpentPanel): WorldReportSection {
  const lines: WorldReportLine[] = [];
  lines.push({
    text:
      panel.you.bestWeekDepth > 0
        ? `Your deepest week still stands at ${segments(panel.you.bestWeekDepth)}.`
        : 'You have no Serpent week on record yet. The next one you hunt is your first.',
  });
  if (panel.you.lifetimeDepth > 0) {
    lines.push({ text: `Lifetime Depth: ${segments(panel.you.lifetimeDepth)}.` });
  }
  lines.push({ text: STANDING_INVARIANT });
  return { id: 'standing', title: 'What still stands', lines };
}

function todaySection(now: Date | number, quoted: string[]): WorldReportSection {
  const day = describeSignalDay(now);
  quoted.push(day.condition.effect);

  const weekKey = serpentWeekKey(now);
  const week = composeWorldSettlementPost(
    { weekKey, clans: [], personalRecords: 0, clanRecords: 0, clanFirsts: 0 },
    now
  );

  const lines: WorldReportLine[] = [
    {
      text: `Today's Signal: ${day.condition.name} — ${day.condition.effect}.`,
      href: signalArtifactUrl(signalDayIndex(now)),
    },
  ];
  if (week) {
    lines.push({
      text: `The Serpent is up. This week: ${week.conditions}.`,
      href: serpentWeekArtifactUrl(weekKey),
    });
  }
  // The way back in is a description of today, not an instruction. There is no
  // button in this payload and no task in this copy.
  return { id: 'today', title: 'Today', lines };
}

/**
 * Compose the reading.
 *
 * Returns `null` — meaning "no report, render nothing" — when the player has
 * never played, when the timestamp is unreadable, or when they have been away
 * for fewer than `WORLD_REPORT_MIN_ABSENT_DAYS`. A player who was here
 * yesterday is shown nothing at all, which is the correct amount of ceremony
 * for having been here yesterday.
 *
 * @throws if its own copy trips the Rule 5 sweep. Deliberately loud, and
 * deliberately fatal to the whole report: the caller reports it and renders
 * nothing, because no report is strictly better than one that tells a
 * returning player they are in arrears.
 */
export function composeWorldReport(
  input: WorldReportInput,
  now: Date | number = Date.now()
): WorldReport | null {
  const { lastSeenAt, panel, weeks } = input;
  if (!lastSeenAt) return null;
  const last = new Date(lastSeenAt).getTime();
  if (Number.isNaN(last)) return null;

  const awayDays = daysAway(lastSeenAt, now);
  if (awayDays < WORLD_REPORT_MIN_ABSENT_DAYS) return null;

  const span = absenceSpan(awayDays);
  const weekKeys = submergedWeeksWhileAway(lastSeenAt, now);
  const byKey = new Map(weeks.map((week) => [week.weekKey, week]));
  // Only the weeks the report names can contribute a record count, so the
  // numbers a player reads always match the weeks printed above them.
  const namedWeeks = weekKeys
    .slice(0, WORLD_REPORT_WEEK_LIMIT)
    .map((key) => byKey.get(key))
    .filter((week): week is WorldSettlement => week !== undefined);

  /** Foreign strings, redacted before the sweep. See `returnLanguage`. */
  const quoted: string[] = [];

  const sections: WorldReportSection[] = [weeksSection(weekKeys, byKey, now, quoted)];

  const clan = clanWhileAway(panel.clan, namedWeeks);
  if (clan) sections.push(clanSection(clan, quoted));

  const records = recordsSection(namedWeeks);
  if (records) sections.push(records);

  sections.push(standingSection(panel));
  sections.push(todaySection(now, quoted));

  const headline = `${awayDays} days away. ${SPAN_CLAUSE[span]}`;

  const links: string[] = [];
  for (const section of sections) {
    for (const line of section.lines) {
      if (line.href && !links.includes(line.href)) links.push(line.href);
    }
  }

  const report: WorldReport = {
    awayDays,
    span,
    weeksSubmerged: weekKeys.length,
    headline,
    sections,
    links,
  };

  const body = sections
    .flatMap((section) => [section.title, ...section.lines.map((line) => line.text)])
    .join('\n');
  const hits = sweepReturn({
    headline: redact(headline, quoted),
    body: redact(body, quoted),
  });
  if (hits.length > 0) {
    throw new Error(`World Report violates Rule 5: ${hits.join('; ')}`);
  }
  return report;
}

/** The whole report as one string — what a sweep, a test or a share reads. */
export function worldReportText(report: WorldReport): string {
  return [
    report.headline,
    ...report.sections.flatMap((section) => [
      section.title,
      ...section.lines.map((line) => line.text),
    ]),
  ].join('\n');
}

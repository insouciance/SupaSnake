/**
 * The World Report — return without debt (Constitution §7.5).
 *
 * This pure composer now reads the current World Serpent truth: aggregate
 * three-day Clan Energy Battle outcomes, the player's monotonic Depth, and
 * today's Signal. It contains no teammate attempt facts and creates no state,
 * reward, claim, task, or balance. Historical weekly-Serpent inputs remain a
 * compatibility path so already-authored tests and archived readings do not
 * lose their meaning; production supplies `energyContext`.
 *
 * Both paths are bounded to four named events, always state what still
 * stands, and sweep product-authored copy for loss, expiry, backlog, debt,
 * claim, and currency language. Foreign clan names and calendar copy are
 * redacted before that sweep. Current battle lines link to the clan artifact;
 * historical week lines retain their immutable week artifact links.
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
import {
  clanArtifactUrl,
  serpentWeekArtifactUrl,
  signalArtifactUrl,
} from '@/lib/share/artifactUrls';
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

export type WorldReportSectionId =
  | 'battles'
  | 'weeks'
  | 'clan'
  | 'records'
  | 'standing'
  | 'today';

export interface WorldReportEnergyBattle {
  battleId: string;
  settledAt: string;
  outcome: 'victor' | 'participant' | 'stalemate' | 'bye';
  clan: {
    id: string;
    name: string;
    tag: string | null;
    depth: number;
  };
  opponent: {
    name: string;
    tag: string | null;
    depth: number;
  } | null;
}

export interface WorldReportEnergyContext {
  standing: {
    bestBattleDepth: number;
    lifetimeDepth: number;
  };
  battles: readonly WorldReportEnergyBattle[];
}

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
  /** Current Energy-Battle cycles named by this report. */
  battleCyclesSettled: number;
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
  /**
   * Current Clan Energy Battle history and monotonic Depth standing. When
   * present, this is the production path. It contains aggregate clan facts
   * only—never another member's attempts, commitment, threshold, or rank.
   */
  energyContext?: WorldReportEnergyContext;
  /** Historical weekly-Serpent compatibility input. */
  panel?: SerpentPanel;
  /**
   * The world's settled weeks, from `readWorldRollup`. Only the weeks the
   * report will actually name need be supplied; a week with no entry still
   * reads, on its conditions alone.
   */
  weeks?: readonly WorldSettlement[];
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

function battleDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'A recent cycle';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function battleLine(
  battle: WorldReportEnergyBattle,
  quoted: string[]
): WorldReportLine {
  const mine = battle.clan.name.toUpperCase();
  quoted.push(mine);
  const href = battle.clan.tag ? clanArtifactUrl(battle.clan.tag) : undefined;
  const when = battleDate(battle.settledAt);

  if (!battle.opponent) {
    return {
      text: `${when} · ${mine} reached Depth ${segments(battle.clan.depth)} in an unmatched battle.`,
      href,
    };
  }

  const rival = battle.opponent.name.toUpperCase();
  quoted.push(rival);
  const difference = Math.abs(battle.clan.depth - battle.opponent.depth);
  const result =
    battle.outcome === 'victor'
      ? `${mine} took the victor honor.`
      : battle.outcome === 'stalemate'
        ? 'The battle settled level.'
        : `${rival} took the victor honor.`;

  return {
    text: `${when} · ${mine} reached Depth ${segments(battle.clan.depth)}; ${rival} reached Depth ${segments(battle.opponent.depth)}. Depth difference: ${segments(difference)}. ${result}`,
    href,
  };
}

function battlesSection(
  battles: readonly WorldReportEnergyBattle[],
  quoted: string[]
): WorldReportSection {
  if (battles.length === 0) {
    return {
      id: 'battles',
      title: 'Clan battles',
      lines: [{ text: 'No Clan Battle settled while you were away.' }],
    };
  }

  return {
    id: 'battles',
    title: 'Clan battles',
    lines: battles.slice(0, WORLD_REPORT_WEEK_LIMIT).map((battle) =>
      battleLine(battle, quoted)
    ),
  };
}

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

function energyStandingSection(
  standing: WorldReportEnergyContext['standing']
): WorldReportSection {
  const lines: WorldReportLine[] = [
    {
      text:
        standing.bestBattleDepth > 0
          ? `Your deepest Clan Battle contribution still stands at ${segments(standing.bestBattleDepth)}.`
          : 'Your first Clan Battle contribution is still ahead.',
    },
  ];
  if (standing.lifetimeDepth > 0) {
    lines.push({ text: `Lifetime Depth: ${segments(standing.lifetimeDepth)}.` });
  }
  lines.push({ text: STANDING_INVARIANT });
  return { id: 'standing', title: 'What still stands', lines };
}

function todaySection(
  now: Date | number,
  quoted: string[],
  includeHistoricalSerpent = true
): WorldReportSection {
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
  if (includeHistoricalSerpent && week) {
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
  const { lastSeenAt, energyContext } = input;
  if (!lastSeenAt) return null;
  const last = new Date(lastSeenAt).getTime();
  if (Number.isNaN(last)) return null;

  const awayDays = daysAway(lastSeenAt, now);
  if (awayDays < WORLD_REPORT_MIN_ABSENT_DAYS) return null;

  const span = absenceSpan(awayDays);
  /** Foreign strings, redacted before the sweep. See `returnLanguage`. */
  const quoted: string[] = [];
  let sections: WorldReportSection[];
  let weekCount = 0;
  let battleCount = 0;

  if (energyContext) {
    const recentBattles = energyContext.battles.slice(0, WORLD_REPORT_WEEK_LIMIT);
    battleCount = recentBattles.length;
    sections = [
      battlesSection(recentBattles, quoted),
      energyStandingSection(energyContext.standing),
      todaySection(now, quoted, false),
    ];
  } else {
    const panel = input.panel;
    if (!panel) return null;
    const weeks = input.weeks ?? [];
    const weekKeys = submergedWeeksWhileAway(lastSeenAt, now);
    weekCount = weekKeys.length;
    const byKey = new Map(weeks.map((week) => [week.weekKey, week]));
    // Only the weeks the report names can contribute a record count, so the
    // numbers a player reads always match the weeks printed above them.
    const namedWeeks = weekKeys
      .slice(0, WORLD_REPORT_WEEK_LIMIT)
      .map((key) => byKey.get(key))
      .filter((week): week is WorldSettlement => week !== undefined);

    sections = [weeksSection(weekKeys, byKey, now, quoted)];
    const clan = clanWhileAway(panel.clan, namedWeeks);
    if (clan) sections.push(clanSection(clan, quoted));
    const records = recordsSection(namedWeeks);
    if (records) sections.push(records);
    sections.push(standingSection(panel));
    sections.push(todaySection(now, quoted));
  }

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
    weeksSubmerged: weekCount,
    battleCyclesSettled: battleCount,
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

/**
 * The World Report — return without debt (Constitution §7.5).
 *
 * The tests that matter here are not "does it render". They are the four
 * promises §7.5 makes and the two the Caps make:
 *
 *   - it reads correctly for a week, a month and a season away;
 *   - it never tells a returning player they are behind on anything;
 *   - it reads meaningfully in a world with two players in it;
 *   - a longer absence does not produce a longer report;
 *   - it requests no claim (§12.2);
 *   - it reports no currency (§12.2).
 */

import {
  absenceSpan,
  clanWhileAway,
  composeWorldReport,
  daysAway,
  STANDING_INVARIANT,
  submergedWeeksWhileAway,
  worldReportText,
  type WorldReport,
  type WorldReportInput,
} from '@/lib/report/worldReport';
import {
  WORLD_REPORT_MIN_ABSENT_DAYS,
  WORLD_REPORT_WEEK_LIMIT,
} from '@/lib/report/config';
import type { WorldSettlement } from '@/lib/growth/settlementPost';
import { emptySerpentPanel, type SerpentPanel } from '@/lib/server/serpent';

/** A Sunday. The current Serpent week runs 2026-07-20 → 2026-07-27. */
const NOW = Date.parse('2026-07-26T12:00:00.000Z');

const A_WEEK_AGO = '2026-07-14T12:00:00.000Z'; // 12 days — one week submerged
const A_MONTH_AGO = '2026-06-20T12:00:00.000Z'; // 36 days
const A_SEASON_AGO = '2026-04-01T12:00:00.000Z'; // 116 days

/**
 * The exact vocabulary a returning player may never meet. Written as one
 * literal so a reader can see the whole promise at once.
 */
const DEBT_WORDS = /lost|lose|missed out|behind|catch up|expired|forfeit|debt|penalty/i;

function panelWith(overrides: Partial<SerpentPanel> = {}): SerpentPanel {
  return { ...emptySerpentPanel(), ...overrides };
}

function week(weekKey: string, overrides: Partial<WorldSettlement> = {}): WorldSettlement {
  return {
    weekKey,
    clans: [],
    personalRecords: 0,
    clanRecords: 0,
    clanFirsts: 0,
    ...overrides,
  };
}

function input(overrides: Partial<WorldReportInput> = {}): WorldReportInput {
  return { lastSeenAt: A_WEEK_AGO, panel: panelWith(), weeks: [], ...overrides };
}

function compose(overrides: Partial<WorldReportInput> = {}): WorldReport {
  const report = composeWorldReport(input(overrides), NOW);
  if (!report) throw new Error('expected a report');
  return report;
}

function lineCount(report: WorldReport): number {
  return report.sections.reduce((total, section) => total + section.lines.length, 0);
}

function section(report: WorldReport, id: string) {
  return report.sections.find((entry) => entry.id === id);
}

// ---------------------------------------------------------------------------

describe('the calendar', () => {
  it('counts whole days away', () => {
    expect(daysAway(A_WEEK_AGO, NOW)).toBe(12);
    expect(daysAway(A_MONTH_AGO, NOW)).toBe(36);
    expect(daysAway(A_SEASON_AGO, NOW)).toBe(116);
  });

  it('never reports a negative absence', () => {
    expect(daysAway('2026-08-01T00:00:00.000Z', NOW)).toBe(0);
  });

  it('reads an absence as days, a week, a month or a season', () => {
    expect(absenceSpan(3)).toBe('days');
    expect(absenceSpan(6)).toBe('days');
    expect(absenceSpan(7)).toBe('week');
    expect(absenceSpan(27)).toBe('week');
    expect(absenceSpan(28)).toBe('month');
    expect(absenceSpan(89)).toBe('month');
    expect(absenceSpan(90)).toBe('season');
    expect(absenceSpan(400)).toBe('season');
  });

  it('counts the weeks that submerged, from the calendar and not from rows', () => {
    // No history, no clan, no settled rows anywhere — the weeks still happened.
    expect(submergedWeeksWhileAway(A_WEEK_AGO, NOW)).toEqual(['2026-07-13']);
    expect(submergedWeeksWhileAway(A_MONTH_AGO, NOW)).toEqual([
      '2026-07-13',
      '2026-07-06',
      '2026-06-29',
      '2026-06-22',
      '2026-06-15',
    ]);
    expect(submergedWeeksWhileAway(A_SEASON_AGO, NOW).length).toBe(16);
  });

  it('excludes the week still running — it has not submerged', () => {
    expect(submergedWeeksWhileAway(A_WEEK_AGO, NOW)).not.toContain('2026-07-20');
  });
});

describe('when there is no report', () => {
  it('says nothing to a player who was here yesterday', () => {
    expect(composeWorldReport(input({ lastSeenAt: '2026-07-25T12:00:00.000Z' }), NOW)).toBeNull();
  });

  it('says nothing below the three-day floor', () => {
    const justUnder = new Date(
      NOW - (WORLD_REPORT_MIN_ABSENT_DAYS - 1) * 24 * 60 * 60 * 1000
    ).toISOString();
    expect(composeWorldReport(input({ lastSeenAt: justUnder }), NOW)).toBeNull();
  });

  it('says nothing to a player who has never played — a first visit is not a return', () => {
    expect(composeWorldReport(input({ lastSeenAt: null }), NOW)).toBeNull();
  });

  it('says nothing on an unreadable timestamp rather than guessing', () => {
    expect(composeWorldReport(input({ lastSeenAt: 'not-a-date' }), NOW)).toBeNull();
  });
});

describe('a week away', () => {
  const report = () =>
    compose({
      lastSeenAt: A_WEEK_AGO,
      weeks: [
        week('2026-07-13', {
          clans: [
            { name: 'Hollow Fang', tag: 'HFG', depth: 51000, contributingMembers: 4 },
          ],
          personalRecords: 3,
          clanRecords: 1,
          clanFirsts: 1,
        }),
      ],
    });

  it('reads as a week', () => {
    expect(report().span).toBe('week');
    expect(report().awayDays).toBe(12);
    expect(report().weeksSubmerged).toBe(1);
  });

  it('leads with the world, not with the player', () => {
    expect(report().headline).toBe('12 days away. A week of the world ran without you.');
  });

  it('names the week, its conditions and who hunted it', () => {
    const lines = section(report(), 'weeks')!.lines.map((line) => line.text);
    expect(lines[0]).toBe('1 Serpent week surfaced and submerged.');
    expect(lines[1]).toContain('Week of 13 July 2026');
    expect(lines[1]).toContain('HOLLOW FANG reached Depth 51,000 segments');
  });

  it('reports what the world set', () => {
    const lines = section(report(), 'records')!.lines.map((line) => line.text);
    expect(lines).toContain('3 hunters went deeper than they ever had.');
    expect(lines).toContain('1 clan set a deepest week, 1 of them for the first time.');
  });
});

describe('the current Clan Energy Battle report', () => {
  const report = () =>
    compose({
      energyContext: {
        standing: { bestBattleDepth: 12400, lifetimeDepth: 48200 },
        battles: [
          {
            battleId: 'battle-1',
            settledAt: '2026-07-25T03:00:00.000Z',
            outcome: 'victor',
            clan: {
              id: 'clan-1',
              name: 'Hollow Fang',
              tag: 'HFG',
              depth: 51000,
            },
            opponent: { name: 'Quiet Scale', tag: 'QTS', depth: 47000 },
          },
        ],
      },
    });

  it('reports settled aggregate battles instead of the retired weekly hunt', () => {
    expect(report().battleCyclesSettled).toBe(1);
    expect(report().weeksSubmerged).toBe(0);
    expect(report().sections.map((entry) => entry.id)).toEqual([
      'battles',
      'standing',
      'today',
    ]);
    const text = worldReportText(report());
    expect(text).toContain('HOLLOW FANG reached Depth 51,000 segments');
    expect(text).toContain('Depth difference: 4,000 segments');
    expect(text).toContain('HOLLOW FANG took the victor honor');
    expect(text).not.toMatch(/Serpent week|surfaced|submerged/);
  });

  it('shows the current battle standing and links only aggregate artifacts', () => {
    expect(section(report(), 'standing')!.lines[0].text).toBe(
      'Your deepest Clan Battle contribution still stands at 12,400 segments.'
    );
    expect(report().links.some((href) => href.includes('/c/HFG'))).toBe(true);
    expect(report().links.some((href) => /\/s\/\d+$/.test(href))).toBe(true);
    const raw = JSON.stringify(report());
    expect(raw).not.toMatch(/teammate|commitment|threshold|generation|attempts/);
  });
});

describe('a month away', () => {
  const report = () =>
    compose({
      lastSeenAt: A_MONTH_AGO,
      weeks: [
        week('2026-07-13', { personalRecords: 2 }),
        week('2026-07-06', { personalRecords: 1 }),
      ],
    });

  it('reads as a month', () => {
    expect(report().span).toBe('month');
    expect(report().headline).toBe('36 days away. A month of the world ran without you.');
    expect(report().weeksSubmerged).toBe(5);
  });

  it('names at most four weeks and summarises the rest — a list is not a queue', () => {
    const lines = section(report(), 'weeks')!.lines;
    // 1 count line + 4 named weeks + 1 summary line.
    expect(lines).toHaveLength(WORLD_REPORT_WEEK_LIMIT + 2);
    expect(lines[lines.length - 1].text).toBe('1 earlier week settled before those.');
  });

  it('reads a week with no roll-up on its conditions alone', () => {
    const bare = compose({ lastSeenAt: A_MONTH_AGO, weeks: [] });
    const lines = section(bare, 'weeks')!.lines.map((line) => line.text);
    expect(lines[1]).toContain('the Serpent surfaced and submerged unhunted.');
  });
});

describe('a season away', () => {
  const report = () =>
    compose({ lastSeenAt: A_SEASON_AGO, weeks: [week('2026-07-13')] });

  it('reads as a season', () => {
    expect(report().span).toBe('season');
    expect(report().headline).toBe('116 days away. A season of the world ran without you.');
    expect(report().weeksSubmerged).toBe(16);
  });

  it('is no longer than a month away — length is where a backlog would show', () => {
    const month = compose({ lastSeenAt: A_MONTH_AGO, weeks: [week('2026-07-13')] });
    expect(lineCount(report())).toBe(lineCount(month));
  });

  it('summarises the twelve weeks it does not name', () => {
    const lines = section(report(), 'weeks')!.lines;
    expect(lines[lines.length - 1].text).toBe('12 earlier weeks settled before those.');
  });
});

describe('a returning player is never told they lost something', () => {
  const cases: Array<[string, WorldReportInput]> = [
    ['a week', input({ lastSeenAt: A_WEEK_AGO, weeks: [week('2026-07-13')] })],
    [
      'a month',
      input({
        lastSeenAt: A_MONTH_AGO,
        panel: panelWith({
          you: { ...emptySerpentPanel().you, bestWeekDepth: 12400, lifetimeDepth: 48200 },
          clan: {
            id: 'c1',
            name: 'Hollow Fang',
            tag: 'HFG',
            memberCount: 4,
            depth: 0,
            bestWeekDepth: 51000,
            lifetimeDepth: 120000,
            members: [],
            hiddenMembers: 0,
          },
        }),
        weeks: [
          week('2026-07-13', {
            clans: [
              { name: 'Hollow Fang', tag: 'HFG', depth: 51000, contributingMembers: 4 },
            ],
            personalRecords: 9,
            clanRecords: 2,
            clanFirsts: 1,
          }),
        ],
      }),
    ],
    ['a season', input({ lastSeenAt: A_SEASON_AGO, weeks: [] })],
    ['an empty world', input({ lastSeenAt: A_SEASON_AGO, panel: panelWith(), weeks: [] })],
  ];

  it.each(cases)('%s away carries no word of loss, backlog or debt', (_label, given) => {
    const text = worldReportText(composeWorldReport(given, NOW)!);
    expect(text).not.toMatch(DEBT_WORDS);
  });

  it.each(cases)('%s away grades nobody and ranks nothing (Rule 8)', (_label, given) => {
    const text = worldReportText(composeWorldReport(given, NOW)!);
    expect(text).not.toMatch(/\b(?:rank|ranked|ranking|position|placed|top\s+\d|#\d|tier)\b/i);
  });

  it.each(cases)('%s away always says what still stands', (_label, given) => {
    const report = composeWorldReport(given, NOW)!;
    const standing = report.sections.find((entry) => entry.id === 'standing');
    expect(standing).toBeDefined();
    expect(standing!.lines.map((line) => line.text)).toContain(STANDING_INVARIANT);
  });

  it('reports a clan that hunted without them as an open door, not a deficit', () => {
    const report = compose({
      lastSeenAt: A_WEEK_AGO,
      panel: panelWith({
        clan: {
          id: 'c1',
          name: 'Hollow Fang',
          tag: 'HFG',
          memberCount: 4,
          depth: 0,
          bestWeekDepth: 51000,
          lifetimeDepth: 120000,
          members: [],
          hiddenMembers: 0,
        },
      }),
      weeks: [
        week('2026-07-13', {
          clans: [
            { name: 'Hollow Fang', tag: 'HFG', depth: 51000, contributingMembers: 4 },
          ],
        }),
      ],
    });
    expect(section(report, 'clan')!.lines[0].text).toBe(
      'HOLLOW FANG reached Depth 51,000 segments without you — they left the door open.'
    );
  });

  it('states the standing numbers that did not move', () => {
    const report = compose({
      panel: panelWith({
        you: { ...emptySerpentPanel().you, bestWeekDepth: 12400, lifetimeDepth: 48200 },
      }),
    });
    const lines = section(report, 'standing')!.lines.map((line) => line.text);
    expect(lines[0]).toBe('Your deepest week still stands at 12,400 segments.');
    expect(lines[1]).toBe('Lifetime Depth: 48,200 segments.');
  });

  it('refuses to compose at all if its own copy ever acquires a debt word', () => {
    // The guard, exercised through the module that enforces it. A future edit
    // that adds "catch up" to any sentence fails here and never ships.
    const { returnDebtTerms } = jest.requireActual<
      typeof import('@/lib/report/returnLanguage')
    >('@/lib/report/returnLanguage');
    expect(returnDebtTerms('You are 6 weeks behind — catch up.')).toEqual(
      expect.arrayContaining([expect.stringContaining('backlog')])
    );
  });
});

describe('an N = 1 world reads meaningfully', () => {
  // Two real players, no clans, no settled rows, no records anywhere.
  const report = () => compose({ lastSeenAt: A_MONTH_AGO, panel: panelWith(), weeks: [] });

  it('still has a world to report — the calendar, not the crowd', () => {
    expect(report().weeksSubmerged).toBe(5);
    expect(section(report(), 'weeks')!.lines.length).toBeGreaterThan(1);
  });

  it('names each week by its conditions, which exist at any population', () => {
    const lines = section(report(), 'weeks')!.lines.map((line) => line.text);
    // `Week of 6 July 2026 · <conditions> — ...`
    expect(lines[1]).toMatch(/^Week of \d+ \w+ 2026 · .+ — /);
    expect(lines[1]).not.toContain('· —');
  });

  it('renders no empty state and no apology for a small world', () => {
    for (const entry of report().sections) {
      expect(entry.lines.length).toBeGreaterThan(0);
      for (const line of entry.lines) expect(line.text.trim().length).toBeGreaterThan(0);
    }
    expect(worldReportText(report())).not.toMatch(/\b(?:nobody|no one|empty|quiet\s+world)\b/i);
  });

  it('omits the crowd sections entirely rather than showing them at zero', () => {
    expect(section(report(), 'records')).toBeUndefined();
    expect(section(report(), 'clan')).toBeUndefined();
  });

  it('tells a player with no Serpent history that their first week is ahead of them', () => {
    expect(section(report(), 'standing')!.lines[0].text).toBe(
      'You have no Serpent week on record yet. The next one you hunt is your first.'
    );
  });

  it('always offers today — the way back in exists at any population', () => {
    const lines = section(report(), 'today')!.lines.map((line) => line.text);
    expect(lines[0]).toMatch(/^Today's Signal: .+ — .+\.$/);
    expect(lines[1]).toMatch(/^The Serpent is up\. This week: .+\.$/);
  });
});

describe('the Caps (§12.2) and Rule 14', () => {
  const report = () =>
    compose({
      lastSeenAt: A_MONTH_AGO,
      weeks: [week('2026-07-13', { personalRecords: 4, clanRecords: 1, clanFirsts: 1 })],
    });

  it('requests no claim URL — every link is a readable artifact', () => {
    for (const href of report().links) {
      expect(href).toMatch(/^https:\/\/[^/]+\/(?:w|s)\//);
      expect(href).not.toMatch(/\/api\//);
      expect(href).not.toMatch(/claim|collect|redeem|grant/i);
    }
    expect(report().links.length).toBeGreaterThan(0);
  });

  it('links a Serpent week and a Signal day — both already have an image and a way in', () => {
    expect(report().links.some((href) => href.includes('/w/2026-07-13'))).toBe(true);
    expect(report().links.some((href) => /\/s\/\d+$/.test(href))).toBe(true);
  });

  it('carries no currency anywhere in the payload', () => {
    const raw = JSON.stringify(report());
    expect(raw).not.toMatch(/\b(?:DNA|energy|charges?|balance|wallet|credits?|gems?|XP)\b/i);
  });

  it('carries no claim, collect, expiry or amount field', () => {
    const raw = JSON.stringify(report());
    expect(raw).not.toMatch(/"(?:claimUrl|claim|collect|amount|reward|expiresAt|pending|owed)"/i);
  });

  it('is a readback and nothing else — no button, no task, no instruction', () => {
    const text = worldReportText(report());
    expect(text).not.toMatch(/\b(?:tap|press|click|start now|play now|do this|complete)\b/i);
  });
});

describe('the clan roll-up', () => {
  const mine = {
    id: 'c1',
    name: 'Hollow Fang',
    tag: 'HFG',
    memberCount: 4,
    depth: 0,
    bestWeekDepth: 0,
    lifetimeDepth: 0,
    members: [],
    hiddenMembers: 0,
  };

  it('sums only the weeks the report is reading', () => {
    expect(
      clanWhileAway(mine, [
        week('2026-07-13', {
          clans: [{ name: 'Hollow Fang', tag: 'HFG', depth: 51000, contributingMembers: 4 }],
        }),
        week('2026-07-06', {
          clans: [{ name: 'Hollow Fang', tag: 'HFG', depth: 9000, contributingMembers: 2 }],
        }),
      ])
    ).toEqual({ name: 'Hollow Fang', depth: 60000, weeks: 2 });
  });

  it('matches on tag, so two clans sharing a name are never conflated', () => {
    expect(
      clanWhileAway(mine, [
        week('2026-07-13', {
          clans: [{ name: 'Hollow Fang', tag: 'OTH', depth: 51000, contributingMembers: 4 }],
        }),
      ])
    ).toEqual({ name: 'Hollow Fang', depth: 0, weeks: 0 });
  });

  it('says a quiet clan was quiet, which is a fact and not a grade', () => {
    const report = compose({ panel: panelWith({ clan: mine }), weeks: [week('2026-07-13')] });
    expect(section(report, 'clan')!.lines[0].text).toBe(
      'HOLLOW FANG has been quiet — no Depth settled while you were away.'
    );
  });
});

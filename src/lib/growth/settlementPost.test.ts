/**
 * The auto-composed settlement post, from a real settlement payload.
 *
 * The fixture below is shaped exactly like `GET /api/serpent/panel`'s response
 * — the same `SerpentPanel` type the route returns — so the post is proven to
 * compose from settlement data rather than from a bespoke test shape.
 */

import {
  composeSettlementPost,
  recordLines,
  type SettlementPost,
} from './settlementPost';
import { commercialTerms } from './commercialLanguage';
import { emptySerpentPanel, type SerpentPanel } from '@/lib/server/serpent';
import {
  payload,
  serpentWeekArtifactUrl,
  settlementLines,
  settlementShare,
} from '@/lib/share/artifactUrls';
import { describeSerpentWeek, serpentWeekIndex } from '@/shared/game/serpent';

// A Monday, and the Monday after it. Both are real Serpent weeks.
const WEEK = '2026-07-13';
const NEXT_WEEK = '2026-07-20';
// Well inside the week AFTER `NEXT_WEEK`, so both have submerged.
const NOW = Date.parse('2026-07-29T12:00:00.000Z');

function panelWithClan(overrides: Partial<SerpentPanel> = {}): SerpentPanel {
  const base = emptySerpentPanel();
  return {
    ...base,
    live: true,
    week: {
      id: 'week-uuid',
      weekStart: NEXT_WEEK,
      startsAt: `${NEXT_WEEK}T00:00:00.000Z`,
      endsAt: '2026-07-27T00:00:00.000Z',
      seed: describeSerpentWeek(new Date(`${NEXT_WEEK}T00:00:00.000Z`)).seed,
      modifiers: [],
      settledAt: '2026-07-27T00:05:00.000Z',
    },
    you: {
      ...base.you,
      depth: 1240,
      attempts: 5,
      bestYield: 620,
      countedYields: [620, 380, 240],
      bestWeekDepth: 1240,
      lifetimeDepth: 3100,
      deltaVsBestWeek: 0,
    },
    clan: {
      id: 'clan-uuid',
      name: 'Hollow Fang',
      tag: 'HFG',
      memberCount: 4,
      depth: 4820,
      bestWeekDepth: 4820,
      lifetimeDepth: 9900,
      members: [
        { playerId: 'p1', handle: 'Sans_Souci', depth: 1240, attempts: 5 },
        { playerId: 'p2', handle: 'Nadir', depth: 2100, attempts: 6 },
        { playerId: 'p3', handle: 'Coil', depth: 1480, attempts: 4 },
        { playerId: 'p4', handle: 'Absent', depth: 0, attempts: 0 },
      ],
      hiddenMembers: 0,
    },
    history: [
      { weekStart: WEEK, depth: 1240, clanDepth: 4820 },
      { weekStart: '2026-07-06', depth: 860, clanDepth: 3100 },
    ],
    chronicle: [
      {
        kind: 'personal_best_week',
        weekStart: WEEK,
        depth: 1240,
        previousDepth: 860,
        at: '2026-07-20T00:05:00.000Z',
      },
      {
        kind: 'clan_best_week',
        weekStart: WEEK,
        depth: 4820,
        previousDepth: 3100,
        at: '2026-07-20T00:05:00.000Z',
      },
    ],
    ...overrides,
  };
}

/** A clan of one: the §9.3 default case, not an edge. */
function panelClanOfOne(): SerpentPanel {
  const base = panelWithClan();
  return {
    ...base,
    clan: {
      ...base.clan!,
      name: 'Lone Coil',
      tag: 'LNC',
      memberCount: 1,
      depth: 1240,
      bestWeekDepth: 1240,
      lifetimeDepth: 2100,
      members: [{ playerId: 'p1', handle: 'Sans_Souci', depth: 1240, attempts: 5 }],
      hiddenMembers: 0,
    },
    history: [{ weekStart: WEEK, depth: 1240, clanDepth: 1240 }],
    chronicle: [
      {
        kind: 'clan_best_week',
        weekStart: WEEK,
        depth: 1240,
        previousDepth: 0,
        at: '2026-07-20T00:05:00.000Z',
      },
    ],
  };
}

/** No clan at all — a player hunting alone. */
function panelNoClan(): SerpentPanel {
  const base = panelWithClan();
  return { ...base, clan: null };
}

function post(panel: SerpentPanel, week = WEEK): SettlementPost {
  const composed = composeSettlementPost(panel, week, NOW);
  expect(composed).not.toBeNull();
  return composed!;
}

describe('composeSettlementPost — from a real settlement payload', () => {
  it('composes the clan settlement, its members and its record', () => {
    const composed = post(panelWithClan());

    expect(composed.weekKey).toBe(WEEK);
    expect(composed.weekIndex).toBe(
      serpentWeekIndex(new Date(`${WEEK}T00:00:00.000Z`))
    );
    expect(composed.headline).toBe('HOLLOW FANG reached Depth 4,820 — best week yet');
    expect(composed.lines[0]).toBe(`SUPASNAKE · World Serpent · week of ${WEEK}`);
    // Three members had a Depth; the fourth was away and is not counted.
    expect(composed.lines).toContain('3 members hunted');
    expect(composed.lines).toContain(`Conditions: ${composed.conditions}`);
  });

  it('is WP-1.08’s share artifact with the week’s facts appended, not a second composer', () => {
    const panel = panelWithClan();
    const composed = post(panel);
    const shipped = settlementShare({
      weekKey: WEEK,
      weekIndex: composed.weekIndex,
      clanName: 'Hollow Fang',
      clanTag: 'HFG',
      depth: 4820,
      bestWeek: true,
      contributingMembers: 3,
    });

    expect(composed.share.title).toBe(shipped.title);
    expect(composed.share.url).toBe(shipped.url);
    // The shipped card's lines open the post, unchanged and in order.
    const shippedLines = settlementLines({
      weekKey: WEEK,
      weekIndex: composed.weekIndex,
      clanName: 'Hollow Fang',
      clanTag: 'HFG',
      depth: 4820,
      bestWeek: true,
      contributingMembers: 3,
    });
    expect(composed.lines.slice(0, shippedLines.length)).toEqual(shippedLines);
  });

  it('keeps the WP-0.08 invariant: the URL is the last line of the share text', () => {
    const composed = post(panelWithClan());
    const lines = composed.share.text.split('\n');
    expect(lines[lines.length - 1]).toBe(composed.share.url);
    expect(composed.share.url).toBe(serpentWeekArtifactUrl(WEEK, 'HFG'));
  });

  it('carries the week’s records as good news only', () => {
    const composed = post(panelWithClan());
    expect(composed.lines).toContain(
      'A deepest week: 1,240 segments, past a standing 860 segments.'
    );
    expect(composed.lines).toContain(
      "A clan's deepest week: 4,820 segments, past a standing 3,100 segments."
    );
    expect(composed.share.text).not.toMatch(/lost|dropped|fell|decay|expired|behind/i);
  });

  it('reads records only for the week it was asked about', () => {
    const panel = panelWithClan();
    expect(recordLines(panel, NEXT_WEEK)).toEqual([]);
    expect(recordLines(panel, WEEK)).toHaveLength(2);
  });
});

describe('composeSettlementPost — N = 1', () => {
  it('composes a real post for a clan of one, in the singular', () => {
    const composed = post(panelClanOfOne());
    expect(composed.headline).toBe('LONE COIL reached Depth 1,240 — best week yet');
    expect(composed.lines).toContain('1 member hunted');
    expect(composed.lines).toContain("A clan's first settled week: 1,240 segments.");
    expect(composed.share.url).toBe(serpentWeekArtifactUrl(WEEK, 'LNC'));
  });

  it('composes a post for a player with no clan at all, without apologising', () => {
    const composed = post(panelNoClan());
    expect(composed.lines[0]).toBe(`SUPASNAKE · World Serpent · week of ${WEEK}`);
    expect(composed.headline).toContain('Depth 1,240 segments');
    expect(composed.lines).toContain('Hunted without a clan — this Depth is one player’s.');
    expect(composed.share.url).toBe(serpentWeekArtifactUrl(WEEK, null));
    // No empty roster, no "0 members", no invitation to go find some people.
    expect(composed.share.text).not.toMatch(/0 members|no members|invite|recruit/i);
  });

  it('a first week reads as a first week, never as "unranked"', () => {
    const base = panelNoClan();
    const first: SerpentPanel = {
      ...base,
      history: [{ weekStart: WEEK, depth: 1240, clanDepth: null }],
      chronicle: [],
    };
    const composed = post(first);
    expect(composed.headline).toBe('Depth 1,240 segments — a first week on the hunt.');
    expect(composed.share.text).not.toMatch(/unranked|not qualified|minimum/i);
  });
});

describe('composeSettlementPost — a week that was missed', () => {
  it('says the week ran and submerged, and never that anything was lost', () => {
    const away: SerpentPanel = {
      ...panelNoClan(),
      history: [],
      chronicle: [],
      you: { ...emptySerpentPanel().you },
    };
    const composed = post(away);
    expect(composed.lines).toContain('The week ran its course and submerged.');
    expect(composed.lines).toContain('The Serpent surfaces again every Monday.');
    expect(composed.share.text).not.toMatch(
      /lost|missed out|forfeit|expired|reset|streak|catch up|falling behind/i
    );
  });
});

describe('composeSettlementPost — refusal cases', () => {
  it('returns null for a key that names no Serpent week', () => {
    expect(composeSettlementPost(panelWithClan(), 'not-a-week', NOW)).toBeNull();
    // A Tuesday is not the start of a Serpent week.
    expect(composeSettlementPost(panelWithClan(), '2026-07-14', NOW)).toBeNull();
  });

  it('returns null for a week that has not started', () => {
    expect(composeSettlementPost(panelWithClan(), '2027-01-04', NOW)).toBeNull();
  });

  it('throws rather than publishing a post that breaks Rule 7', () => {
    const panel = panelWithClan();
    const selling: SerpentPanel = {
      ...panel,
      clan: { ...panel.clan!, name: 'Buy The Premium Pack' },
    };
    expect(() => composeSettlementPost(selling, WEEK, NOW)).toThrow(/Rule 7/);
  });
});

describe('composeSettlementPost — Rule 7, structurally', () => {
  const cases: [string, () => SerpentPanel][] = [
    ['a clan settlement', panelWithClan],
    ['a clan of one', panelClanOfOne],
    ['no clan', panelNoClan],
    [
      'a missed week',
      () => ({ ...panelNoClan(), history: [], chronicle: [], you: emptySerpentPanel().you }),
    ],
  ];

  it.each(cases)('carries zero commercial vocabulary: %s', (_label, build) => {
    const composed = post(build());
    expect(commercialTerms(composed.share.title)).toEqual([]);
    expect(commercialTerms(composed.share.text)).toEqual([]);
    for (const line of composed.lines) {
      expect(commercialTerms(line)).toEqual([]);
    }
  });

  it('never carries a price, a link to a store, or a call to buy', () => {
    const composed = post(panelWithClan());
    expect(composed.share.text).not.toMatch(/[$€£]/);
    expect(composed.share.text).not.toMatch(/\/shop|\/store|\/pricing|checkout/i);
  });
});

describe('composeSettlementPost — the payload helper is not bypassed', () => {
  it('builds its share through `payload`, so the URL cannot go missing', () => {
    const composed = post(panelWithClan());
    const rebuilt = payload(composed.share.title, composed.lines, composed.share.url);
    expect(composed.share).toEqual(rebuilt);
  });
});

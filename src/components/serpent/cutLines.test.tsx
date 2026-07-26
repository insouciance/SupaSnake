/**
 * Rule 8, asserted structurally over everything WP-1.07 renders.
 *
 * "No cut lines or minimums anywhere." Copy review cannot hold that line for
 * long — a helpful sentence added six months from now ("you need one more run
 * to qualify") reads as kindness and is exactly the thing forbidden. So this
 * suite renders every panel in every state it has and asserts, over the
 * resulting text, that the vocabulary of a cut line never appears.
 *
 * WHY IT ASSERTS ON RENDERED TEXT AND NOT ON SOURCE
 *
 *   The source files discuss cut lines at length — they have to, to explain why
 *   they contain none. What matters is what a player reads, so the subject of
 *   the assertion is `container.textContent` after a render, gathered across
 *   every state each component can be in. A word that reaches the DOM fails;
 *   a word in a comment explaining its own absence does not.
 *
 * WHY THE STATES ARE ENUMERATED HERE RATHER THAN SAMPLED
 *
 *   The states that would tempt someone into a threshold are the sparse ones —
 *   a clan of one, a first week, an empty directory, a flag-off panel — so
 *   those are the states this file spends most of its lines on. If a new state
 *   is added to any of these components, it belongs in `SURFACES` below.
 */

import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { SerpentWeekPanel } from './SerpentWeekPanel';
import { MondayBriefing } from './MondayBriefing';
import { ContributionList } from './ContributionList';
import { ClanHuntPanel } from '@/components/clan/ClanHuntPanel';
import { ClanDirectory } from '@/components/clan/ClanDirectory';
import { ClanFoundingPrompt } from '@/components/clan/ClanFoundingPrompt';
import { SERPENT_UNLOCK_BANKED_RUNS } from '@/lib/serpent/config';
import { emptySerpentPanel, type SerpentPanel } from '@/lib/server/serpent';
import { emptyClanHuntPanel, type ClanHuntPanel as HuntData } from '@/lib/server/clanHunt';

const NOW = Date.parse('2026-07-27T09:00:00.000Z');
const LAST_MONDAY = '2026-07-20';

function serpentPanel(overrides: Partial<SerpentPanel> = {}): SerpentPanel {
  return {
    ...emptySerpentPanel(),
    live: true,
    week: {
      id: 'w1',
      weekStart: '2026-07-27',
      startsAt: '2026-07-27T00:00:00.000Z',
      endsAt: '2026-08-03T00:00:00.000Z',
      seed: 'S0001abc',
      modifiers: [],
      settledAt: null,
    },
    ...overrides,
  };
}

function huntData(overrides: Partial<HuntData> = {}): HuntData {
  return {
    ...emptyClanHuntPanel(),
    live: true,
    clan: {
      id: 'c1',
      name: 'Lone Coil',
      tag: 'LC',
      bannerId: null,
      emblemId: null,
      colorPrimary: null,
      colorSecondary: null,
      memberCount: 1,
      maxMembers: 20,
      softFullMembers: 20,
      inviteCode: 'ABCD1234',
      disbandedAt: null,
    },
    you: {
      role: 'owner',
      joinedAt: '2026-07-20T00:00:00Z',
      tenureSince: '2026-07-20T00:00:00Z',
    },
    week: {
      id: 'w1',
      weekStart: '2026-07-27',
      startsAt: '2026-07-27T00:00:00.000Z',
      endsAt: '2026-08-03T00:00:00.000Z',
    },
    ...overrides,
  };
}

const SOLO_CLAN = {
  id: 'c1',
  name: 'Lone Coil',
  tag: 'LC',
  memberCount: 1,
  depth: 320,
  bestWeekDepth: 0,
  lifetimeDepth: 320,
  members: [{ playerId: 'p1', handle: 'Sans_Souci', depth: 320, attempts: 1 }],
  hiddenMembers: 0,
};

/** Every state these surfaces have. New states belong in this list. */
const SURFACES: Array<[string, ReactElement]> = [
  // The Serpent week panel.
  ['week panel, flag off', <SerpentWeekPanel key="a" panel={emptySerpentPanel()} />],
  ['week panel, N=1 first week, no clan', <SerpentWeekPanel key="b" panel={serpentPanel()} />],
  [
    'week panel, clan of one',
    <SerpentWeekPanel key="c" panel={serpentPanel({ clan: SOLO_CLAN })} youPlayerId="p1" />,
  ],
  [
    'week panel, quieter week than the best one',
    <SerpentWeekPanel
      key="d"
      panel={serpentPanel({
        you: { ...emptySerpentPanel().you, depth: 900, attempts: 4, bestWeekDepth: 1400 },
        clan: { ...SOLO_CLAN, memberCount: 4, depth: 2100, bestWeekDepth: 3000, hiddenMembers: 2 },
      })}
    />,
  ],

  // The Monday briefing.
  [
    'briefing, missed week',
    <MondayBriefing
      key="e"
      panel={{ ...emptySerpentPanel(), live: true, history: [{ weekStart: '2026-07-06', depth: 1400, clanDepth: null }] }}
      weekKey={LAST_MONDAY}
      now={NOW}
    />,
  ],
  [
    'briefing, N=1 first week',
    <MondayBriefing
      key="f"
      panel={{ ...emptySerpentPanel(), live: true, history: [{ weekStart: LAST_MONDAY, depth: 320, clanDepth: null }] }}
      weekKey={LAST_MONDAY}
      now={NOW}
    />,
  ],
  [
    'briefing, unknown week key',
    <MondayBriefing key="g" panel={{ ...emptySerpentPanel(), live: true }} weekKey="2026-07-22" now={NOW} />,
  ],
  [
    'briefing, paired and lost',
    <MondayBriefing
      key="h"
      panel={{ ...emptySerpentPanel(), live: true, history: [{ weekStart: LAST_MONDAY, depth: 900, clanDepth: 900 }] }}
      weekKey={LAST_MONDAY}
      rival={{
        clanId: 'c2',
        name: 'Dragon Lords',
        tag: 'DRAG',
        sizeBand: 1,
        activityBand: 1,
        standingRival: true,
        yourDepth: 900,
        theirDepth: 1200,
        settled: true,
        outcome: 'lost',
      }}
      rivalWeekStart={LAST_MONDAY}
      now={NOW}
    />,
  ],

  // Contribution display.
  [
    'contribution list, empty week',
    <ContributionList key="i" members={[]} hiddenMembers={0} memberCount={1} />,
  ],
  [
    'contribution list, one member and two withheld',
    <ContributionList
      key="j"
      members={[{ playerId: 'p1', handle: 'Sans_Souci', depth: 2315, attempts: 3 }]}
      hiddenMembers={2}
      memberCount={3}
      youPlayerId="p1"
    />,
  ],
  [
    'contribution list, a member at zero',
    <ContributionList
      key="k"
      members={[{ playerId: 'p2', handle: 'viper', depth: 0, attempts: 0 }]}
      hiddenMembers={0}
      memberCount={2}
    />,
  ],

  // The clan hunt panel.
  ['hunt panel, flag off', <ClanHuntPanel key="l" data={emptyClanHuntPanel()} />],
  [
    'hunt panel, clan of one with no rival',
    <ClanHuntPanel
      key="m"
      data={huntData({ members: [{ playerId: 'p1', handle: 'Sans_Souci', depth: 0, attempts: 0 }] })}
    />,
  ],
  [
    'hunt panel, rival and rivalry history',
    <ClanHuntPanel
      key="n"
      data={huntData({
        primary: { depth: 900, bestWeekDepth: 1400, lifetimeDepth: 9000, deltaVsBestWeek: -500, isBestWeekSoFar: false },
        members: [{ playerId: 'p1', handle: 'Sans_Souci', depth: 900, attempts: 3 }],
        hiddenMembers: 1,
        laurels: 3,
        rival: {
          clanId: 'c2',
          name: 'Dragon Lords',
          tag: 'DRAG',
          sizeBand: 1,
          activityBand: 1,
          standingRival: true,
          yourDepth: 900,
          theirDepth: 1200,
          settled: true,
          outcome: 'lost',
        },
        rivalry: {
          rivalClanId: 'c2',
          name: 'Dragon Lords',
          tag: 'DRAG',
          meetings: 4,
          wins: 2,
          losses: 2,
          draws: 0,
          streakIsYours: false,
          streakLength: 1,
          closestMargin: 40,
          largestMargin: 600,
          firstPairedAt: '2026-06-29T00:00:00Z',
          lastPairedAt: '2026-07-20T00:00:00Z',
        },
      })}
    />,
  ],

  // The directory and the founding prompt.
  ['directory, empty', <ClanDirectory key="o" clans={[]} />],
  [
    'directory, one clan of one',
    <ClanDirectory
      key="p"
      clans={[{ id: 'c1', name: 'Lone Coil', tag: 'LC', memberCount: 1, bestWeekDepth: 320, lastHuntedWeek: LAST_MONDAY }]}
    />,
  ],
  [
    'founding prompt, at the ramp beat',
    <ClanFoundingPrompt key="q" inClan={false} bankedRuns={SERPENT_UNLOCK_BANKED_RUNS} />,
  ],
  [
    'founding prompt, below the ramp beat',
    <ClanFoundingPrompt key="r" inClan={false} bankedRuns={1} />,
  ],
];

/**
 * The vocabulary of a cut line.
 *
 * Each entry is a word a player could read as "there is a line, and you may be
 * on the wrong side of it". Some are obvious (threshold, minimum, qualify);
 * some are the polite forms that actually get written (eligible, requirement,
 * target, milestone, "you need"). A word being absent from the product today is
 * the point — this list exists so it stays absent.
 */
const CUT_LINE_WORDS: Array<[string, RegExp]> = [
  ['threshold', /\bthreshold/i],
  ['minimum', /\bminimum|\bmin\.\s/i],
  ['at least', /\bat least\b/i],
  ['requirement', /\brequire|\brequirement|\brequired\b/i],
  ['qualify', /\bqualif/i],
  ['eligible', /\beligib/i],
  ['cut line / cutoff', /\bcut ?off|\bcut line/i],
  ['quota', /\bquota\b/i],
  ['target', /\btarget\b/i],
  ['milestone', /\bmilestone/i],
  ['goal', /\bgoal\b/i],
  ['you need', /\byou need\b|\bneeds? (?:to|another|more)\b/i],
  ['rank / ranking', /\brank(?:ed|ing|s)?\b/i],
  ['placement', /\bplace(?:d|ment)?\b|\bposition\b/i],
  ['tier', /\btier\b/i],
  // "pass" has an innocent temporal sense the briefing genuinely needs — "the
  // week passed and its runs went with it" is the Rule 5 sentence — so the
  // evaluative senses are enumerated instead of banning the word outright.
  // "fail" has no innocent sense on these surfaces and is banned in full.
  ['fail', /\bfail(?:ed|ing|ure|s)?\b/i],
  ['pass as a verdict', /\bpass\/fail\b|\bpassing (?:mark|grade|score)\b|\bdid not pass\b|\bpasses the\b/i],
  ['locked / unlock', /\block(?:ed)?\b|\bunlock/i],
  ['percentage', /%/],
  ['top N', /\btop \d+\b/i],
  ['out of / N of M ratio', /\b\d+\s*\/\s*\d+\b/],
  ['more to go', /\bto go\b|\bremaining\b|\bso far this week you\b/i],
];

/** The one surface whose whole job is to render nothing (Rule 8's ramp). */
const DELIBERATELY_EMPTY = 'founding prompt, below the ramp beat';

describe('the surfaces above actually render something', () => {
  // Without this, every Rule 8 assertion below would pass vacuously the day a
  // component started returning null. An empty panel is the failure mode this
  // work package exists to prevent, so it is asserted against directly.
  it.each(SURFACES)('%s', (name, element) => {
    const { container } = render(element);
    const text = (container.textContent ?? '').trim();

    if (name === DELIBERATELY_EMPTY) {
      expect(text).toBe('');
      return;
    }
    // Low enough for the shortest real state (one row and a label), high
    // enough that a heading over an empty body could not clear it.
    expect(text.length).toBeGreaterThan(40);
  });
});

describe('no cut line or minimum appears on any WP-1.07 surface (Rule 8)', () => {
  it.each(SURFACES)('%s', (_name, element) => {
    const { container } = render(element);
    const text = container.textContent ?? '';

    for (const [label, pattern] of CUT_LINE_WORDS) {
      expect({ label, text: text.match(pattern)?.[0] ?? null }).toEqual({
        label,
        text: null,
      });
    }
  });
});

describe('no commercial surface appears on any of them (Rule 7)', () => {
  const COMMERCE = /\bbuy\b|\bpurchase|\bprice\b|\bcheckout\b|\bsubscribe\b|\bpremium\b|\bbundle\b|\boffer\b|[€$]\d|\bgems?\b|\bcoins?\b/i;

  it.each(SURFACES)('%s', (_name, element) => {
    const { container } = render(element);
    expect(container.textContent ?? '').not.toMatch(COMMERCE);
  });
});

describe('no lever over another member appears on any of them (no officer role)', () => {
  const LEVER = /\bpromote|\bdemote|\bkick\b|\bwarn(?:ing)?\b|\bofficer|\bpermission|\bapprove\b|\bremove member/i;

  it.each(SURFACES)('%s', (_name, element) => {
    const { container } = render(element);
    expect(container.textContent ?? '').not.toMatch(LEVER);
  });
});

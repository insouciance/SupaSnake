/**
 * The card models (WP-1.08). Copy, provenance and number formatting, so the
 * OG image and the landing page can never say different things about the
 * same artifact.
 */

import { describe, it, expect } from '@jest/globals';
import {
  cardShare,
  clanCardModel,
  lineageCardModelFor,
  profileCardModel,
  runCardModel,
  settlementCardModel,
  signalCardModel,
} from './artifactCards';
import { challengeFromRun, challengeFromSignal, signalIndexToDayKey } from '@/shared/game/challenge';
import { canonicalUrl } from '@/shared/config/site';

function signal(query: Record<string, string> = {}) {
  const challenge = challengeFromSignal(214, query);
  return signalCardModel({
    day: 214,
    dayKey: signalIndexToDayKey(214),
    seed: challenge.seed,
    challenge,
  });
}

describe('signalCardModel', () => {
  it('is verified when the link carries no claim', () => {
    const card = signal();
    expect(card.provenance).toBe('verified');
    expect(card.title).toBe('Today’s conditions, worldwide');
    expect(card.glyphs).toBeUndefined();
    expect(card.stats).toContainEqual({ label: 'Signal', value: '#214' });
  });

  it('becomes a claim the moment a target or an arc rides along', () => {
    expect(signal({ t: '1240' }).provenance).toBe('claimed');
    expect(signal({ d: 'b' }).provenance).toBe('claimed');
  });

  it('names the sharer when they were willing to be named', () => {
    expect(signal({ t: '1240', by: 'Sans_Souci' }).title).toBe("Beat Sans_Souci's 1,240");
    expect(signal({ t: '1240' }).title).toBe('Beat 1,240');
  });

  it('renders the arc as §11.3 writes it', () => {
    const card = signal({ d: 'ippb' });
    expect(card.glyphs).toBe('⚡▶▶💰');
    expect(card.subtitle).toBe('infuse · pass · pass · BANKED ×1.25');
  });

  it('offers the way in on the card itself (Rule 14)', () => {
    expect(signal().callToAction).toBe('One tap to a live board on this seed');
  });
});

describe('runCardModel', () => {
  it('is always a claim — everything but the seed came out of the link', () => {
    const card = runCardModel({ challenge: challengeFromRun('D0badf00d')! });
    expect(card.provenance).toBe('claimed');
    expect(card.title).toBe('Take this seed');
    expect(card.kicker).toBe('Run');
  });

  it('names the dynasty when one was given', () => {
    expect(
      runCardModel({ challenge: challengeFromRun('D0badf00d')!, dynasty: 'cyber' }).kicker
    ).toBe('Run · CYBER');
  });
});

describe('settlementCardModel', () => {
  const week = {
    weekKey: '2026-07-20',
    weekIndex: 134,
    seed: 'Sdeadbeef',
    modifierNames: ['Gold Rush'],
  };

  it('quotes §11.3 verbatim for a best week', () => {
    const card = settlementCardModel({
      ...week,
      clan: {
        name: 'Hollow Fang',
        tag: 'FANG',
        depth: 48210,
        bestWeek: true,
        contributingMembers: 7,
      },
    });
    expect(card.title).toBe('HOLLOW FANG reached Depth 48,210 — best week yet');
    expect(card.provenance).toBe('verified');
    expect(card.stats).toContainEqual({ label: 'Members hunted', value: '7' });
  });

  it('reads a clan of one as a complete week (Rule 8)', () => {
    const card = settlementCardModel({
      ...week,
      clan: { name: 'Quiet', tag: 'QT', depth: 900, bestWeek: false, contributingMembers: 1 },
    });
    expect(card.title).toBe('QUIET reached Depth 900');
    expect(card.stats).toContainEqual({ label: 'Member hunted', value: '1' });
  });

  it('stands on the week alone when no clan is named', () => {
    const card = settlementCardModel({ ...week, clan: null });
    expect(card.title).toBe('The hunt is open');
    expect(card.subtitle).toBe('Gold Rush');
  });

  it('says "No modifier" rather than rendering an empty line', () => {
    expect(
      settlementCardModel({ ...week, modifierNames: [], clan: null }).subtitle
    ).toBe('No modifier');
  });

  it('carries no rank, threshold or bar anywhere in it (Rule 8)', () => {
    const card = settlementCardModel({
      ...week,
      clan: { name: 'Hollow Fang', tag: 'FANG', depth: 48210, bestWeek: true, contributingMembers: 7 },
    });
    const text = JSON.stringify(card);
    expect(text).not.toMatch(/\b(rank|placement|threshold|minimum|cut|tier \d)\b/i);
  });
});

describe('clanCardModel', () => {
  it('shows public facts only — never a roster or a member number', () => {
    const card = clanCardModel({
      name: 'Hollow Fang',
      tag: 'FANG',
      memberCount: 9,
      lifetimeDepth: 512000,
      bestWeekDepth: 48210,
    });
    expect(card.title).toBe('Hollow Fang');
    expect(card.kicker).toBe('Clan · [FANG]');
    expect(card.subtitle).toBe('9 members hunting the Serpent');
    expect(card.stats).toEqual([
      { label: 'Lifetime Depth', value: '512,000' },
      { label: 'Best week', value: '48,210' },
    ]);
  });

  it('gets the singular right for a clan of one', () => {
    expect(
      clanCardModel({ name: 'Solo', tag: 'S1', memberCount: 1, lifetimeDepth: 0, bestWeekDepth: 0 })
        .subtitle
    ).toBe('1 member hunting the Serpent');
  });
});

describe('lineageCardModelFor', () => {
  it('shows the snake and nothing rankable', () => {
    const card = lineageCardModelFor({
      snakeName: 'Vyper',
      dynasty: 'CYBER',
      generation: 4,
      genes: ['slipstream', 'bulk_up'],
    });
    expect(card.title).toBe('Vyper');
    expect(card.provenance).toBe('claimed');
    expect(JSON.stringify(card)).not.toMatch(/\b(score|depth|rank)\b/i);
  });

  it('says "Unwritten" for a snake that holds nothing yet', () => {
    expect(
      lineageCardModelFor({ snakeName: 'New', dynasty: 'PRIMAL', generation: 1, genes: [] })
        .subtitle
    ).toBe('Unwritten — no genes held');
  });
});

describe('profileCardModel', () => {
  it('omits every number the Chronicle did not supply', () => {
    expect(
      profileCardModel({ handle: 'Sans_Souci', bestScore: null, totalRuns: null, lifetimeDepth: null })
        .stats
    ).toEqual([]);
  });

  it('lists what it has, formatted', () => {
    expect(
      profileCardModel({
        handle: 'Sans_Souci',
        bestScore: 1240,
        totalRuns: 88,
        lifetimeDepth: 512000,
      }).stats
    ).toEqual([
      { label: 'Best score', value: '1,240' },
      { label: 'Lifetime Depth', value: '512,000' },
      { label: 'Runs', value: '88' },
    ]);
  });
});

describe('cardShare', () => {
  it('passes an artifact on without inventing anything', () => {
    const card = signal({ t: '1240', by: 'Sans_Souci', d: 'ippb' });
    const url = canonicalUrl('/s/214?t=1240&by=Sans_Souci&d=ippb');
    const share = cardShare(card, url);

    expect(share.url).toBe(url);
    expect(share.text.split('\n').at(-1)).toBe(url);
    expect(share.text).toContain('⚡▶▶💰');
    expect(share.title).toBe(`SupaSnake — ${card.title}`);
  });

  it('emits no blank line for a card with no arc', () => {
    const share = cardShare(signal(), canonicalUrl('/s/214'));
    expect(share.text.split('\n').some((line) => line.trim() === '')).toBe(false);
  });
});

/**
 * The Rule 7 sweep, tested from both sides: it must catch the edit that sells
 * something, and it must never catch the copy this game is actually allowed to
 * write. A guard with false positives gets disabled, which is how Rule 7 dies.
 */

import {
  COMMERCIAL_TERMS,
  commercialTerms,
  isCommercialFree,
  sweepMessage,
} from './commercialLanguage';

describe('commercialLanguage — what it must catch', () => {
  const forbidden: [string, string][] = [
    ['a price', 'The Founder pack is priced at 9.99'],
    ['a currency amount', 'Only $4.99 this week'],
    ['a euro amount', 'Yours for €12'],
    ['a purchase verb', 'Buy the season pass now'],
    ['a checkout', 'Head to checkout to finish'],
    ['a discount', 'Take 20% off your next order'],
    ['a sale', 'The winter sale ends Sunday'],
    ['an offer', 'A special offer for hunters'],
    ['a bundle', 'The Deep Hunt bundle is live'],
    ['a shop pointer', 'Visit the shop to see it'],
    ['a subscription', 'Start your subscription today'],
    ['renewal billing', 'Your renewal is due'],
    ['a tier', 'Upgrade to premium for more Depth'],
    ['a badge', 'You earned a badge for this week'],
    ['urgency', 'Last chance — the week expires soon'],
    ['soft currency', 'Top up your gems before Monday'],
  ];

  it.each(forbidden)('catches %s', (_label, text) => {
    expect(commercialTerms(text).length).toBeGreaterThan(0);
    expect(isCommercialFree(text)).toBe(false);
  });

  it('names the rule and the matched text so a failure is actionable', () => {
    const [hit] = commercialTerms('The bundle is 20% off');
    expect(hit).toMatch(/^[a-z ]+: /);
  });

  it('sweeps every named part of a message and labels which part tripped', () => {
    const hits = sweepMessage({
      subject: 'Your Serpent week',
      html: '<p>Buy it now</p>',
      text: 'Your Serpent week',
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/^html — purchase: /);
  });
});

describe('commercialLanguage — what it must NOT catch', () => {
  const allowed: string[] = [
    'SUPASNAKE · World Serpent · week of 2026-07-20',
    'HOLLOW FANG reached Depth 48,210 — best week yet',
    '3 members hunted',
    'You fed 1,240 segments.',
    'Your deepest week still stands at 980 segments.',
    'The week passed and its runs went with it. Nothing of yours went with them.',
    'The Serpent surfaces again every Monday, and the next week is a fresh one.',
    'Deeper than any week before it, by +240 segments.',
    'You hunted this week without a clan, so this week’s Depth is yours alone.',
    'Conditions: Deep Current · Lean Harvest',
    'Insoucience Technologies GmbH · Modecenterstraße 20/1/410, 1030 Vienna, Austria',
    'support@supasnake.com',
    'https://supasnake.com/w/2026-07-20',
    'You can leave the list at any time: unsubscribe.',
    'Unsubscribe: https://supasnake.com/dispatch/unsubscribe?token=abc',
    'payload',
    'Three best runs make your Depth',
    'Every member’s Depth adds — no thresholds, no bars',
  ];

  it.each(allowed)('leaves honest settlement copy alone: %s', (text) => {
    expect(commercialTerms(text)).toEqual([]);
  });

  it('never mistakes the required unsubscribe word for a subscription', () => {
    expect(commercialTerms('unsubscribe')).toEqual([]);
    expect(commercialTerms('Unsubscribe')).toEqual([]);
    // The forbidden word itself still trips, so the exemption is narrow.
    expect(commercialTerms('subscribe')).not.toEqual([]);
  });

  it('is anchored on word boundaries, so ordinary words survive', () => {
    expect(commercialTerms('the payload carried a deeper packet of stockpiled data'))
      .toEqual([]);
  });
});

describe('commercialLanguage — the rule table itself', () => {
  it('covers price, offer, product, badge and upsell', () => {
    const labels = COMMERCIAL_TERMS.map((term) => term.label).join(' ');
    expect(labels).toContain('price');
    expect(labels).toContain('offer');
    expect(labels).toContain('product');
    expect(labels).toContain('badge');
    expect(labels).toContain('upsell');
  });

  it('every pattern is case-insensitive, so SHOUTING does not evade it', () => {
    for (const term of COMMERCIAL_TERMS) {
      expect(term.pattern.flags).toContain('i');
    }
  });

  it('no pattern is global, so exec() is not stateful across calls', () => {
    for (const term of COMMERCIAL_TERMS) {
      expect(term.pattern.flags).not.toContain('g');
    }
    // Proven by repetition: a `g` flag would make the second call miss.
    expect(commercialTerms('buy this')).toEqual(commercialTerms('buy this'));
  });
});

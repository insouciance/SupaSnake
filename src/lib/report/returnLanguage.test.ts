/**
 * Rule 5 as a lint (Constitution §4, §7.5).
 *
 * The point of these tests is the FUTURE edit. Every case below is a sentence
 * somebody could plausibly write into a return screen two years from now
 * because a retention chart dipped, and every one of them must fail.
 */

import {
  isDebtFree,
  redact,
  returnDebtTerms,
  RETURN_TERMS,
  sweepReturn,
} from '@/lib/report/returnLanguage';

describe('the four families §7.5 forbids', () => {
  const forbidden: Array<[string, string]> = [
    ['loss', 'You lost your place in the hunt.'],
    ['loss', 'Three cosmetics were forfeited.'],
    ['expiry', 'Your rewards expired while you were gone.'],
    ['expiry', 'Your streak has decayed.'],
    ['expiry', 'Last chance to save it.'],
    ['backlog', 'You are 6 weeks behind the pack.'],
    ['backlog', 'Catch up on what you can.'],
    ['backlog', 'Your backlog is 9 weeks deep.'],
    ['debt', 'You owe the Serpent two weeks.'],
    ['debt', 'A penalty applies to your next run.'],
    ['debt', 'You missed nine days.'],
    ['debt', 'You should have hunted on Thursday.'],
  ];

  it.each(forbidden)('%s: refuses "%s"', (label, sentence) => {
    const hits = returnDebtTerms(sentence);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.join(' ')).toContain(label);
    expect(isDebtFree(sentence)).toBe(false);
  });

  it('names which rule tripped and on which word, not "regex 3 matched"', () => {
    expect(returnDebtTerms('You are behind.')).toEqual(['backlog: behind']);
  });
});

describe('the two Caps enforced on the same pass (§12.2)', () => {
  it('refuses a claim — the World Report is not a new claim', () => {
    expect(returnDebtTerms('Collect your return package.')).toEqual(
      expect.arrayContaining([expect.stringContaining('claim')])
    );
    expect(isDebtFree('Claim what accrued.')).toBe(false);
  });

  it('refuses a currency — the World Report is not a new currency', () => {
    expect(isDebtFree('You have 400 DNA waiting.')).toBe(false);
    expect(isDebtFree('Your energy is full again.')).toBe(false);
    expect(isDebtFree('Balance: 12 charges.')).toBe(false);
  });
});

describe('what it must never refuse', () => {
  const allowed = [
    'HOLLOW FANG reached Depth 51,000 segments without you — they left the door open.',
    'Nothing of yours moved while you were away. Records, snakes, lineage and history are exactly where you left them.',
    '3 Serpent weeks surfaced and submerged.',
    'Your deepest week still stands at 12,400 segments.',
    'You have no Serpent week on record yet. The next one you hunt is your first.',
    "Today's Signal: Dense Fog — Visibility radius 6 cells around your head.",
    '12 earlier weeks settled before those.',
    'The Serpent surfaced and submerged unhunted.',
  ];

  it.each(allowed)('passes "%s"', (sentence) => {
    expect(returnDebtTerms(sentence)).toEqual([]);
  });
});

describe('redaction — a lint over our English, not over player names', () => {
  it('does not refuse a report because a player named their clan LOST BOYS', () => {
    const line = 'LOST BOYS reached Depth 900 segments without you.';
    expect(isDebtFree(line)).toBe(false);
    expect(returnDebtTerms(redact(line, ['LOST BOYS']))).toEqual([]);
  });

  it('redacts the longest name first, so no fragment survives', () => {
    const line = 'FANG and HOLLOW FANG both hunted.';
    expect(redact(line, ['FANG', 'HOLLOW FANG'])).toBe('«quoted» and «quoted» both hunted.');
  });

  it('ignores an empty name rather than rewriting the whole text', () => {
    expect(redact('A quiet week.', ['', '   '])).toBe('A quiet week.');
  });

  it('still catches our own copy around a redacted name', () => {
    const line = 'LOST BOYS are 3 weeks behind you.';
    expect(returnDebtTerms(redact(line, ['LOST BOYS']))).toEqual(['backlog: behind']);
  });
});

describe('sweeping a whole report', () => {
  it('catches a headline that shames even when the body does not', () => {
    expect(
      sweepReturn({ headline: 'You fell behind.', body: 'Two weeks submerged.' })
    ).toEqual(['headline — backlog: fell behind']);
  });

  it('is silent on a clean report', () => {
    expect(
      sweepReturn({ headline: '12 days away.', body: 'Two Serpent weeks submerged.' })
    ).toEqual([]);
  });

  it('every rule carries a label, so no failure message is anonymous', () => {
    for (const term of RETURN_TERMS) expect(term.label.length).toBeGreaterThan(0);
  });
});

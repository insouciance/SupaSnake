/**
 * The challenge codec and the Signal calendar (WP-1.08, Constitution §11.3).
 */

import { describe, it, expect } from '@jest/globals';
import {
  MAX_DECISIONS,
  MAX_TARGET,
  SIGNAL_EPOCH_UTC,
  challengeFromRun,
  challengeFromSignal,
  challengeHeadline,
  challengeQueryParams,
  challengeRng,
  decisionGlyphs,
  decisionWords,
  encodeDecisions,
  isValidSeed,
  parseDecisions,
  parseHandle,
  parseSignalDay,
  parseTarget,
  signalDayIndex,
  signalDayKey,
  signalDaySeed,
  signalIndexToDayKey,
  signalSeedForIndex,
  type PortalDecision,
} from './challenge';
import { SERPENT_EPOCH_UTC, serpentWeekKey } from './serpent';

describe('the Signal calendar', () => {
  it('shares its epoch with the Serpent so the two calendars cannot drift', () => {
    expect(SIGNAL_EPOCH_UTC).toBe(SERPENT_EPOCH_UTC);
  });

  it('numbers the epoch day 1, not 0', () => {
    expect(signalDayIndex(SIGNAL_EPOCH_UTC)).toBe(1);
    expect(signalDayKey(SIGNAL_EPOCH_UTC)).toBe('2024-01-01');
  });

  it('advances exactly one per UTC day, and only at UTC midnight', () => {
    const day = signalDayIndex(Date.UTC(2026, 6, 26, 0, 0, 0));
    expect(signalDayIndex(Date.UTC(2026, 6, 26, 23, 59, 59))).toBe(day);
    expect(signalDayIndex(Date.UTC(2026, 6, 27, 0, 0, 0))).toBe(day + 1);
  });

  it('round-trips index -> day key -> index across two years', () => {
    for (let index = 1; index <= 730; index += 1) {
      const key = signalIndexToDayKey(index);
      expect(signalDayIndex(new Date(`${key}T12:00:00.000Z`))).toBe(index);
    }
  });

  it('puts Signal day 7n+1 on the Monday that opens a Serpent week', () => {
    for (let week = 0; week < 60; week += 1) {
      const key = signalIndexToDayKey(week * 7 + 1);
      expect(serpentWeekKey(new Date(`${key}T00:00:00.000Z`))).toBe(key);
    }
  });

  it('derives a stable, distinct seed per day', () => {
    expect(signalDaySeed('2026-07-26')).toBe(signalDaySeed('2026-07-26'));
    expect(signalDaySeed('2026-07-26')).not.toBe(signalDaySeed('2026-07-27'));
    expect(signalDaySeed('2026-07-26')).toMatch(/^D[0-9a-f]{8}$/);
  });

  it('gives every player in the world the same seed for a Signal number', () => {
    expect(signalSeedForIndex(214)).toBe(signalDaySeed(signalIndexToDayKey(214)));
  });
});

describe('challengeRng', () => {
  it('is a pure function of the seed', () => {
    const a = challengeRng('D0badf00d');
    const b = challengeRng('D0badf00d');
    const first = Array.from({ length: 20 }, () => a());
    const second = Array.from({ length: 20 }, () => b());
    expect(second).toEqual(first);
  });

  it('produces a different stream for a different seed', () => {
    const a = Array.from({ length: 20 }, challengeRng('seed-a'));
    const b = Array.from({ length: 20 }, challengeRng('seed-b'));
    expect(b).not.toEqual(a);
  });

  it('stays inside [0, 1)', () => {
    const rng = challengeRng('bounds');
    for (let i = 0; i < 5000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('the portal-decision string', () => {
  const arc: PortalDecision[] = ['infuse', 'pass', 'pass', 'bank'];

  it('renders the Constitution §11.3 example exactly', () => {
    expect(decisionGlyphs(arc)).toBe('⚡▶▶💰');
    expect(decisionWords(arc)).toBe('infuse · pass · pass · BANKED ×1.25');
  });

  it('round-trips through the compact URL token', () => {
    expect(encodeDecisions(arc)).toBe('ippb');
    expect(parseDecisions('ippb')).toEqual(arc);
  });

  it('only appends the bank multiplier to a terminal bank', () => {
    expect(decisionWords(['bank', 'pass'])).toBe('BANKED · pass');
  });

  it('says so when no portal was met', () => {
    expect(decisionGlyphs([])).toBe('');
    expect(decisionWords([])).toBe('no portal met');
  });

  it('drops unknown letters instead of guessing', () => {
    expect(parseDecisions('i?p!b')).toEqual(['infuse', 'pass', 'bank']);
    expect(parseDecisions(null)).toEqual([]);
    expect(parseDecisions(42)).toEqual([]);
  });

  it('bounds the string so a URL cannot be inflated', () => {
    const long = Array.from({ length: 60 }, () => 'pass' as PortalDecision);
    expect(encodeDecisions(long)).toHaveLength(MAX_DECISIONS);
    expect(parseDecisions('p'.repeat(500))).toHaveLength(MAX_DECISIONS);
  });

  it('keeps the ending when it truncates, because the ending is the story', () => {
    const long: PortalDecision[] = [
      ...Array.from({ length: 20 }, () => 'pass' as PortalDecision),
      'bank',
    ];
    expect(encodeDecisions(long).endsWith('b')).toBe(true);
  });
});

describe('parsing an untrusted challenge query', () => {
  it('accepts a positive integer target and clamps the absurd', () => {
    expect(parseTarget('1240')).toBe(1240);
    expect(parseTarget(1240.9)).toBe(1240);
    expect(parseTarget(String(MAX_TARGET * 10))).toBe(MAX_TARGET);
  });

  it('rejects nonsense rather than rendering a card of guesses', () => {
    for (const bad of ['', '  ', 'NaN', '-5', '0', 'abc', null, undefined, {}]) {
      expect(parseTarget(bad)).toBeNull();
    }
  });

  it('accepts only the shipped handle shape', () => {
    expect(parseHandle('Sans_Souci')).toBe('Sans_Souci');
    expect(parseHandle('ab')).toBeNull();
    expect(parseHandle('handler-0001')).toBeNull();
    expect(parseHandle('<script>')).toBeNull();
  });

  it('accepts only a plausible Signal day number', () => {
    expect(parseSignalDay('214')).toBe(214);
    expect(parseSignalDay('0')).toBeNull();
    expect(parseSignalDay('-3')).toBeNull();
    expect(parseSignalDay('12345678')).toBeNull();
    expect(parseSignalDay('1e3')).toBeNull();
  });

  it('validates seeds as opaque URL-safe tokens', () => {
    expect(isValidSeed('D1c0ffee1')).toBe(true);
    expect(isValidSeed('a/b')).toBe(false);
    expect(isValidSeed('')).toBe(false);
    expect(isValidSeed('x'.repeat(65))).toBe(false);
  });
});

describe('building a challenge', () => {
  it('derives a Signal challenge seed from the day, never from the query', () => {
    const challenge = challengeFromSignal(214, {
      t: '1240',
      by: 'Sans_Souci',
      d: 'ippb',
      // A hand-forged seed in the query must be ignored: same conditions
      // worldwide (§7.2) is what makes the comparison mean anything.
      seed: 'attacker-seed',
    });
    expect(challenge.seed).toBe(signalSeedForIndex(214));
    expect(challenge.target).toBe(1240);
    expect(challenge.by).toBe('Sans_Souci');
    expect(challenge.decisions).toEqual(['infuse', 'pass', 'pass', 'bank']);
  });

  it('takes a run challenge seed from the path and validates it', () => {
    expect(challengeFromRun('D0badf00d', { t: '900' })?.seed).toBe('D0badf00d');
    expect(challengeFromRun('../../etc/passwd')).toBeNull();
  });

  it('emits only the parameters that are present', () => {
    expect(
      challengeQueryParams({ target: null, by: null, decisions: [] })
    ).toEqual([]);
    expect(
      challengeQueryParams({ target: 1240, by: 'Sans_Souci', decisions: ['bank'] })
    ).toEqual([
      ['t', '1240'],
      ['by', 'Sans_Souci'],
      ['d', 'b'],
    ]);
  });

  it('writes a headline that reads as a dare, not a record', () => {
    expect(
      challengeHeadline(challengeFromSignal(214, { t: '1240', by: 'Sans_Souci' }))
    ).toBe("Beat Sans_Souci's 1,240 on Signal #214");
    expect(challengeHeadline(challengeFromSignal(214, { t: '1240' }))).toBe(
      'Beat 1,240 on Signal #214'
    );
    expect(challengeHeadline(challengeFromSignal(214))).toBe('Play Signal #214');
  });
});

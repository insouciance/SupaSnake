/**
 * Retired aim unlocks as Chronicle trivia (WP-0.07).
 *
 * R6: removing the gate must not delete the record that the player passed it.
 * The boundary matrix that used to live in aimSystems.test.ts survives here,
 * now proving what a player *remembers* rather than what they may use.
 */

import { buildAimTrivia, RETIRED_AIM_UNLOCKS, type AimTriviaStats } from './aimTrivia';

const zero: AimTriviaStats = { highScore: 0, totalGames: 0, breeds: 0 };
const stats = (overrides: Partial<AimTriviaStats>): AimTriviaStats => ({
  ...zero,
  ...overrides,
});

const ids = (s: AimTriviaStats) => buildAimTrivia(s).map((entry) => entry.id);

describe('retired unlock predicates are preserved verbatim', () => {
  it('covers the three systems that were gated, and not deadeye', () => {
    expect(RETIRED_AIM_UNLOCKS.map((u) => u.aimSystem)).toEqual([
      'gridlock',
      'pathline',
      'firefly',
    ]);
  });

  it('gridlock: high score 15 (14 is not enough)', () => {
    expect(ids(stats({ highScore: 14 }))).not.toContain('aim-unlock-gridlock');
    expect(ids(stats({ highScore: 15 }))).toContain('aim-unlock-gridlock');
  });

  it('pathline: high score 30 OR 25 games', () => {
    expect(ids(stats({ highScore: 29, totalGames: 24 }))).not.toContain(
      'aim-unlock-pathline'
    );
    expect(ids(stats({ highScore: 30 }))).toContain('aim-unlock-pathline');
    expect(ids(stats({ totalGames: 25 }))).toContain('aim-unlock-pathline');
  });

  it('firefly: one breed OR high score 50', () => {
    expect(ids(stats({ breeds: 0, highScore: 49 }))).not.toContain(
      'aim-unlock-firefly'
    );
    expect(ids(stats({ breeds: 1 }))).toContain('aim-unlock-firefly');
    expect(ids(stats({ highScore: 50 }))).toContain('aim-unlock-firefly');
  });
});

describe('buildAimTrivia', () => {
  it('gives a zero-progression player no footnotes and no empty checklist', () => {
    expect(buildAimTrivia(zero)).toEqual([]);
  });

  it('gives a veteran all three, in the order they were earned', () => {
    expect(ids(stats({ highScore: 50, totalGames: 60, breeds: 2 }))).toEqual([
      'aim-unlock-gridlock',
      'aim-unlock-pathline',
      'aim-unlock-firefly',
    ]);
  });

  it('names the system and the requirement the player actually cleared', () => {
    const [entry] = buildAimTrivia(stats({ highScore: 15 }));
    expect(entry.label).toContain('Gridlock');
    expect(entry.detail).toContain('a high score of 15');
    expect(entry.detail).toMatch(/setting for everyone now/i);
  });

  it('grants nothing: entries are label + detail only', () => {
    for (const entry of buildAimTrivia(stats({ highScore: 50, breeds: 1 }))) {
      expect(Object.keys(entry).sort()).toEqual(['detail', 'id', 'label']);
    }
  });
});

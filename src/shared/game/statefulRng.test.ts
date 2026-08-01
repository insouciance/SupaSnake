import { fnv1a, mulberry32 } from '@/shared/game/offerGravity';
import { StatefulRng } from './statefulRng';

describe('StatefulRng', () => {
  it('matches the existing Mulberry32 sequence exactly', () => {
    const seed = 'recoverable-run';
    const expected = mulberry32(fnv1a(seed));
    const actual = StatefulRng.fromSeed(seed);
    for (let index = 0; index < 100; index += 1) {
      expect(actual.next()).toBe(expected());
    }
  });

  it('continues exactly from an exported cursor', () => {
    const first = StatefulRng.fromSeed('session-1');
    for (let index = 0; index < 37; index += 1) first.next();
    const resumed = StatefulRng.restore(first.snapshot());
    for (let index = 0; index < 100; index += 1) {
      expect(resumed.next()).toBe(first.next());
    }
  });

  it('rejects malformed cursor state', () => {
    expect(() => StatefulRng.restore({
      version: 1,
      algorithm: 'mulberry32',
      seed: 1,
      state: 1,
      draws: -1,
    })).toThrow('Invalid simulation RNG snapshot');

    const valid = StatefulRng.fromSeed('state-binding');
    for (let index = 0; index < 12; index += 1) valid.next();
    const snapshot = valid.snapshot();
    expect(() => StatefulRng.restore({
      ...snapshot,
      state: (snapshot.state + 1) >>> 0,
    })).toThrow('Invalid simulation RNG snapshot');
  });
});

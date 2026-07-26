/**
 * Reading a challenge off `/game?seed=…` (WP-1.08).
 *
 * The load-bearing assertion is the last block: a challenge link resolves to
 * a runnable seed, and the run it produces is byte-for-byte the run the
 * sharer played. That is the WP's acceptance criterion, executed against the
 * real engine rather than asserted in prose.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SnakeGameLogic, type Direction } from '@/lib/game/SnakeGameLogic';
import { RULESETS } from '@/shared/game/rulesets';
import { challengePlayPath } from '@/lib/share/artifactUrls';
import { challengeFromSignal, signalSeedForIndex } from '@/shared/game/challenge';

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_SHARE_ARTIFACTS_V1;

/**
 * The module reads the flag at import time, so each case re-imports it with
 * the environment it means to test.
 */
function load(flag: 'on' | 'off') {
  jest.resetModules();
  if (flag === 'on') process.env.NEXT_PUBLIC_SHARE_ARTIFACTS_V1 = 'true';
  else delete process.env.NEXT_PUBLIC_SHARE_ARTIFACTS_V1;
  return require('./challengeRun') as typeof import('./challengeRun');
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SHARE_ARTIFACTS_V1 = 'true';
});

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.NEXT_PUBLIC_SHARE_ARTIFACTS_V1;
  else process.env.NEXT_PUBLIC_SHARE_ARTIFACTS_V1 = ORIGINAL_FLAG;
});

describe('readChallengeRun', () => {
  it('reads a Signal challenge whole', () => {
    const { readChallengeRun } = load('on');
    expect(
      readChallengeRun('?seed=D1c0ffee&target=1240&challenge=signal:214&by=Sans_Souci')
    ).toEqual({
      seed: 'D1c0ffee',
      target: 1240,
      signalDay: 214,
      by: 'Sans_Souci',
    });
  });

  it('reads a run challenge, which names no Signal day', () => {
    const { readChallengeRun } = load('on');
    expect(readChallengeRun('?seed=D0badf00d&challenge=run:D0badf00d')).toEqual({
      seed: 'D0badf00d',
      target: null,
      signalDay: null,
      by: null,
    });
  });

  it('returns null with the flag off, so the rollback path is an ordinary run', () => {
    const { readChallengeRun } = load('off');
    expect(readChallengeRun('?seed=D1c0ffee&target=1240&challenge=signal:214')).toBeNull();
  });

  it('returns null rather than a half-configured run', () => {
    const { readChallengeRun } = load('on');
    for (const search of [
      '',
      '?',
      '?target=1240',
      '?seed=',
      '?seed=a/b',
      '?seed=' + 'x'.repeat(80),
    ]) {
      expect(readChallengeRun(search)).toBeNull();
    }
  });

  it('drops an unusable target and handle but keeps the seed', () => {
    const { readChallengeRun } = load('on');
    const challenge = readChallengeRun('?seed=D1c0ffee&target=-4&by=<script>')!;
    expect(challenge.seed).toBe('D1c0ffee');
    expect(challenge.target).toBeNull();
    expect(challenge.by).toBeNull();
  });

  it('ignores a malformed provenance label instead of guessing a day', () => {
    const { readChallengeRun } = load('on');
    expect(readChallengeRun('?seed=D1c0ffee&challenge=signal:zero')?.signalDay).toBeNull();
    expect(readChallengeRun('?seed=D1c0ffee&challenge=nonsense')?.signalDay).toBeNull();
  });
});

describe('challengeRunNote', () => {
  it('reads as a dare and never as an obligation', () => {
    const { readChallengeRun, challengeRunNote } = load('on');
    expect(
      challengeRunNote(
        readChallengeRun('?seed=D1&target=1240&challenge=signal:214&by=Sans_Souci')!
      )
    ).toBe("Challenge · beat Sans_Souci's 1,240 on Signal #214");
    expect(
      challengeRunNote(readChallengeRun('?seed=D1&target=1240&challenge=signal:214')!)
    ).toBe('Challenge · beat 1,240 on Signal #214');
    expect(challengeRunNote(readChallengeRun('?seed=D1')!)).toBe(
      'Challenge · this seed · seed D1'
    );
  });
});

describe('a challenge link resolves to a runnable seed', () => {
  const SCRIPT: readonly Direction[] = [
    'RIGHT', 'UP', 'RIGHT', 'DOWN', 'RIGHT', 'UP', 'LEFT', 'UP',
  ];

  function play(rng: () => number): string {
    const game = new SnakeGameLogic({ gridSize: 40, ruleset: RULESETS.COSMIC, rng });
    game.start();
    const frames: string[] = [];
    for (let i = 1; i <= 150; i += 1) {
      const state = game.getState();
      if (state.isGameOver) break;
      if (state.pendingChoice !== null) game.declineMutation();
      else if (state.pendingPortalChoice !== null) game.resolvePortalChoice('pass');
      game.setDirection(SCRIPT[i % SCRIPT.length]);
      game.tick();
      const next = game.getState();
      frames.push(
        `${next.snake[0].x},${next.snake[0].z}:${next.score}:${next.foods
          .map((f) => `${f.x},${f.z}`)
          .join('|')}`
      );
    }
    return frames.join(';');
  }

  it('lands the visitor on the sharer’s exact board', () => {
    const { readChallengeRun, challengeRunRng } = load('on');

    // The sharer's side: a Signal challenge, turned into a /game URL.
    const shared = challengeFromSignal(214, { t: '1240', by: 'Sans_Souci' });
    const href = challengePlayPath(shared);
    expect(href.startsWith('/game?')).toBe(true);

    // The visitor's side: the URL, read back off the address bar.
    const received = readChallengeRun(href.slice(href.indexOf('?')))!;
    expect(received.seed).toBe(signalSeedForIndex(214));
    expect(received.target).toBe(1240);

    // And the two runs are the same run.
    expect(play(challengeRunRng(received))).toBe(play(challengeRunRng(received)));
    expect(play(challengeRunRng(received))).toBe(
      play(challengeRunRng({ ...received, seed: shared.seed }))
    );
  });

  it('a different Signal day is a different board', () => {
    const { readChallengeRun, challengeRunRng } = load('on');
    const a = readChallengeRun(
      challengePlayPath(challengeFromSignal(214)).slice(
        challengePlayPath(challengeFromSignal(214)).indexOf('?')
      )
    )!;
    const b = readChallengeRun(
      challengePlayPath(challengeFromSignal(215)).slice(
        challengePlayPath(challengeFromSignal(215)).indexOf('?')
      )
    )!;
    expect(play(challengeRunRng(b))).not.toBe(play(challengeRunRng(a)));
  });
});

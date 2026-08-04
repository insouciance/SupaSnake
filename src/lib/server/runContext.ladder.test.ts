/**
 * The ladder-rung stamp round-trip (WP-3.12).
 *
 * THE MECHANISM THE WHOLE LADDER RESTS ON, and it is the growth profile's,
 * verbatim. The rung is not gated by a `NEXT_PUBLIC_*` flag — those are inlined
 * at build time, so a client built at one rung's parameters and a server
 * recomputing at another disagree about how much an infuse grew, where the
 * doors stood and what a crash salvages. A disagreement of that kind silently
 * invalidates runs a player honestly earned.
 *
 * Instead the server stamps the rung into `run_context` at start and settlement
 * replays from that stamp. If serialization drops it, or parsing rejects a blob
 * carrying an unfamiliar one, the run settles under the wrong rules — so this
 * file asserts the stamp survives the database round trip, that its absence is
 * a normal silent rung 0, and that a rung from a FUTURE build degrades to rung 0
 * rather than condemning the whole context.
 */

import { describe, it, expect } from '@jest/globals';
import {
  parseRunStartContext,
  serializeRunStartContext,
  RUN_CONTEXT_LEGACY_VERSION,
  type RunStartContext,
} from './runContext';
import { LADDER_MAX_RUNG, resolveLadderRung } from '@/shared/game/ladder';

function baseContext(): RunStartContext {
  return {
    v: RUN_CONTEXT_LEGACY_VERSION,
    snake: { id: 'snake-1', generation: 2, traits: [] },
    mutationPool: ['gold_trail'],
    freePlay: false,
    genome: null,
  };
}

/** What the database actually stores and hands back: JSON, not an object. */
function roundTrip(context: RunStartContext) {
  return parseRunStartContext(
    JSON.parse(JSON.stringify(serializeRunStartContext(context)))
  );
}

describe('run_context: the ladder rung stamp', () => {
  it('survives serialization and parsing', () => {
    const parsed = roundTrip({ ...baseContext(), ladderRung: 3 });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.context.ladderRung).toBe(3);
  });

  it('round-trips every rung the ladder offers', () => {
    for (let rung = 1; rung <= LADDER_MAX_RUNG; rung++) {
      const parsed = roundTrip({ ...baseContext(), ladderRung: rung });
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.context.ladderRung).toBe(rung);
    }
  });

  it('is ABSENT from the stored blob at rung 0, not stored as a zero', () => {
    // A Ground run must store exactly the blob it stored before the ladder
    // existed. An absent key and a stored 0 mean the same thing everywhere they
    // are read, and only one of them is a byte on every session row.
    const ground = serializeRunStartContext({ ...baseContext(), ladderRung: 0 });
    const never = serializeRunStartContext(baseContext());
    expect(ground).not.toHaveProperty('ladderRung');
    expect(JSON.stringify(ground)).toBe(JSON.stringify(never));
  });

  it('reads an absent stamp as rung 0 — the shipped game', () => {
    const parsed = roundTrip(baseContext());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.context.ladderRung).toBeUndefined();
    expect(resolveLadderRung(parsed.context.ladderRung)).toBe(0);
  });

  it('degrades a rung from a NEWER build to rung 0 without condemning the blob', () => {
    // The ladder is expected to grow, so a staged deploy WILL produce this: a
    // run stamped at rung 9 read back by a build that offers 7. Condemning the
    // context would send an otherwise perfect settlement down the re-derive
    // path, which is a worse outcome than settling a ladder run on Ground.
    const parsed = parseRunStartContext({
      ...serializeRunStartContext(baseContext()),
      ladderRung: LADDER_MAX_RUNG + 2,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.context.ladderRung).toBeUndefined();
    expect(resolveLadderRung(parsed.context.ladderRung)).toBe(0);
  });

  it.each([-1, 1.5, 'three', null, {}, []])(
    'treats a malformed rung (%p) as rung 0, never as a malformed context',
    (bad) => {
      const parsed = parseRunStartContext({
        ...serializeRunStartContext(baseContext()),
        ladderRung: bad,
      });
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(resolveLadderRung(parsed.context.ladderRung)).toBe(0);
    }
  );

  it('does not disturb the growth-profile stamp beside it', () => {
    const parsed = roundTrip({
      ...baseContext(),
      growthProfileId: 'tuned',
      ladderRung: 2,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.context.growthProfileId).toBe('tuned');
    expect(parsed.context.ladderRung).toBe(2);
  });
});

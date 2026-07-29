/**
 * The growth-profile stamp round-trip (WP-3.02, retained after D1).
 *
 * The retired Lab established the mechanism current dynasty growth still
 * relies on. The profile is not gated by a `NEXT_PUBLIC_*` flag — those are
 * inlined at build time, so a client built
 * with one growth curve and a server recomputing with another disagree on
 * every length, and a length disagreement silently invalidates runs a player
 * honestly earned (the defect WP-2.05 existed to eliminate).
 *
 * Instead the server stamps the profile into `run_context` at start and
 * settlement replays from that stamp. If serialization drops it, or parsing
 * rejects a blob that lacks it, the run settles on the wrong curve — so this
 * file asserts the stamp survives the database round trip, and that its
 * absence is a normal, silent, correct `baseline`.
 */

import { describe, it, expect } from '@jest/globals';
import {
  parseRunStartContext,
  serializeRunStartContext,
  RUN_CONTEXT_VERSION,
  type RunStartContext,
} from './runContext';
import { resolveGrowthProfile } from '@/shared/game/growth';

function baseContext(): RunStartContext {
  return {
    v: RUN_CONTEXT_VERSION,
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

describe('run_context: the growth profile stamp', () => {
  it('survives serialization and parsing', () => {
    const parsed = roundTrip({ ...baseContext(), growthProfileId: 'tuned' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.context.growthProfileId).toBe('tuned');
  });

  it('every profile round-trips, not just the one we happened to try', () => {
    for (const id of ['baseline', 'dynasty', 'tuned', 'aggressive'] as const) {
      const parsed = roundTrip({ ...baseContext(), growthProfileId: id });
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.context.growthProfileId).toBe(id);
    }
  });

  it('an unstamped context parses cleanly and means baseline', () => {
    // Every run started before profiles shipped lacks the stamp. This must be
    // silent and correct, never "malformed".
    const parsed = roundTrip(baseContext());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.context.growthProfileId).toBeUndefined();
    expect(resolveGrowthProfile(parsed.context.growthProfileId).id).toBe('baseline');
  });

  it('an unstamped context stores no key at all', () => {
    // Historical blobs remain byte-identical; new sessions stamp `dynasty`.
    expect(serializeRunStartContext(baseContext())).not.toHaveProperty(
      'growthProfileId'
    );
  });

  it('an unrecognised profile degrades to baseline instead of failing the parse', () => {
    // A stamp written by a NEWER build must never make an older one treat the
    // whole context as malformed: that would send settlement down the
    // re-derive path and lose the tierCap and heirloom the run played under,
    // which is a far worse outcome than folding on the shipped curve.
    const raw = {
      ...serializeRunStartContext(baseContext()),
      growthProfileId: 'from-the-future',
    };
    const parsed = parseRunStartContext(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.context.growthProfileId).toBeUndefined();
    expect(resolveGrowthProfile(parsed.context.growthProfileId).id).toBe('baseline');
  });

  it('a malformed profile value does not throw', () => {
    for (const bad of [42, null, {}, [], true]) {
      const raw = {
        ...serializeRunStartContext(baseContext()),
        growthProfileId: bad,
      };
      expect(() => parseRunStartContext(raw)).not.toThrow();
      const parsed = parseRunStartContext(raw);
      expect(parsed.ok).toBe(true);
    }
  });
});

/**
 * Run-event envelope validation tests (Player Identity v1 section 9.5).
 * Structural violations store NULL; a food-count mismatch stores the
 * envelope flagged suspect. Nothing here ever touches payout math.
 */

import { validateRunEvents, type RunEventValidationContext } from './runEventValidator';
import { RUN_EVENTS_MAX } from '@/shared/game/runEvents';

const context = (overrides: Partial<RunEventValidationContext> = {}): RunEventValidationContext => ({
  durationSeconds: 60,
  foodCount: 3,
  died: true,
  extracted: false,
  mutationIds: ['phoenix'],
  ...overrides,
});

const goodEvents = [
  { t: 10, e: 'f', n: 1 },
  { t: 25, e: 'p', k: 'spawn' },
  { t: 30, e: 'f', n: 2 },
  { t: 42, e: 'm', id: 'phoenix' },
  { t: 55, e: 'f', n: 3 },
  { t: 70, e: 'w', d: 8 },
  { t: 80, e: 'x', c: 'self' },
];

describe('validateRunEvents', () => {
  it('accepts a well-formed stream and stores the v1 envelope', () => {
    const envelope = validateRunEvents({ events: goodEvents, truncated: false }, context());
    expect(envelope).toEqual({
      v: 1,
      events: goodEvents,
      truncated: false,
      suspect: false,
    });
  });

  it('rejects null/undefined/garbage payloads', () => {
    expect(validateRunEvents(undefined, context())).toBeNull();
    expect(validateRunEvents(null, context())).toBeNull();
    expect(validateRunEvents('nonsense', context())).toBeNull();
    expect(validateRunEvents({ events: 'nope' }, context())).toBeNull();
    expect(validateRunEvents({ events: [{ t: -1, e: 'f' }] }, context())).toBeNull();
    expect(validateRunEvents({ events: [{ t: 1, e: 'zzz' }] }, context())).toBeNull();
  });

  it('rejects unknown extra fields (strict schema)', () => {
    expect(
      validateRunEvents({ events: [{ t: 1, e: 'b', hax: true }] }, context())
    ).toBeNull();
  });

  it('rejects more than 600 events', () => {
    const events = Array.from({ length: RUN_EVENTS_MAX + 1 }, (_, i) => ({
      t: i,
      e: 'f',
      n: i + 1,
    }));
    expect(validateRunEvents({ events }, context({ foodCount: events.length }))).toBeNull();
  });

  it('rejects oversize payloads (>32KB)', () => {
    const events = Array.from({ length: 550 }, (_, i) => ({
      t: i,
      e: 'm',
      id: 'x'.repeat(60),
    }));
    expect(validateRunEvents({ events }, context())).toBeNull();
  });

  it('rejects non-monotonic times', () => {
    const events = [
      { t: 30, e: 'f', n: 1 },
      { t: 10, e: 'f', n: 2 },
    ];
    expect(validateRunEvents({ events }, context())).toBeNull();
  });

  it('rejects times beyond duration + 5s', () => {
    // 60s run: cap = 650 deciseconds
    const events = [{ t: 651, e: 'b' }];
    expect(validateRunEvents({ events }, context({ durationSeconds: 60 }))).toBeNull();
  });

  it('rejects a second terminal event', () => {
    const events = [
      { t: 10, e: 'x', c: 'wall' },
      { t: 20, e: 'x', c: 'self' },
    ];
    expect(validateRunEvents({ events }, context())).toBeNull();
  });

  it('rejects a terminal event that contradicts the validated ending', () => {
    // Claimed extraction on a death
    expect(
      validateRunEvents(
        { events: [{ t: 10, e: 'x', c: 'extracted' }] },
        context({ died: true, extracted: false })
      )
    ).toBeNull();
    // Claimed death on a banked run
    expect(
      validateRunEvents(
        { events: [{ t: 10, e: 'x', c: 'wall' }] },
        context({ died: false, extracted: true, foodCount: 0 })
      )
    ).toBeNull();
  });

  it('rejects mutation events outside the validated pick list', () => {
    const events = [{ t: 10, e: 'm', id: 'gold_trail' }];
    expect(
      validateRunEvents({ events }, context({ mutationIds: ['phoenix'] }))
    ).toBeNull();
  });

  it('flags (not rejects) a food-event count off by more than 2', () => {
    const events = [
      { t: 1, e: 'f', n: 1 },
      { t: 2, e: 'f', n: 2 },
      { t: 3, e: 'f', n: 3 },
      { t: 4, e: 'f', n: 4 },
      { t: 5, e: 'f', n: 5 },
      { t: 6, e: 'f', n: 6 },
    ];
    const envelope = validateRunEvents({ events }, context({ foodCount: 3 }));
    expect(envelope).not.toBeNull();
    expect(envelope!.suspect).toBe(true);
  });

  it('tolerates a food-event count within +/-2', () => {
    const events = [
      { t: 1, e: 'f', n: 1 },
      { t: 2, e: 'f', n: 2 },
    ];
    const envelope = validateRunEvents({ events }, context({ foodCount: 3 }));
    expect(envelope).not.toBeNull();
    expect(envelope!.suspect).toBe(false);
  });

  it('a truncated stream may legitimately undercount foods', () => {
    const events = [{ t: 1, e: 'f', n: 1 }];
    const envelope = validateRunEvents(
      { events, truncated: true },
      context({ foodCount: 50 })
    );
    expect(envelope).not.toBeNull();
    expect(envelope!.truncated).toBe(true);
    expect(envelope!.suspect).toBe(false);
  });
});

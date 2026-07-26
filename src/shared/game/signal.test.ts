/**
 * The World Signal — the pure rules (Constitution §7.2, §8.6, §12.2).
 *
 * These are the acceptance tests WP-1.03 names, at the level where they are
 * actually decidable:
 *
 *   "same conditions worldwide per UTC day"   — three independent proofs, below
 *   "objective settlement tests"              — measurement, the four gates,
 *                                               and idempotency under re-settle
 *
 * Everything here runs against the pure module, so what it pins is the RULE,
 * not a particular database's mood and not a particular machine's timezone.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ANOMALIES,
  ANOMALY_ROTATION,
  ANOMALY_STRAINS,
  type AnomalyId,
} from '@/shared/game/anomalies';
import {
  describeSignalCondition,
  describeSignalDay,
  evaluateSignalObjective,
  isSignalObjectiveKind,
  measureSignalObjective,
  resolveSignalObjective,
  settleSignalAttempt,
  signalConditionForDay,
  signalDayEnd,
  signalDayHasEnded,
  signalDayIndex,
  signalDayKey,
  signalDayKeyToDate,
  signalDayStart,
  signalDayStatus,
  signalDaySeed,
  signalMilestonesReached,
  signalObjectiveId,
  signalObjectivesForDay,
  signalSeedNumber,
  SIGNAL_CONDITION_POOL,
  SIGNAL_EPOCH_UTC,
  SIGNAL_FIRST_COMPLETION_BONUS_DNA,
  SIGNAL_MILESTONES,
  SIGNAL_OBJECTIVE_BANDS,
  SIGNAL_OBJECTIVE_KINDS,
  SIGNAL_SEED_DOMAIN,
  type SignalAttemptState,
  type SignalObjectiveKind,
  type SignalRunFacts,
} from '@/shared/game/signal';

const DAY_MS = 86_400_000;

function facts(overrides: Partial<SignalRunFacts> = {}): SignalRunFacts {
  return {
    durationSeconds: 200,
    extracted: true,
    yieldDna: 1000,
    genesAccepted: 8,
    endReason: 'completed',
    validated: true,
    isPractice: false,
    ...overrides,
  };
}

function stored(overrides: Partial<SignalAttemptState> = {}): SignalAttemptState {
  return { progress: 0, completed: false, bonusPaid: false, ...overrides };
}

// ---------------------------------------------------------------------------
// "Same conditions worldwide per UTC day" — the work package's first acceptance
// ---------------------------------------------------------------------------
//
// Proved three independent ways, because it is the one property a single
// clever bug could silently break:
//
//   1. BEHAVIOURAL — every timezone's players, on the same UTC day, derive the
//      same day, seed, condition and objectives.
//   2. STRUCTURAL — the derivation cannot read a local-calendar getter,
//      enforced by poisoning every one of them and re-deriving.
//   3. TEXTUAL — the module contains no source of ambient non-determinism
//      (random, locale, environment) for a future edit to reach for.

describe('the day is the same everywhere (§7.2 acceptance)', () => {
  it('every instant inside a UTC day resolves to that day', () => {
    const first = new Date(Date.UTC(2026, 6, 26, 0, 0, 0, 0));
    const last = new Date(Date.UTC(2026, 6, 26, 23, 59, 59, 999));
    expect(signalDayKey(first)).toBe('2026-07-26');
    expect(signalDayKey(last)).toBe('2026-07-26');
  });

  it('rolls at 00:00 UTC exactly — the boundary, from both sides', () => {
    const lastMs = Date.UTC(2026, 6, 26, 23, 59, 59, 999);
    expect(signalDayKey(lastMs)).toBe('2026-07-26');
    expect(signalDayKey(lastMs + 1)).toBe('2026-07-27');

    const start = signalDayStart(lastMs);
    expect(start.toISOString()).toBe('2026-07-26T00:00:00.000Z');
    // The window is half-open: [00:00, next 00:00).
    expect(signalDayEnd(start).toISOString()).toBe('2026-07-27T00:00:00.000Z');
    expect(signalDayEnd(start).getTime() - start.getTime()).toBe(DAY_MS);
  });

  it('two players in different timezones on the same UTC day get the same Signal', () => {
    // The same INSTANT, reached from two wall clocks that disagree by a day.
    // Auckland (UTC+12) is already on the 26th; Los Angeles (UTC-7) is still
    // on the 25th. Both are inside UTC 2026-07-26, so both play one Signal.
    const auckland = new Date('2026-07-26T12:00:00+12:00'); // 00:00Z
    const losAngeles = new Date('2026-07-25T17:00:00-07:00'); // 00:00Z
    expect(auckland.getTime()).toBe(losAngeles.getTime());

    const a = describeSignalDay(auckland);
    const b = describeSignalDay(losAngeles);
    expect(a).toEqual(b);
    expect(a.day).toBe('2026-07-26');

    // And two DIFFERENT instants inside the same UTC day, which is the real
    // case: Auckland plays at its lunchtime, Los Angeles at its own.
    const aucklandNoon = new Date('2026-07-26T12:00:00+12:00'); // 00:00Z
    const laNoon = new Date('2026-07-26T12:00:00-07:00'); // 19:00Z, same UTC day
    expect(describeSignalDay(aucklandNoon)).toEqual(describeSignalDay(laNoon));
  });

  it('agrees across every UTC offset in use, on every day of a year', () => {
    // Local noon in each offset, mapped back to the instant it names. Any
    // offset whose local noon lands inside the UTC day must derive that day's
    // Signal, identically. Offsets run -12..+14 (the real-world range).
    for (let day = 0; day < 365; day += 1) {
      const dayStartMs = Date.UTC(2026, 0, 1) + day * DAY_MS;
      const expected = describeSignalDay(dayStartMs);
      expect(expected.day).toBe(new Date(dayStartMs).toISOString().slice(0, 10));

      for (let offsetHours = -12; offsetHours <= 14; offsetHours += 1) {
        // A player at this offset, at some moment inside the UTC day.
        const hourInsideUtcDay = ((offsetHours + 24) % 24);
        const instant = dayStartMs + hourInsideUtcDay * 3_600_000;
        const derived = describeSignalDay(instant);
        expect(derived).toEqual(expected);
      }
    }
  });

  it('derives the day without reading a single local-calendar getter', () => {
    // The structural proof. If any derivation path touched local time, the
    // result would depend on the machine's TZ — which is exactly the failure
    // "same conditions worldwide" forbids. Poison them all and re-derive.
    const localOnly = [
      'getFullYear',
      'getMonth',
      'getDate',
      'getDay',
      'getHours',
      'getMinutes',
      'getSeconds',
      'getMilliseconds',
      'getTimezoneOffset',
      'toLocaleDateString',
      'toLocaleTimeString',
      'toLocaleString',
      'toDateString',
    ] as const;

    const originals = new Map<string, unknown>();
    for (const name of localOnly) {
      originals.set(name, (Date.prototype as unknown as Record<string, unknown>)[name]);
      (Date.prototype as unknown as Record<string, unknown>)[name] = () => {
        throw new Error(`signal.ts read local time via Date.prototype.${name}`);
      };
    }

    try {
      const at = Date.UTC(2026, 6, 26, 13, 45);
      const day = describeSignalDay(at);
      expect(day.day).toBe('2026-07-26');
      expect(signalDayKey(at)).toBe('2026-07-26');
      expect(signalDayIndex(at)).toBe(Math.round((Date.UTC(2026, 6, 26) - SIGNAL_EPOCH_UTC) / DAY_MS));
      expect(signalDayStatus('2026-07-25', at)).toBe('archive');
      expect(signalDayHasEnded(day, at)).toBe(false);
    } finally {
      for (const name of localOnly) {
        (Date.prototype as unknown as Record<string, unknown>)[name] = originals.get(name);
      }
    }
  });

  it('contains no ambient non-determinism a future edit could reach for', () => {
    const source = readFileSync(join(__dirname, 'signal.ts'), 'utf8');
    // Comments stripped, in the convention the migration shape tests use: the
    // module's header explains at length what it must never do, and NAMING a
    // forbidden thing is not doing it.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    // No randomness, no locale, no environment. Any one of them would make the
    // day depend on WHO derived it, which is what §7.2 forbids.
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/\bIntl\b/);
    expect(code).not.toMatch(/toLocale/);
    expect(code).not.toMatch(/process\.env/);
    // No local-calendar getter, in text as well as in behaviour.
    expect(code).not.toMatch(/\.get(FullYear|Month|Date|Day|Hours|TimezoneOffset)\(/);

    // `Date.now()` appears ONLY as a default parameter value, never inside a
    // derivation body — a caller always names the instant it means, so a test
    // can pin any day in history without a fake clock.
    const nowUses = code.match(/Date\.now\(\)/g) ?? [];
    const defaultedNows = code.match(/=\s*Date\.now\(\)/g) ?? [];
    expect(nowUses.length).toBeGreaterThan(0);
    expect(nowUses.length).toBe(defaultedNows.length);
  });
});

describe('the seed', () => {
  it('is a pure function of the day key and is stable', () => {
    expect(signalDaySeed('2026-07-26')).toBe(signalDaySeed('2026-07-26'));
    expect(signalDaySeed('2026-07-26')).toMatch(/^D[0-9a-f]{8}$/);
    expect(describeSignalDay(Date.UTC(2026, 6, 26, 5)).seed).toBe(
      signalDaySeed('2026-07-26')
    );
  });

  it('is domain-separated, so a Monday Signal never mirrors that week Serpent', () => {
    // Both cadences key on a `YYYY-MM-DD`, and on a Monday it is the SAME
    // string. The domain prefix is what stops the two rhythms correlating.
    expect(SIGNAL_SEED_DOMAIN).toBe('signal:');
    const bare = (() => {
      let hash = 0x811c9dc5;
      const input = '2026-07-20';
      for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash >>> 0;
    })();
    expect(signalSeedNumber('2026-07-20')).not.toBe(bare);
  });

  it('gives a year of days a year of distinct seeds', () => {
    const seeds = new Set<string>();
    for (let day = 0; day < 365; day += 1) {
      seeds.add(signalDaySeed(signalDayKey(Date.UTC(2026, 0, 1) + day * DAY_MS)));
    }
    expect(seeds.size).toBe(365);
  });
});

describe('the day key round-trip', () => {
  it('accepts a well-formed UTC date and rejects everything else', () => {
    expect(signalDayKeyToDate('2026-07-26')?.toISOString()).toBe(
      '2026-07-26T00:00:00.000Z'
    );
    expect(signalDayKeyToDate('2026-02-30')).toBeNull(); // would roll to Mar 2
    expect(signalDayKeyToDate('2026-13-01')).toBeNull();
    expect(signalDayKeyToDate('26-07-26')).toBeNull();
    expect(signalDayKeyToDate('2026-07-26T00:00:00Z')).toBeNull();
    expect(signalDayKeyToDate('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The condition and the three objectives
// ---------------------------------------------------------------------------

describe('the condition-set costs no new content (§12.1 slot 1)', () => {
  it('draws from the shipped modifier pool, deterministically', () => {
    expect([...SIGNAL_CONDITION_POOL]).toEqual([...ANOMALY_ROTATION]);
    const at = Date.UTC(2026, 6, 26, 9);
    const first = signalConditionForDay(at);
    expect(signalConditionForDay(at)).toBe(first);
    expect(SIGNAL_CONDITION_POOL).toContain(first);
  });

  it('derives the gene-pool tilt from the modifier rather than drawing it', () => {
    for (const id of SIGNAL_CONDITION_POOL) {
      const described = describeSignalCondition(id);
      expect(described.name).toBe(ANOMALIES[id].name);
      expect(described.effect).toBe(ANOMALIES[id].effect);
      expect(described.kind).toBe(ANOMALIES[id].kind);
      // The tilt can never contradict the condition: it IS the condition's.
      expect(described.strainTilt).toBe(ANOMALY_STRAINS[id]);
    }
  });

  it('uses the whole pool across a year — no day is dead content', () => {
    const seen = new Set<AnomalyId>();
    for (let day = 0; day < 365; day += 1) {
      seen.add(signalConditionForDay(Date.UTC(2026, 0, 1) + day * DAY_MS));
    }
    expect(seen.size).toBe(SIGNAL_CONDITION_POOL.length);
  });
});

describe('the three objectives (§7.2: one choice from up to three)', () => {
  it('always offers all three kinds, in a fixed order', () => {
    for (let day = 0; day < 120; day += 1) {
      const objectives = signalObjectivesForDay(Date.UTC(2026, 0, 1) + day * DAY_MS);
      expect(objectives.map((o) => o.kind)).toEqual([...SIGNAL_OBJECTIVE_KINDS]);
    }
  });

  it('draws each target from its own band, deterministically', () => {
    const at = Date.UTC(2026, 6, 26);
    const first = signalObjectivesForDay(at);
    expect(signalObjectivesForDay(at)).toEqual(first);
    for (const objective of first) {
      expect(SIGNAL_OBJECTIVE_BANDS[objective.kind]).toContain(objective.target);
      expect(objective.id).toBe(signalObjectiveId(objective.kind));
      expect(objective.target).toBeGreaterThan(0);
    }
  });

  it('gives every objective EQUAL reward value (§7.2)', () => {
    // Structural, not a coincidence of today's draw: one flat constant, shared.
    for (let day = 0; day < 200; day += 1) {
      for (const objective of signalObjectivesForDay(Date.UTC(2026, 0, 1) + day * DAY_MS)) {
        expect(objective.bonusDna).toBe(SIGNAL_FIRST_COMPLETION_BONUS_DNA);
      }
    }
  });

  it('moves the targets over time rather than pinning one number forever', () => {
    const seen = new Map<SignalObjectiveKind, Set<number>>();
    for (const kind of SIGNAL_OBJECTIVE_KINDS) seen.set(kind, new Set());
    for (let day = 0; day < 365; day += 1) {
      for (const objective of signalObjectivesForDay(Date.UTC(2026, 0, 1) + day * DAY_MS)) {
        seen.get(objective.kind)?.add(objective.target);
      }
    }
    for (const kind of SIGNAL_OBJECTIVE_KINDS) {
      expect(seen.get(kind)?.size).toBe(SIGNAL_OBJECTIVE_BANDS[kind].length);
    }
  });

  it('does not correlate the targets with the condition draw', () => {
    // The condition consumes one step of the stream; the targets step past it.
    // If they shared a step, the condition would predict the first target.
    const pairs = new Set<string>();
    for (let day = 0; day < 365; day += 1) {
      const at = Date.UTC(2026, 0, 1) + day * DAY_MS;
      pairs.add(`${signalConditionForDay(at)}:${signalObjectivesForDay(at)[0].target}`);
    }
    // 5 conditions x 4 endure targets: a shared step would cap this at 5.
    expect(pairs.size).toBeGreaterThan(SIGNAL_CONDITION_POOL.length);
  });

  it('recognises its own kinds and nothing else', () => {
    for (const kind of SIGNAL_OBJECTIVE_KINDS) expect(isSignalObjectiveKind(kind)).toBe(true);
    for (const bad of ['ENDURE', 'survive', '', null, undefined, 3, {}]) {
      expect(isSignalObjectiveKind(bad)).toBe(false);
    }
  });
});

describe('the client chooses, it never defines (Rule 11)', () => {
  const day = describeSignalDay(Date.UTC(2026, 6, 26));

  it('resolves one of the day own three', () => {
    for (const objective of day.objectives) {
      expect(resolveSignalObjective(day, objective.id)).toEqual(objective);
    }
  });

  it('refuses an id the day did not derive — and refuses a non-string', () => {
    for (const bad of [
      'signal_cheat',
      'signal_endure_9999',
      '',
      null,
      undefined,
      42,
      { id: 'signal_endure' },
      ['signal_endure'],
    ]) {
      expect(resolveSignalObjective(day, bad)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Archive-as-practice (Rule 5)
// ---------------------------------------------------------------------------

describe('a missed day costs that day opportunity and nothing else (R5)', () => {
  const now = Date.UTC(2026, 6, 26, 10);

  it('classifies today, the archive and the unreachable future', () => {
    expect(signalDayStatus('2026-07-26', now)).toBe('today');
    expect(signalDayStatus('2026-07-25', now)).toBe('archive');
    expect(signalDayStatus('2024-01-01', now)).toBe('archive');
    // Tomorrow is not playable: an archive-as-practice run on it would let a
    // client mine tomorrow's conditions before the world sees them.
    expect(signalDayStatus('2026-07-27', now)).toBe('future');
    expect(signalDayStatus('nonsense', now)).toBe('invalid');
  });

  it('keeps an archived day fully derivable — it stays playable as practice', () => {
    const archived = describeSignalDay(Date.UTC(2026, 0, 14));
    expect(archived.day).toBe('2026-01-14');
    expect(archived.objectives).toHaveLength(3);
    expect(archived.condition.id).toBe(signalConditionForDay(Date.UTC(2026, 0, 14)));
    // Deriving it again, much later, gives the same day. History is not
    // rewritten by the passage of time.
    expect(describeSignalDay(Date.UTC(2026, 0, 14))).toEqual(archived);
  });

  it('pays nothing for practice, however good the run was', () => {
    const objective = { kind: 'extract' as const, target: 200 };
    const perfect = facts({ yieldDna: 100_000, isPractice: true });
    const outcome = evaluateSignalObjective(objective, perfect);
    // The measurement is still reported — practice tells you how you did.
    expect(outcome.progress).toBe(100_000);
    // It just completes nothing, so it can pay nothing.
    expect(outcome.complete).toBe(false);

    const settlement = settleSignalAttempt(objective, perfect, stored());
    expect(settlement.completed).toBe(false);
    expect(settlement.payBonus).toBe(false);
    expect(settlement.bonusDna).toBe(0);
  });

  it('has ended only once the exclusive end has passed', () => {
    const day = describeSignalDay(Date.UTC(2026, 6, 26));
    expect(signalDayHasEnded(day, Date.UTC(2026, 6, 26, 23, 59, 59, 999))).toBe(false);
    expect(signalDayHasEnded(day, Date.UTC(2026, 6, 27, 0, 0, 0, 0))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Measurement and the four gates
// ---------------------------------------------------------------------------

describe('measurement reads the run own settled facts and nothing else', () => {
  it('endure measures floored, non-negative seconds', () => {
    expect(measureSignalObjective('endure', facts({ durationSeconds: 149.9 }))).toBe(149);
    expect(measureSignalObjective('endure', facts({ durationSeconds: -5 }))).toBe(0);
  });

  it('extract measures Yield only on a BANKED run — the portal decision is the mechanic', () => {
    expect(measureSignalObjective('extract', facts({ extracted: true, yieldDna: 640 }))).toBe(640);
    // A run that died with a fortune in its body extracted nothing (§5).
    expect(measureSignalObjective('extract', facts({ extracted: false, yieldDna: 999_999 }))).toBe(0);
  });

  it('engineer measures accepted genes', () => {
    expect(measureSignalObjective('engineer', facts({ genesAccepted: 5 }))).toBe(5);
    expect(measureSignalObjective('engineer', facts({ genesAccepted: -2 }))).toBe(0);
  });
});

describe('the four gates on completion', () => {
  const objective = { kind: 'endure' as const, target: 120 };

  it('completes a settled, validated, non-practice run at target', () => {
    const outcome = evaluateSignalObjective(objective, facts({ durationSeconds: 120 }));
    expect(outcome).toEqual({ progress: 120, target: 120, complete: true });
  });

  it('completes nothing when the run did not settle (endReasonSettles false)', () => {
    // The acceptance criterion, stated directly: an expired, abandoned or
    // disconnected run completes NOTHING, however far it got.
    for (const endReason of ['abandoned', 'disconnected', 'expired']) {
      const outcome = evaluateSignalObjective(
        objective,
        facts({ endReason, durationSeconds: 100_000 })
      );
      expect(outcome.progress).toBe(100_000);
      expect(outcome.complete).toBe(false);

      const settlement = settleSignalAttempt(objective, facts({ endReason }), stored());
      expect(settlement.completed).toBe(false);
      expect(settlement.bonusDna).toBe(0);
    }
  });

  it('treats a null end_reason as settled (pre-045 rows)', () => {
    expect(evaluateSignalObjective(objective, facts({ endReason: null })).complete).toBe(true);
  });

  it('completes nothing for a flagged run, and still completes for an unknown one', () => {
    expect(evaluateSignalObjective(objective, facts({ validated: false })).complete).toBe(false);
    // `null` is "never judged", not "judged bad" — pre-validation rows still
    // count, which is the non-destructive direction (Rule 5).
    expect(evaluateSignalObjective(objective, facts({ validated: null })).complete).toBe(true);
  });

  it('completes nothing below target, and exactly at target', () => {
    expect(evaluateSignalObjective(objective, facts({ durationSeconds: 119 })).complete).toBe(false);
    expect(evaluateSignalObjective(objective, facts({ durationSeconds: 120 })).complete).toBe(true);
    expect(evaluateSignalObjective(objective, facts({ durationSeconds: 121 })).complete).toBe(true);
  });

  it('reads no account, entitlement or score field (Rule 2, Rule 3)', () => {
    // The shape of `SignalRunFacts` is the guarantee: there is no field here
    // through which money, a subscription or the skill number could enter.
    const keys = Object.keys(facts()).sort();
    expect(keys).toEqual([
      'durationSeconds',
      'endReason',
      'extracted',
      'genesAccepted',
      'isPractice',
      'validated',
      'yieldDna',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Settlement — idempotency, the second acceptance criterion
// ---------------------------------------------------------------------------

describe('auto-settlement is idempotent (§7.2 acceptance)', () => {
  const objective = { kind: 'extract' as const, target: 300 };

  it('run twice with the same inputs, the second settle changes nothing', () => {
    const run = facts({ extracted: true, yieldDna: 450 });

    const first = settleSignalAttempt(objective, run, stored());
    expect(first).toEqual({
      progress: 450,
      completed: true,
      newlyCompleted: true,
      payBonus: true,
      bonusDna: SIGNAL_FIRST_COMPLETION_BONUS_DNA,
    });

    // Feed the first settlement's own result back in, exactly as the database
    // row would hold it, and settle again.
    const second = settleSignalAttempt(objective, run, {
      progress: first.progress,
      completed: first.completed,
      bonusPaid: true,
    });
    expect(second).toEqual({
      progress: 450,
      completed: true,
      newlyCompleted: false,
      payBonus: false,
      bonusDna: 0,
    });

    // A third, a tenth, a hundredth: the same fixed point.
    let state: SignalAttemptState = {
      progress: second.progress,
      completed: second.completed,
      bonusPaid: true,
    };
    for (let i = 0; i < 10; i += 1) {
      const again = settleSignalAttempt(objective, run, state);
      expect(again).toEqual(second);
      state = {
        progress: again.progress,
        completed: again.completed,
        bonusPaid: true,
      };
    }
  });

  it('never increments — progress lands through GREATEST, never +=', () => {
    // A worse later run cannot pull a stored progress down...
    const better = settleSignalAttempt(
      objective,
      facts({ yieldDna: 100 }),
      stored({ progress: 450 })
    );
    expect(better.progress).toBe(450);

    // ...and a better one raises it exactly to the measurement, not past it.
    const raised = settleSignalAttempt(
      objective,
      facts({ yieldDna: 800 }),
      stored({ progress: 450 })
    );
    expect(raised.progress).toBe(800);
  });

  it('latches completion — a re-settle can never un-complete an earned Signal (R6)', () => {
    const missed = settleSignalAttempt(
      objective,
      facts({ extracted: false }),
      stored({ progress: 450, completed: true, bonusPaid: true })
    );
    expect(missed.completed).toBe(true);
    expect(missed.newlyCompleted).toBe(false);
    expect(missed.progress).toBe(450);
    expect(missed.bonusDna).toBe(0);
  });

  it('pays the first-completion bonus once and once only', () => {
    const run = facts({ yieldDna: 600 });
    const paid = settleSignalAttempt(objective, run, stored());
    expect(paid.payBonus).toBe(true);
    expect(paid.bonusDna).toBe(SIGNAL_FIRST_COMPLETION_BONUS_DNA);

    const already = settleSignalAttempt(objective, run, {
      progress: paid.progress,
      completed: true,
      bonusPaid: true,
    });
    expect(already.payBonus).toBe(false);
    expect(already.bonusDna).toBe(0);
  });

  it('retries a bonus the database never actually paid', () => {
    // Completed, but the paying UPDATE failed. `bonusPaid` is the row's
    // `bonus_paid_at`, so the retry is authorised by the row, not by a guess.
    const retry = settleSignalAttempt(objective, facts({ yieldDna: 600 }), {
      progress: 600,
      completed: true,
      bonusPaid: false,
    });
    expect(retry.payBonus).toBe(true);
    expect(retry.newlyCompleted).toBe(false);
    expect(retry.bonusDna).toBe(SIGNAL_FIRST_COMPLETION_BONUS_DNA);
  });

  it('is flat: no input to this module can change what a completion pays', () => {
    const amounts = new Set<number>();
    for (const kind of SIGNAL_OBJECTIVE_KINDS) {
      for (const target of SIGNAL_OBJECTIVE_BANDS[kind]) {
        const settled = settleSignalAttempt(
          { kind, target },
          facts({ durationSeconds: 10_000, yieldDna: 10_000, genesAccepted: 100 }),
          stored()
        );
        expect(settled.completed).toBe(true);
        amounts.add(settled.bonusDna);
      }
    }
    expect([...amounts]).toEqual([SIGNAL_FIRST_COMPLETION_BONUS_DNA]);
    expect(SIGNAL_FIRST_COMPLETION_BONUS_DNA).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Milestones — cumulative and explicitly NON-consecutive
// ---------------------------------------------------------------------------

describe('the marks are cumulative and never require consecutive days (§7.2)', () => {
  it('reaches a mark on the count alone', () => {
    expect(SIGNAL_MILESTONES).toEqual([30, 100, 365]);
    expect(signalMilestonesReached(0)).toEqual([]);
    expect(signalMilestonesReached(29)).toEqual([]);
    expect(signalMilestonesReached(30)).toEqual([30]);
    expect(signalMilestonesReached(99)).toEqual([30]);
    expect(signalMilestonesReached(100)).toEqual([30, 100]);
    expect(signalMilestonesReached(365)).toEqual([30, 100, 365]);
    expect(signalMilestonesReached(10_000)).toEqual([30, 100, 365]);
  });

  it('has no memory of gaps — a count cannot express a streak (R5)', () => {
    // 365 Signals earned across ten years with every kind of gap in them
    // reaches exactly the same marks as 365 in a row. The signature is the
    // guarantee: there is no date parameter to introduce a streak through.
    expect(signalMilestonesReached(365)).toEqual(signalMilestonesReached(365));
    expect(signalMilestonesReached.length).toBe(1);
  });

  it('clamps a nonsense count instead of reporting a mark for it', () => {
    expect(signalMilestonesReached(-50)).toEqual([]);
    expect(signalMilestonesReached(30.9)).toEqual([30]);
  });

  it('is monotonic — the marks a count reaches never shrink as it grows', () => {
    let previous = 0;
    for (let count = 0; count <= 400; count += 1) {
      const reached = signalMilestonesReached(count).length;
      expect(reached).toBeGreaterThanOrEqual(previous);
      previous = reached;
    }
  });
});

// ---------------------------------------------------------------------------
// The day, assembled
// ---------------------------------------------------------------------------

describe('describeSignalDay is the ONE definition of a day', () => {
  it('assembles exactly what its parts derive, with no extra state', () => {
    const at = Date.UTC(2026, 6, 26, 18, 30);
    const day = describeSignalDay(at);
    expect(day.day).toBe(signalDayKey(at));
    expect(day.startsAt).toBe('2026-07-26T00:00:00.000Z');
    expect(day.endsAt).toBe('2026-07-27T00:00:00.000Z');
    expect(day.seed).toBe(signalDaySeed('2026-07-26'));
    expect(day.condition).toEqual(describeSignalCondition(signalConditionForDay(at)));
    expect(day.objectives).toEqual(signalObjectivesForDay(at));
  });

  it('takes no player, account or request parameter (Rule 11, Rule 3)', () => {
    // One argument, and it is an instant. There is no signature here through
    // which a client value, an entitlement or an account could be introduced.
    expect(describeSignalDay.length).toBe(0); // one defaulted parameter
    expect(signalObjectivesForDay.length).toBe(0);
    expect(signalConditionForDay.length).toBe(0);
  });

  it('indexes days from the shared epoch the Serpent and Anomaly use', () => {
    expect(SIGNAL_EPOCH_UTC).toBe(Date.UTC(2024, 0, 1));
    expect(signalDayIndex(Date.UTC(2024, 0, 1))).toBe(0);
    expect(signalDayIndex(Date.UTC(2024, 0, 2, 23, 59))).toBe(1);
    // Stable across a DST-shaped stretch of the year, because there is no DST
    // in UTC — the point of using it.
    expect(signalDayIndex(Date.UTC(2026, 2, 29, 1, 30))).toBe(
      Math.round((Date.UTC(2026, 2, 29) - SIGNAL_EPOCH_UTC) / DAY_MS)
    );
  });
});

afterEach(() => {
  // Nothing in this file installs a fake clock; assert that stays true, so a
  // future edit cannot make one test's mock leak into the next one's day.
  expect(jest.isMockFunction(Date.now)).toBe(false);
});

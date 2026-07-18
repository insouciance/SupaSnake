/**
 * The Analyst — deterministic fact computation tests (Identity v1 §9).
 *
 * facts.ts is the load-bearing logic: every number a player sees from
 * the Analyst is asserted here. Coverage: portal-decision extraction
 * from event streams, near-wall math, pace vs personal median,
 * bank-vs-crash outcome arithmetic, digest aggregation, the full
 * archetype detection matrix (all 8 heuristics + The Hatchling + the
 * doc's tie priority, EXACT), and truncated/suspect envelope handling.
 */

import type { RunEventEnvelope, RunEvent } from '@/shared/game/runEvents';
import {
  ARCHETYPE_PRIORITY,
  ARCHETYPES,
  ArchetypeFacts,
  buildArchetypeFacts,
  buildDigestFacts,
  buildRecallFacts,
  buildRunFacts,
  buildScoutFacts,
  detectArchetype,
  estimatedOffers,
  foodsPerMinute,
  median,
  mutationEvents,
  nearWallStats,
  pct,
  portalStats,
  round1,
  RunFactsInput,
  SeasonRunRow,
} from './facts';

function env(
  events: RunEvent[],
  flags: { truncated?: boolean; suspect?: boolean } = {}
): RunEventEnvelope {
  return {
    v: 1,
    events,
    truncated: flags.truncated ?? false,
    suspect: flags.suspect ?? false,
  };
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

describe('numeric helpers', () => {
  it('round1 rounds to one decimal', () => {
    expect(round1(1.24)).toBe(1.2);
    expect(round1(1.25)).toBe(1.3);
  });

  it('pct is an integer percentage with zero-whole guard', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(2, 3)).toBe(67);
    expect(pct(5, 0)).toBe(0);
  });

  it('median handles odd, even and empty inputs', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('foodsPerMinute at 1-decimal precision', () => {
    expect(foodsPerMinute(30, 120)).toBe(15);
    expect(foodsPerMinute(7, 90)).toBe(4.7);
    expect(foodsPerMinute(10, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Event stream extraction
// ---------------------------------------------------------------------------

describe('portalStats — portal decisions from event streams', () => {
  it('counts spawns, passes and finds the banking ordinal', () => {
    const stats = portalStats(
      env([
        { t: 10, e: 'f', n: 1 },
        { t: 100, e: 'p', k: 'spawn' },
        { t: 190, e: 'p', k: 'pass' },
        { t: 250, e: 'p', k: 'spawn' },
        { t: 340, e: 'p', k: 'pass' },
        { t: 400, e: 'p', k: 'spawn' },
        { t: 420, e: 'p', k: 'enter' },
        { t: 421, e: 'b' },
        { t: 422, e: 'x', c: 'extracted' },
      ])
    );
    expect(stats.spawns).toBe(3);
    expect(stats.passes).toBe(2);
    expect(stats.entered).toBe(true);
    expect(stats.passesBeforeBank).toBe(2);
    expect(stats.bankingPortal).toBe(3);
  });

  it('a crashed run has passes but no banking portal', () => {
    const stats = portalStats(
      env([
        { t: 100, e: 'p', k: 'spawn' },
        { t: 190, e: 'p', k: 'pass' },
        { t: 300, e: 'x', c: 'wall' },
      ])
    );
    expect(stats.passes).toBe(1);
    expect(stats.entered).toBe(false);
    expect(stats.passesBeforeBank).toBeNull();
    expect(stats.bankingPortal).toBeNull();
  });

  it('is null-envelope safe', () => {
    expect(portalStats(null)).toEqual({
      spawns: 0,
      passes: 0,
      entered: false,
      passesBeforeBank: null,
      bankingPortal: null,
    });
  });
});

describe('nearWallStats', () => {
  it('sums episode durations against run length', () => {
    const stats = nearWallStats(
      env([
        { t: 50, e: 'w', d: 20 },
        { t: 200, e: 'w', d: 30 },
      ]),
      100 // seconds → 1000 ds
    );
    expect(stats.episodes).toBe(2);
    expect(stats.totalDs).toBe(50);
    expect(stats.ratio).toBeCloseTo(0.05);
  });

  it('handles zero duration and missing d', () => {
    expect(nearWallStats(env([{ t: 1, e: 'w' }]), 0).ratio).toBe(0);
    const stats = nearWallStats(env([{ t: 1, e: 'w' }]), 10);
    expect(stats.totalDs).toBe(0);
  });
});

describe('mutationEvents', () => {
  it('extracts pick ids in order', () => {
    expect(
      mutationEvents(
        env([
          { t: 10, e: 'm', id: 'gold_trail' },
          { t: 50, e: 'm', id: 'phoenix' },
          { t: 60, e: 'f', n: 9 },
        ])
      )
    ).toEqual(['gold_trail', 'phoenix']);
    expect(mutationEvents(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Run facts
// ---------------------------------------------------------------------------

function runInput(overrides: Partial<RunFactsInput['session']> = {}, extra: Partial<RunFactsInput> = {}): RunFactsInput {
  return {
    session: {
      id: 'session-1',
      dynasty: 'PRIMAL',
      score: 300,
      dnaEarned: 180,
      durationSeconds: 120,
      foodsCollected: 24,
      extracted: false,
      died: true,
      deathCause: 'wall',
      isFreePlay: false,
      anomalyId: null,
      ...overrides,
    },
    runEvents: null,
    economy: null,
    mutationPicks: [],
    recentSessions: [],
    ...extra,
  };
}

describe('buildRunFacts', () => {
  it('crashed run: salvage kept + banking upside from the shared 1.25/0.6 math', () => {
    const facts = buildRunFacts(runInput());
    expect(facts.outcome).toBe('crashed');
    expect(facts.deathCause).toBe('wall');
    // floor(180 * 1.25/0.6) - 180 = 375 - 180 = 195
    expect(facts.outcomeMath.missedByCrashing).toBe(195);
    expect(facts.outcomeMath.protectedByBanking).toBeNull();
    expect(facts.outcomeMath.bankMultiplier).toBe(1.25);
    expect(facts.outcomeMath.deathMultiplier).toBe(0.6);
  });

  it('extracted run: computes what a crash would have salvaged', () => {
    const facts = buildRunFacts(
      runInput({ extracted: true, died: false, deathCause: 'extracted', dnaEarned: 375 })
    );
    expect(facts.outcome).toBe('extracted');
    // salvage = floor(375 * 0.6/1.25) = 180 → protected 195
    expect(facts.outcomeMath.protectedByBanking).toBe(195);
    expect(facts.outcomeMath.missedByCrashing).toBeNull();
  });

  it('free play runs produce no outcome math', () => {
    const facts = buildRunFacts(runInput({ isFreePlay: true, dnaEarned: 0 }));
    expect(facts.freePlay).toBe(true);
    expect(facts.outcomeMath.missedByCrashing).toBeNull();
  });

  it('pace vs the 30-day personal median', () => {
    const facts = buildRunFacts(
      runInput(
        { foodsCollected: 30, durationSeconds: 60 }, // 30 f/min
        {
          recentSessions: [
            { foodsCollected: 20, durationSeconds: 60, extracted: false, dnaEarned: 10, dynasty: 'PRIMAL' },
            { foodsCollected: 20, durationSeconds: 60, extracted: false, dnaEarned: 10, dynasty: 'CYBER' },
            { foodsCollected: 20, durationSeconds: 60, extracted: true, dnaEarned: 10, dynasty: 'PRIMAL' },
          ],
        }
      )
    );
    expect(facts.pace.foodsPerMinute).toBe(30);
    expect(facts.pace.personalMedian).toBe(20);
    expect(facts.pace.deltaPct).toBe(50);
    // dynasty context: 2 of 3 recent runs in PRIMAL
    expect(facts.dynastyContext.sharePct).toBe(67);
  });

  it('short/foodless recent runs are excluded from the median', () => {
    const facts = buildRunFacts(
      runInput({}, {
        recentSessions: [
          { foodsCollected: 0, durationSeconds: 60, extracted: false, dnaEarned: 0, dynasty: 'PRIMAL' },
          { foodsCollected: 10, durationSeconds: 5, extracted: false, dnaEarned: 5, dynasty: 'PRIMAL' },
        ],
      })
    );
    expect(facts.pace.personalMedian).toBeNull();
    expect(facts.pace.deltaPct).toBeNull();
  });

  it('carries envelope quality flags (truncated/suspect fixtures)', () => {
    const truncated = buildRunFacts(
      runInput({}, { runEvents: env([{ t: 1, e: 'f', n: 1 }], { truncated: true }) })
    );
    expect(truncated.events).toEqual({ present: true, truncated: true, suspect: false });

    const suspect = buildRunFacts(
      runInput({}, { runEvents: env([{ t: 1, e: 'f', n: 1 }], { suspect: true }) })
    );
    expect(suspect.events.suspect).toBe(true);

    const absent = buildRunFacts(runInput());
    expect(absent.events).toEqual({ present: false, truncated: false, suspect: false });
  });

  it('build synergies: compound engine, high wire, phoenix, unassisted', () => {
    const loaded = buildRunFacts(
      runInput({}, {
        mutationPicks: [
          { id: 'compound_interest', atFood: 10 },
          { id: 'mirror_wager', atFood: 15 },
        ],
        economy: { phoenix_triggered_at_food: null },
      })
    );
    expect(loaded.build.held).toBe(2);
    expect(loaded.build.synergies).toContain('compound_engine');
    expect(loaded.build.synergies).toContain('high_wire');

    const clean = buildRunFacts(runInput());
    expect(clean.build.synergies).toEqual(['unassisted']);
  });

  it('mutation-shaped outcome multipliers flow into the bank math', () => {
    // mirror_wager: bank 1.5, death 0.3 → floor(100 * 5) - 100 = 400
    const facts = buildRunFacts(
      runInput({ dnaEarned: 100 }, {
        mutationPicks: [{ id: 'mirror_wager', atFood: 5 }],
      })
    );
    expect(facts.outcomeMath.bankMultiplier).toBe(1.5);
    expect(facts.outcomeMath.deathMultiplier).toBe(0.3);
    expect(facts.outcomeMath.missedByCrashing).toBe(400);
  });

  it('falls back to event-stream picks when session picks are absent', () => {
    const facts = buildRunFacts(
      runInput({}, {
        runEvents: env([{ t: 10, e: 'm', id: 'gold_trail' }]),
      })
    );
    expect(facts.build.picks).toEqual(['gold_trail']);
  });
});

// ---------------------------------------------------------------------------
// Digest facts
// ---------------------------------------------------------------------------

describe('buildDigestFacts', () => {
  const sessions = [
    { dynasty: 'PRIMAL', dnaEarned: 100, score: 200, extracted: true, died: false, foodsCollected: 20, durationSeconds: 100, deathCause: null, endedAt: '2026-07-06T10:00:00Z' },
    { dynasty: 'PRIMAL', dnaEarned: 50, score: 120, extracted: false, died: true, foodsCollected: 12, durationSeconds: 80, deathCause: 'wall', endedAt: '2026-07-06T11:00:00Z' },
    { dynasty: 'CYBER', dnaEarned: 200, score: 400, extracted: true, died: false, foodsCollected: 25, durationSeconds: 90, deathCause: null, endedAt: '2026-07-08T09:00:00Z' },
    { dynasty: 'COSMIC', dnaEarned: 0, score: 30, extracted: false, died: true, foodsCollected: 3, durationSeconds: 20, deathCause: 'self', endedAt: '2026-07-09T09:00:00Z' },
  ];

  it('aggregates the week', () => {
    const facts = buildDigestFacts({
      weekStart: '2026-07-06',
      sessions,
      contracts: { completed: 4, claimed: 3 },
      streak: { current: 6 },
      recordsAdvanced: [{ name: 'High Water', tier: 2 }],
    });
    expect(facts.runs).toBe(4);
    expect(facts.earningRuns).toBe(3);
    expect(facts.extractions).toBe(2);
    expect(facts.extractionRatePct).toBe(67);
    expect(facts.totalDna).toBe(350);
    expect(facts.bestDnaRun).toBe(200);
    expect(facts.bestScore).toBe(400);
    expect(facts.activeDays).toBe(3);
    expect(facts.topDynasty).toBe('PRIMAL');
    expect(facts.deathCauses).toEqual({ wall: 1, self: 1 });
    expect(facts.streak).toBe(6);
    expect(facts.recordsAdvanced).toHaveLength(1);
  });

  it('empty week produces a zeroed sheet', () => {
    const facts = buildDigestFacts({
      weekStart: '2026-07-06',
      sessions: [],
      contracts: null,
      streak: null,
      recordsAdvanced: [],
    });
    expect(facts.runs).toBe(0);
    expect(facts.topDynasty).toBeNull();
    expect(facts.extractionRatePct).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Archetype facts from raw season rows
// ---------------------------------------------------------------------------

function seasonRun(overrides: Partial<SeasonRunRow> = {}): SeasonRunRow {
  return {
    dynasty: 'PRIMAL',
    dnaEarned: 100,
    score: 200,
    extracted: false,
    died: true,
    foodsCollected: 20,
    durationSeconds: 100,
    endedAt: '2026-07-21T10:00:00Z',
    runEvents: null,
    mutationsHeld: null,
    ...overrides,
  };
}

describe('buildArchetypeFacts', () => {
  it('computes banking-portal median and passes from event streams', () => {
    const banked = (portal: number) =>
      seasonRun({
        extracted: true,
        died: false,
        runEvents: env([
          ...Array.from({ length: portal - 1 }, (_, i) => ({
            t: 10 + i * 10,
            e: 'p' as const,
            k: 'pass' as const,
          })),
          { t: 100, e: 'p', k: 'enter' },
          { t: 101, e: 'b' },
        ]),
      });
    const facts = buildArchetypeFacts({
      seasonSeq: 1,
      runs: [banked(1), banked(2), banked(4)],
      masteryLevels: {},
      contracts: null,
      seasonWeeks: 7,
    });
    expect(facts.medianBankingPortal).toBe(2);
    expect(facts.extractionRatePct).toBe(100);
    // passes: 0, 1, 3 → mean 1.3
    expect(facts.meanPortalsPassed).toBe(1.3);
  });

  it('salvage-loss ratio from the baseline outcome multipliers', () => {
    const facts = buildArchetypeFacts({
      seasonSeq: 1,
      // crashed 60 (banked would be floor(60*1.25/0.6)=125, lost 65);
      // banked 125 → potential 250, lost 65 → 26%
      runs: [
        seasonRun({ dnaEarned: 60 }),
        seasonRun({ extracted: true, died: false, dnaEarned: 125 }),
      ],
      masteryLevels: {},
      contracts: null,
      seasonWeeks: 7,
    });
    expect(facts.dnaLostToSalvagePct).toBe(26);
  });

  it('dynasty shares, cyber tier-4 axes and offer estimates', () => {
    const facts = buildArchetypeFacts({
      seasonSeq: 1,
      runs: [
        seasonRun({ dynasty: 'CYBER', foodsCollected: 25, extracted: true, died: false, mutationsHeld: 2 }),
        seasonRun({ dynasty: 'CYBER', foodsCollected: 10, mutationsHeld: 0 }),
        seasonRun({ dynasty: 'PRIMAL', foodsCollected: 40, mutationsHeld: 4 }),
      ],
      masteryLevels: { CYBER: 5 },
      contracts: { picked: 10, completed: 8 },
      seasonWeeks: 7,
    });
    expect(facts.dynastySharesPct.CYBER).toBe(67);
    expect(facts.cyber.runs).toBe(2);
    expect(facts.cyber.tier4Pct).toBe(50); // 25 foods reaches tier 4 (≥20)
    expect(facts.cyber.tier4Banked).toBe(1);
    expect(facts.meanMutationsHeld).toBe(2);
    // offers: 25→1, 10→0, 40→2 = 3; accepted 6 → capped 100
    expect(facts.offerAcceptPct).toBe(100);
    expect(facts.contractCompletionPct).toBe(80);
  });

  it('estimatedOffers models the shared cadence (first at 15, every ~20)', () => {
    expect(estimatedOffers(0)).toBe(0);
    expect(estimatedOffers(14)).toBe(0);
    expect(estimatedOffers(15)).toBe(1);
    expect(estimatedOffers(34)).toBe(1);
    expect(estimatedOffers(35)).toBe(2);
    expect(estimatedOffers(75)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Archetype detection matrix (doc §9.6 EXACT)
// ---------------------------------------------------------------------------

function archetypeFacts(overrides: Partial<ArchetypeFacts> = {}): ArchetypeFacts {
  return {
    kind: 'archetype',
    seasonSeq: 1,
    earningRuns: 30,
    extractionRatePct: 50,
    medianBankingPortal: 3,
    meanPortalsPassed: 1,
    dnaLostToSalvagePct: 20,
    dynastySharesPct: { PRIMAL: 50, CYBER: 30, COSMIC: 20 },
    masteryLevels: { PRIMAL: 2, CYBER: 2, COSMIC: 2 },
    meanMutationsHeld: 1.5,
    offerAcceptPct: 50,
    cyber: { runs: 9, tier4Pct: 0, tier4Banked: 0 },
    rhythm: { weeksActive: 3, seasonWeeks: 7, fiveDayWeeks: 1, fiveDayWeekSharePct: 14 },
    contractCompletionPct: 50,
    ...overrides,
  };
}

describe('detectArchetype — the 8 heuristics', () => {
  it('The Surgeon: extraction ≥65% AND median banking portal ≤2', () => {
    const d = detectArchetype(
      archetypeFacts({ extractionRatePct: 65, medianBankingPortal: 2 })
    );
    expect(d.archetype).toBe('surgeon');
    // Boundary misses
    expect(
      detectArchetype(archetypeFacts({ extractionRatePct: 64, medianBankingPortal: 2 })).qualified
    ).not.toContain('surgeon');
    expect(
      detectArchetype(archetypeFacts({ extractionRatePct: 80, medianBankingPortal: 2.5 })).qualified
    ).not.toContain('surgeon');
  });

  it('The Daredevil: mean portals passed ≥2.5 OR ≥40% DNA lost to salvage', () => {
    expect(detectArchetype(archetypeFacts({ meanPortalsPassed: 2.5 })).archetype).toBe('daredevil');
    expect(detectArchetype(archetypeFacts({ dnaLostToSalvagePct: 40 })).archetype).toBe('daredevil');
    expect(
      detectArchetype(archetypeFacts({ meanPortalsPassed: 2.4, dnaLostToSalvagePct: 39 })).qualified
    ).not.toContain('daredevil');
  });

  it('The Loyalist: ≥80% of earning runs in one dynasty', () => {
    const d = detectArchetype(
      archetypeFacts({ dynastySharesPct: { PRIMAL: 80, CYBER: 15, COSMIC: 5 } })
    );
    expect(d.archetype).toBe('loyalist');
  });

  it('The Polymath: every dynasty ≥20% AND every mastery ≥M3', () => {
    const d = detectArchetype(
      archetypeFacts({
        dynastySharesPct: { PRIMAL: 40, CYBER: 35, COSMIC: 25 },
        masteryLevels: { PRIMAL: 3, CYBER: 4, COSMIC: 3 },
      })
    );
    expect(d.archetype).toBe('polymath');
    // One mastery below M3 disqualifies
    expect(
      detectArchetype(
        archetypeFacts({
          dynastySharesPct: { PRIMAL: 40, CYBER: 35, COSMIC: 25 },
          masteryLevels: { PRIMAL: 3, CYBER: 4, COSMIC: 2 },
        })
      ).qualified
    ).not.toContain('polymath');
  });

  it('The Alchemist: mean held ≥2.5 AND ≥70% offers accepted', () => {
    const d = detectArchetype(
      archetypeFacts({ meanMutationsHeld: 2.5, offerAcceptPct: 70 })
    );
    expect(d.archetype).toBe('alchemist');
    expect(
      detectArchetype(archetypeFacts({ meanMutationsHeld: 2.5, offerAcceptPct: null })).qualified
    ).not.toContain('alchemist');
  });

  it('The Purist: mean held ≤0.5 across ≥20 runs', () => {
    expect(
      detectArchetype(archetypeFacts({ meanMutationsHeld: 0.5, earningRuns: 20 })).archetype
    ).toBe('purist');
    expect(
      detectArchetype(archetypeFacts({ meanMutationsHeld: 0.6, earningRuns: 40 })).qualified
    ).not.toContain('purist');
  });

  it('The Redliner: ≥30% of CYBER runs reach tier 4 AND ≥5 banked from it', () => {
    const d = detectArchetype(
      archetypeFacts({ cyber: { runs: 20, tier4Pct: 30, tier4Banked: 5 } })
    );
    expect(d.archetype).toBe('redliner');
    expect(
      detectArchetype(
        archetypeFacts({ cyber: { runs: 20, tier4Pct: 30, tier4Banked: 4 } })
      ).qualified
    ).not.toContain('redliner');
    // No CYBER runs at all → axis is dead, not divide-by-zero
    expect(
      detectArchetype(archetypeFacts({ cyber: { runs: 0, tier4Pct: 0, tier4Banked: 0 } })).scores.redliner
    ).toBe(0);
  });

  it('The Metronome: 5-day weeks ≥60% of season AND contracts ≥80%', () => {
    const d = detectArchetype(
      archetypeFacts({
        rhythm: { weeksActive: 6, seasonWeeks: 7, fiveDayWeeks: 5, fiveDayWeekSharePct: 71 },
        contractCompletionPct: 85,
      })
    );
    expect(d.archetype).toBe('metronome');
  });
});

describe('detectArchetype — Hatchling + tie priority (doc §9.6 EXACT)', () => {
  it('fewer than 20 earning runs ⇒ The Hatchling, regardless of axes', () => {
    const d = detectArchetype(
      archetypeFacts({
        earningRuns: 19,
        extractionRatePct: 90,
        medianBankingPortal: 1,
      })
    );
    expect(d.archetype).toBe('hatchling');
    expect(d.qualified).toEqual([]);
  });

  it('priority: Redliner beats Purist beats Alchemist ... beats Metronome', () => {
    // Qualify EVERYTHING qualify-able at once (purist and alchemist are
    // mutually exclusive on meanMutationsHeld — use the alchemist side)
    const all = archetypeFacts({
      extractionRatePct: 90,
      medianBankingPortal: 1,
      meanPortalsPassed: 5,
      dnaLostToSalvagePct: 50,
      dynastySharesPct: { PRIMAL: 80, CYBER: 10, COSMIC: 10 },
      meanMutationsHeld: 3,
      offerAcceptPct: 90,
      cyber: { runs: 20, tier4Pct: 50, tier4Banked: 10 },
      rhythm: { weeksActive: 7, seasonWeeks: 7, fiveDayWeeks: 7, fiveDayWeekSharePct: 100 },
      contractCompletionPct: 100,
    });
    const d = detectArchetype(all);
    expect(d.archetype).toBe('redliner');
    expect(d.qualified[0]).toBe('redliner');

    // Remove redliner → alchemist wins (purist can't coexist with held=3)
    const noRedliner = detectArchetype(
      archetypeFacts({ ...all, cyber: { runs: 20, tier4Pct: 0, tier4Banked: 0 } })
    );
    expect(noRedliner.archetype).toBe('alchemist');

    // Purist beats alchemist when both COULD fire (held ≤0.5 kills
    // alchemist anyway — assert purist beats surgeon instead)
    const puristVsSurgeon = detectArchetype(
      archetypeFacts({
        meanMutationsHeld: 0.2,
        extractionRatePct: 80,
        medianBankingPortal: 1,
      })
    );
    expect(puristVsSurgeon.archetype).toBe('purist');
    expect(puristVsSurgeon.qualified).toContain('surgeon');

    // Surgeon beats daredevil
    const surgeonVsDaredevil = detectArchetype(
      archetypeFacts({
        extractionRatePct: 70,
        medianBankingPortal: 2,
        dnaLostToSalvagePct: 45,
      })
    );
    expect(surgeonVsDaredevil.archetype).toBe('surgeon');
    expect(surgeonVsDaredevil.qualified).toContain('daredevil');

    // Loyalist beats metronome
    const loyalistVsMetronome = detectArchetype(
      archetypeFacts({
        dynastySharesPct: { PRIMAL: 85, CYBER: 10, COSMIC: 5 },
        rhythm: { weeksActive: 7, seasonWeeks: 7, fiveDayWeeks: 7, fiveDayWeekSharePct: 100 },
        contractCompletionPct: 100,
      })
    );
    expect(loyalistVsMetronome.archetype).toBe('loyalist');
    expect(loyalistVsMetronome.qualified).toContain('metronome');
  });

  it('nothing above its floor: the highest partial score wins', () => {
    const d = detectArchetype(archetypeFacts());
    expect(d.qualified).toEqual([]);
    expect(d.archetype).toBe('surgeon'); // 0.667 ties polymath; priority
  });

  it('priority list matches the doc order', () => {
    expect(ARCHETYPE_PRIORITY).toEqual([
      'redliner',
      'purist',
      'alchemist',
      'surgeon',
      'daredevil',
      'polymath',
      'loyalist',
      'metronome',
    ]);
  });

  it('every archetype has display metadata and a badge id', () => {
    for (const slug of [...ARCHETYPE_PRIORITY, 'hatchling'] as const) {
      expect(ARCHETYPES[slug].name).toBeTruthy();
      expect(ARCHETYPES[slug].badgeId).toBe(`archetype_${slug}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Recall + scout facts
// ---------------------------------------------------------------------------

describe('buildRecallFacts', () => {
  it('aggregates the season and names the archetype', () => {
    const facts = buildRecallFacts({
      seasonSeq: 1,
      seasonName: 'Solstice',
      runs: [
        { dynasty: 'PRIMAL', dnaEarned: 300, score: 500, extracted: true, endedAt: '2026-07-21T10:00:00Z' },
        { dynasty: 'PRIMAL', dnaEarned: 100, score: 200, extracted: false, endedAt: '2026-07-22T10:00:00Z' },
        { dynasty: 'CYBER', dnaEarned: 0, score: 50, extracted: false, endedAt: '2026-07-22T12:00:00Z' },
      ],
      variantsAcquired: 4,
      masteryLevels: { PRIMAL: 5 },
      badgesEarned: ['Solstice Badge'],
      clan: { name: 'Coilers', tag: 'COIL', duelWins: 3, duelLosses: 2, champion: false },
      archetype: 'surgeon',
    });
    expect(facts.totalRuns).toBe(3);
    expect(facts.earningRuns).toBe(2);
    expect(facts.totalDna).toBe(400);
    expect(facts.bestScore).toBe(500);
    expect(facts.bestDnaRun).toBe(300);
    expect(facts.extractionRatePct).toBe(50);
    expect(facts.activeDays).toBe(2);
    expect(facts.favoriteDynasty).toBe('PRIMAL');
    expect(facts.archetypeName).toBe('The Surgeon');
  });
});

describe('buildScoutFacts', () => {
  it('profiles roster mastery depth and pick habits', () => {
    const facts = buildScoutFacts({
      weekStart: '2026-07-20',
      opponent: { name: 'Vipers', tag: 'VIP', rating: 1230 },
      scouting: {
        roster: [
          { name: 'a', mastery: { CYBER: { level: 7 }, PRIMAL: { level: 2 } } },
          { name: 'b', mastery: { CYBER: { level: 5 } } },
          { name: 'c', mastery: { COSMIC: { level: 4 } } },
        ],
        lastPicks: [
          { weekStart: '2026-07-13', dynasty: 'CYBER', dynasty2: null, modifier: 'extracted_only', ban: 'phoenix' },
          { weekStart: '2026-07-06', dynasty: 'CYBER', dynasty2: 'PRIMAL', modifier: null, ban: 'gold_trail' },
        ],
        detail: true,
      },
    });
    expect(facts.rosterSize).toBe(3);
    expect(facts.masteryProfile.CYBER).toEqual({ m5Plus: 2, maxLevel: 7 });
    expect(facts.deepestDynasty).toBe('CYBER');
    expect(facts.pickHistory.repeatedDynasty).toBe('CYBER');
    expect(facts.pickHistory.bans).toEqual(['phoenix', 'gold_trail']);
  });
});

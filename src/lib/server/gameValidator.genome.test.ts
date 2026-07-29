/**
 * Genome validation branch - the trust boundary. The server pays its own
 * recompute of the ACCEPTED inputs regardless of any claim; bounded-trust
 * claims clamp against caps; the mastery XP base stays deterministic.
 */

/**
 * WP-2.05 NOTE for this whole file.
 *
 * `valid` now means "the server could BOUND this run's physics", not "no
 * finding at all" - see gameValidator.ts's severity table. Genome sanitizer
 * findings are REPAIRS: the illegal pick, infuse or surge is dropped and
 * the payout is recomputed from what survived, so the run stays eligible.
 *
 * The one exception in this file is SPLICE_CLAIMED_DIRECTLY, which is
 * FATAL: splices are derived by `fusePicks` and can never be claimed, so a
 * direct claim is forgery rather than a repairable mistake.
 */

import { describe, it, expect } from '@jest/globals';
import {
  validateGameResult,
  type GameResultInput,
  type GenomeValidationContext,
} from './gameValidator';
import {
  applyGenomeOutcome,
  computeGenomeRunTotals,
  computeRunTotals,
} from '@/shared/game/rulesets';
import { EMPTY_GENOME, type GenomeRunInput } from '@/shared/game/genome';
import { GENE_POOL } from '@/shared/game/genes';

const started = () => new Date(Date.now() - 300_000); // 5 minutes ago

const baseInput = (over: Partial<GameResultInput> = {}): GameResultInput => ({
  food_count: 60,
  extracted: true,
  score: computeRunTotals('PRIMAL', 60).score,
  dna_earned: computeRunTotals('PRIMAL', 60).rawDna,
  duration_seconds: 100,
  died: false,
  victory: false,
  ...over,
});

const ctx = (over: Partial<GenomeValidationContext> = {}): GenomeValidationContext => ({
  heirloom: {},
  genePool: [...GENE_POOL],
  prevRunDied: false,
  tierCap: 3,
  ...over,
});

const genomeOf = (input: Partial<GenomeRunInput>): GenomeRunInput => ({
  ...EMPTY_GENOME,
  ...input,
});

describe('genome branch dispatch', () => {
  it('no genomeCtx => legacy result (genome null, masteryRawDna = rawDna)', () => {
    const result = validateGameResult(baseInput(), started(), 'PRIMAL');
    expect(result.genome).toBeNull();
    expect(result.masteryRawDna).toBe(result.rawDna);
  });

  it('genomeCtx with empty claim => deterministic recompute, valid', () => {
    const result = validateGameResult(
      baseInput(),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.valid).toBe(true);
    expect(result.genome).not.toBeNull();
    expect(result.rawDna).toBe(computeRunTotals('PRIMAL', 60).rawDna);
  });
});

describe('Rule-15 pressure event validation', () => {
  const feralPicks: GenomeRunInput['picks'] = [
    { id: 'overgrowth', atFood: 15 },
    { id: 'deep_roots', atFood: 30 },
    { id: 'glacial_reserve', atFood: 45 },
  ];
  const heirloom = { FERAL: 1 } as const;

  function settle(pressureEvents: unknown) {
    const acceptedEvents = Array.isArray(pressureEvents)
      ? (pressureEvents as GenomeRunInput['pressureEvents'])
      : [];
    const genomeInput = genomeOf({
      picks: feralPicks,
      heirloom,
      pressureEvents: acceptedEvents,
    });
    const totals = computeGenomeRunTotals('PRIMAL', 60, genomeInput);
    return validateGameResult(
      baseInput({
        food_count: 60,
        score: totals.score,
        dna_earned: totals.rawDna,
        mutations: feralPicks,
        genome: { pressureEvents },
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx({ heirloom: { ...heirloom }, genePool: null })
    );
  }

  it('accepts one Thick Hide and cadence-bounded Ouroboros facts', () => {
    const events = [
      { atFood: 15, source: 'thick_hide' },
      { atFood: 50, source: 'ouroboros' },
      { atFood: 55, source: 'ouroboros' },
    ];
    const result = settle(events);
    expect(result.valid).toBe(true);
    expect(result.errors).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('CLAIM_CLAMPED: pressureEvents'),
      ])
    );
    expect(result.genome?.pressureEvents).toEqual(events);
  });

  it('drops impossible activation, duplicate pardon, and early bite facts', () => {
    const result = settle([
      { atFood: 4, source: 'thick_hide' },
      { atFood: 15, source: 'thick_hide' },
      { atFood: 16, source: 'thick_hide' },
      { atFood: 49, source: 'ouroboros' },
    ]);
    expect(result.valid).toBe(true); // advisory repair, never lost progression
    expect(result.genome?.pressureEvents).toEqual([
      { atFood: 15, source: 'thick_hide' },
    ]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('CLAIM_CLAMPED: pressureEvents'),
      ])
    );
  });
});

describe('gene pick validation', () => {
  it('accepts legal picks and pays the exact genome recompute', () => {
    const picks = [
      { id: 'gold_trail', atFood: 16 },
      { id: 'loan_shark', atFood: 35 },
    ];
    const totals = computeGenomeRunTotals(
      'PRIMAL',
      60,
      genomeOf({ picks: picks as GenomeRunInput['picks'] })
    );
    const result = validateGameResult(
      baseInput({
        mutations: picks,
        dna_earned: totals.rawDna,
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.valid).toBe(true);
    expect(result.rawDna).toBe(totals.rawDna);
    expect(result.adjustedDna).toBe(
      applyGenomeOutcome(
        totals.rawDna,
        true,
        genomeOf({ picks: picks as GenomeRunInput['picks'] })
      )
    );
  });

  it('drops out-of-pool genes, direct splice claims, and unknown ids', () => {
    const result = validateGameResult(
      baseInput({
        mutations: [
          { id: 'splice_dragon_hoard', atFood: 20 }, // derived, never claimed
          { id: 'heartwood', atFood: 25 }, // M10 signature, not in base pool
          { id: 'nonsense', atFood: 30 },
          { id: 'tithe', atFood: 40 }, // legal
        ],
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    // FATAL, and the only forgery code in the model: a splice id in the
    // claim describes a run no engine could have produced.
    expect(result.valid).toBe(false);
    expect(result.fatalErrors).toContainEqual(
      expect.stringContaining('SPLICE_CLAIMED_DIRECTLY')
    );
    // GENE_LOCKED rides along as an advisory repair on the same run.
    expect(result.advisoryErrors).toContainEqual(
      expect.stringContaining('GENE_LOCKED')
    );
    expect(result.genome!.picks.map((p) => p.id)).toEqual(['tithe']);
    expect(result.errors.join(' ')).toMatch(/SPLICE_CLAIMED_DIRECTLY/);
    expect(result.errors.join(' ')).toMatch(/GENE_LOCKED: heartwood/);
  });

  it('enforces the new four-food offer-source floor independently of slots', () => {
    const picks = [
      'gold_trail',
      'overgrowth',
      'wall_rush',
      'mirror_wager',
      'magnet_pulse',
      'time_dilation',
    ].map((id, i) => ({ id, atFood: 4 + i * 3 }));
    const result = validateGameResult(
      baseInput({ food_count: 20, mutations: picks }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.valid).toBe(true);
    expect(result.advisoryErrors).toContainEqual(
      expect.stringContaining('GENE_BOUND')
    );
    // Six picks fit the held-slot model (the final two splice), but only five
    // cadence offers can exist by food 20: floor(20/4) = 5.
    expect(result.genome!.picks.length).toBe(5);
  });

  it('accepts seven raw picks when one splice keeps them within six slots', () => {
    const picks = [
      { id: 'gold_trail', atFood: 15 },
      { id: 'compound_interest', atFood: 30 }, // Dragon Hoard: one slot
      { id: 'overgrowth', atFood: 45 },
      { id: 'wall_rush', atFood: 60 },
      { id: 'mirror_wager', atFood: 75 },
      { id: 'slipstream', atFood: 90 },
      { id: 'serpentine', atFood: 105 },
    ] as GenomeRunInput['picks'];
    const totals = computeGenomeRunTotals('PRIMAL', 120, genomeOf({ picks }));
    const result = validateGameResult(
      baseInput({
        food_count: 120,
        duration_seconds: 200,
        score: totals.score,
        dna_earned: totals.rawDna,
        mutations: picks,
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.valid).toBe(true);
    expect(result.genome!.picks).toHaveLength(7);
    expect(result.genome!.splices).toEqual([
      { id: 'splice_dragon_hoard', atFood: 30 },
    ]);
  });

  it('enforces six raw slots while the splice FTUE gate is locked', () => {
    const rawPicks = [
      { id: 'gold_trail', atFood: 15 },
      { id: 'compound_interest', atFood: 30 },
      { id: 'overgrowth', atFood: 45 },
      { id: 'wall_rush', atFood: 60 },
      { id: 'mirror_wager', atFood: 75 },
      { id: 'slipstream', atFood: 90 },
      { id: 'serpentine', atFood: 105 },
    ] as GenomeRunInput['picks'];
    const accepted = rawPicks.slice(0, 6);
    const totals = computeGenomeRunTotals(
      'PRIMAL',
      120,
      genomeOf({ picks: accepted, splicesEnabled: false })
    );
    const result = validateGameResult(
      baseInput({
        food_count: 120,
        duration_seconds: 200,
        score: totals.score,
        dna_earned: totals.rawDna,
        mutations: rawPicks,
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx({ splicesUnlocked: false })
    );
    expect(result.valid).toBe(true);
    expect(result.advisoryErrors).toContainEqual(
      expect.stringContaining('GENE_BOUND')
    );
    expect(result.genome!.picks).toEqual(accepted);
    expect(result.genome!.splices).toEqual([]);
    expect(result.errors.join(' ')).toMatch(/would occupy 7 slots/);
  });

  it('derives splices server-side from raw parent picks', () => {
    const result = validateGameResult(
      baseInput({
        mutations: [
          { id: 'gold_trail', atFood: 16 },
          { id: 'compound_interest', atFood: 32 },
        ],
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.genome!.splices).toEqual([
      { id: 'splice_dragon_hoard', atFood: 32 },
    ]);
  });
});

describe('infuse validation + outcome', () => {
  it('accepts bounded infuses and pays the shifted outcome', () => {
    const input = genomeOf({ infuses: [{ atFood: 20 }, { atFood: 40 }] });
    const totals = computeGenomeRunTotals('PRIMAL', 60, input);
    const result = validateGameResult(
      baseInput({
        dna_earned: totals.rawDna,
        genome: { infuses: [{ atFood: 20 }, { atFood: 40 }] },
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.valid).toBe(true);
    expect(result.genome!.infuses.length).toBe(2);
    // bank 1.25 + 0.10 = 1.35
    expect(result.adjustedDna).toBe(Math.floor(totals.rawDna * 1.35));
  });

  it('clamps infuses beyond the portal budget', () => {
    // 20 foods: portals = 1 + floor(5/8) = 1; extraction uses it => 0 left.
    const result = validateGameResult(
      baseInput({
        food_count: 20,
        duration_seconds: 60,
        score: computeRunTotals('PRIMAL', 20).score,
        dna_earned: computeRunTotals('PRIMAL', 20).rawDna,
        genome: { infuses: [{ atFood: 16 }] },
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.valid).toBe(true);
    expect(result.advisoryErrors).toContainEqual(
      expect.stringContaining('INFUSE_BOUND')
    );
    expect(result.genome!.infuses.length).toBe(0);
    expect(result.errors.join(' ')).toMatch(/INFUSE_BOUND/);
  });

  it('accepts one surge only when an infuse occurs at six occupied slots', () => {
    const picks = [
      { id: 'gold_trail', atFood: 15 },
      { id: 'overgrowth', atFood: 30 },
      { id: 'wall_rush', atFood: 45 },
      { id: 'slipstream', atFood: 60 },
      { id: 'serpentine', atFood: 75 },
      { id: 'bulk_up', atFood: 90 },
    ] as GenomeRunInput['picks'];
    const genome = genomeOf({
      picks,
      infuses: [{ atFood: 95 }],
      surges: [{ strain: 'AURUM', atFood: 95 }],
    });
    const totals = computeGenomeRunTotals('PRIMAL', 100, genome);
    const result = validateGameResult(
      baseInput({
        food_count: 100,
        duration_seconds: 180,
        score: totals.score,
        dna_earned: totals.rawDna,
        mutations: picks,
        genome: {
          infuses: genome.infuses,
          surges: genome.surges,
        },
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.valid).toBe(true);
    expect(result.genome!.surges).toEqual([
      { strain: 'AURUM', atFood: 95 },
    ]);
  });

  it('drops surges without a full build or a held strain', () => {
    const picks = [
      { id: 'gold_trail', atFood: 15 },
      { id: 'overgrowth', atFood: 30 },
      { id: 'wall_rush', atFood: 45 },
      { id: 'slipstream', atFood: 60 },
      { id: 'serpentine', atFood: 75 },
      { id: 'bulk_up', atFood: 90 },
    ];
    const result = validateGameResult(
      baseInput({
        food_count: 100,
        duration_seconds: 180,
        mutations: picks,
        genome: {
          infuses: [{ atFood: 20 }, { atFood: 95 }],
          surges: [
            { strain: 'AURUM', atFood: 20 }, // build is not full yet
            { strain: 'UMBRA', atFood: 95 }, // no held UMBRA gene
            { strain: 'AURUM', atFood: 95 },
          ],
        },
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.valid).toBe(true);
    expect(result.advisoryErrors).toContainEqual(
      expect.stringContaining('SURGE_INVALID')
    );
    expect(result.genome!.surges).toEqual([
      { strain: 'AURUM', atFood: 95 },
    ]);
    expect(result.errors.join(' ')).toMatch(/without 6 occupied gene slots/);
    expect(result.errors.join(' ')).toMatch(/UMBRA is not represented/);
  });

  it('allows at most one surge per infuse', () => {
    const picks = [
      { id: 'gold_trail', atFood: 15 },
      { id: 'overgrowth', atFood: 30 },
      { id: 'wall_rush', atFood: 45 },
      { id: 'slipstream', atFood: 60 },
      { id: 'serpentine', atFood: 75 },
      { id: 'bulk_up', atFood: 90 },
    ];
    const result = validateGameResult(
      baseInput({
        food_count: 100,
        duration_seconds: 180,
        mutations: picks,
        genome: {
          infuses: [{ atFood: 95 }],
          surges: [
            { strain: 'AURUM', atFood: 95 },
            { strain: 'FERAL', atFood: 95 },
          ],
        },
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.valid).toBe(true);
    expect(result.advisoryErrors).toContainEqual(
      expect.stringContaining('SURGE_INVALID')
    );
    expect(result.genome!.surges).toEqual([
      { strain: 'AURUM', atFood: 95 },
    ]);
    expect(result.errors.join(' ')).toMatch(/multiple surges/);
  });

  it('does not let one infuse fund both a seventh raw pick and a surge', () => {
    const picks = [
      { id: 'gold_trail', atFood: 4 },
      { id: 'compound_interest', atFood: 8 }, // splice frees one slot
      { id: 'overgrowth', atFood: 12 },
      { id: 'wall_rush', atFood: 16 },
      { id: 'slipstream', atFood: 20 },
      { id: 'serpentine', atFood: 22 },
      { id: 'bulk_up', atFood: 24 }, // seventh pick needs the infuse offer
    ] as GenomeRunInput['picks'];
    const acceptedGenome = genomeOf({
      picks,
      infuses: [{ atFood: 24 }],
    });
    const totals = computeGenomeRunTotals('PRIMAL', 24, acceptedGenome);
    const result = validateGameResult(
      baseInput({
        food_count: 24,
        duration_seconds: 180,
        score: totals.score,
        dna_earned: totals.rawDna,
        mutations: picks,
        genome: {
          infuses: acceptedGenome.infuses,
          surges: [{ strain: 'AURUM', atFood: 24 }],
        },
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.valid).toBe(true);
    expect(result.advisoryErrors).toContainEqual(
      expect.stringContaining('SURGE_INVALID')
    );
    expect(result.genome!.picks).toHaveLength(7);
    expect(result.genome!.surges).toEqual([]);
    expect(result.errors.join(' ')).toMatch(/infuse-sourced gene picks/);
  });
});

describe('bounded-trust claims', () => {
  const aurumPicks = [
    { id: 'gold_trail', atFood: 16 },
    { id: 'tithe', atFood: 32 },
    { id: 'loan_shark', atFood: 48 }, // AURUM x3 -> expression at 48
  ];

  it('clamps an inflated Gilded Wake claim to the 25% cap', () => {
    const input = genomeOf({ picks: aurumPicks as GenomeRunInput['picks'] });
    const totals = computeGenomeRunTotals('PRIMAL', 100, input);
    const result = validateGameResult(
      baseInput({
        food_count: 100,
        duration_seconds: 150,
        score: totals.score,
        dna_earned: totals.rawDna + totals.caps.aurumWakeDna,
        mutations: aurumPicks,
        genome: { claims: { aurumWakeDna: 999999 } },
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.genome!.claims.aurumWakeDna).toBe(totals.caps.aurumWakeDna);
    expect(result.rawDna).toBe(totals.rawDna + totals.caps.aurumWakeDna);
  });

  it('zeroes claims without the matching activation', () => {
    const result = validateGameResult(
      baseInput({
        genome: { claims: { aurumWakeDna: 500, ouroborosDna: 300 } },
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.genome!.claims.aurumWakeDna).toBe(0);
    expect(result.genome!.claims.ouroborosDna).toBe(0);
  });

  it('mastery XP base excludes accepted claims (deterministic only)', () => {
    const input = genomeOf({ picks: aurumPicks as GenomeRunInput['picks'] });
    const totals = computeGenomeRunTotals('PRIMAL', 100, input);
    const result = validateGameResult(
      baseInput({
        food_count: 100,
        duration_seconds: 150,
        score: totals.score,
        dna_earned: totals.rawDna + 50,
        mutations: aurumPicks,
        genome: { claims: { aurumWakeDna: 50 } },
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.rawDna).toBe(totals.rawDna + 50);
    expect(result.masteryRawDna).toBe(totals.rawDna);
  });
});

describe('revive validation', () => {
  it('honors a plausible phoenix revive (voids benefits, legacy field set)', () => {
    const picks = [
      { id: 'gold_trail', atFood: 16 },
      { id: 'phoenix', atFood: 32 },
    ];
    const result = validateGameResult(
      baseInput({
        extracted: false,
        died: true,
        mutations: picks,
        genome: { revive: { kind: 'phoenix', atFood: 45 } },
        dna_earned: 0,
        score: 0,
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.genome!.revive).toEqual({ kind: 'phoenix', atFood: 45 });
    expect(result.phoenixTriggeredAtFood).toBe(45);
  });

  it('rejects a second_sun revive without the UMBRA apex', () => {
    const result = validateGameResult(
      baseInput({
        genome: { revive: { kind: 'second_sun', atFood: 45 } },
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.valid).toBe(true);
    expect(result.advisoryErrors).toContainEqual(
      expect.stringContaining('REVIVE_INVALID')
    );
    expect(result.genome!.revive).toBeNull();
    expect(result.genome!.claims.secondSunTriggered).toBe(false);
  });

  it('rejects a styx revive without the fusion', () => {
    const result = validateGameResult(
      baseInput({
        mutations: [{ id: 'mirror_wager', atFood: 16 }],
        genome: { revive: { kind: 'styx', atFood: 45 } },
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.genome!.revive).toBeNull();
    expect(result.errors.join(' ')).toMatch(/REVIVE_INVALID/);
  });
});

describe('FTUE tier cap binds the economy', () => {
  it('tierCap 1 suppresses Expression economics server-side', () => {
    const picks = [
      { id: 'gold_trail', atFood: 16 },
      { id: 'tithe', atFood: 32 },
      { id: 'loan_shark', atFood: 48 },
    ];
    const capped = computeGenomeRunTotals(
      'PRIMAL',
      100,
      genomeOf({ picks: picks as GenomeRunInput['picks'], tierCap: 1 })
    );
    const result = validateGameResult(
      baseInput({
        food_count: 100,
        duration_seconds: 150,
        score: capped.score,
        dna_earned: capped.rawDna,
        mutations: picks,
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx({ tierCap: 1 })
    );
    expect(result.valid).toBe(true);
    expect(result.rawDna).toBe(capped.rawDna);
    // Gilded Wake cap is zero under the FTUE lid (no expression).
    const clamped = validateGameResult(
      baseInput({
        food_count: 100,
        duration_seconds: 150,
        score: capped.score,
        dna_earned: capped.rawDna,
        mutations: picks,
        genome: { claims: { aurumWakeDna: 100 } },
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx({ tierCap: 1 })
    );
    expect(clamped.genome!.claims.aurumWakeDna).toBe(0);
  });
});

describe('heirloom points come from the server context only', () => {
  it('heirloom shifts the recompute (client cannot assert it)', () => {
    const picks = [
      { id: 'gold_trail', atFood: 16 },
      { id: 'tithe', atFood: 32 },
    ];
    const withHeirloom = computeGenomeRunTotals(
      'PRIMAL',
      60,
      genomeOf({ picks: picks as GenomeRunInput['picks'], heirloom: { AURUM: 1 } })
    );
    const result = validateGameResult(
      baseInput({
        mutations: picks,
        dna_earned: withHeirloom.rawDna,
        score: withHeirloom.score,
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx({ heirloom: { AURUM: 1 } })
    );
    expect(result.valid).toBe(true);
    expect(result.rawDna).toBe(withHeirloom.rawDna);
  });
});

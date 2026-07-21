/**
 * Genome validation branch - the trust boundary. The server pays its own
 * recompute of the ACCEPTED inputs regardless of any claim; bounded-trust
 * claims clamp against caps; the mastery XP base stays deterministic.
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
  crownAllowed: false,
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
    expect(result.valid).toBe(false);
    expect(result.genome!.picks.map((p) => p.id)).toEqual(['tithe']);
    expect(result.errors.join(' ')).toMatch(/SPLICE_CLAIMED_DIRECTLY/);
    expect(result.errors.join(' ')).toMatch(/GENE_LOCKED: heartwood/);
  });

  it('caps held genes at 6 and enforces the offer-source bound', () => {
    const picks = [
      'gold_trail',
      'overgrowth',
      'wall_rush',
      'mirror_wager',
      'magnet_pulse',
      'time_dilation',
      'splitter',
    ].map((id, i) => ({ id, atFood: 16 + i }));
    const result = validateGameResult(
      baseInput({ mutations: picks }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.valid).toBe(false);
    // Cap 6, then offer-source bound floor(60/15)+0 infuses = 4.
    expect(result.genome!.picks.length).toBe(4);
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
    expect(result.valid).toBe(false);
    expect(result.genome!.infuses.length).toBe(0);
    expect(result.errors.join(' ')).toMatch(/INFUSE_BOUND/);
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
        genome: { claims: { aurumWakeDna: 500, moltFoodDna: 300 } },
      }),
      started(),
      'PRIMAL',
      [],
      null,
      null,
      ctx()
    );
    expect(result.genome!.claims.aurumWakeDna).toBe(0);
    expect(result.genome!.claims.moltFoodDna).toBe(0);
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
    expect(result.valid).toBe(false);
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

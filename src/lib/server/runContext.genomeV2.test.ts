import { describe, expect, it } from '@jest/globals';

import { createAscendanceRunStamp } from '@/shared/game/ascendance';
import { genomeV2ActivePool } from '@/shared/game/genes';
import {
  deriveGenomeV2FtuePresentation,
  GENOME_V2_INTERACTION_PHYSICAL_RELIC,
  GENOME_RULES_V2,
} from '@/shared/game/genomeV2';
import {
  parseRunStartContext,
  RUN_CONTEXT_LEGACY_VERSION,
  serializeRunStartContext,
  type RunStartContext,
} from './runContext';

function v2Context(): RunStartContext {
  const ftuePresentation = deriveGenomeV2FtuePresentation(7, 2);
  return {
    v: RUN_CONTEXT_LEGACY_VERSION,
    snake: {
      id: 'snake-v2',
      generation: 11,
      traits: ['iron_scales'],
      ascendance: createAscendanceRunStamp(11),
    },
    mutationPool: ['gold_trail'],
    freePlay: false,
    growthProfileId: 'dynasty',
    genome: {
      rulesVersion: GENOME_RULES_V2,
      interactionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
      genePool: genomeV2ActivePool('COSMIC'),
      heirloom: { UMBRA: 1 },
      lineage: {
        strains: ['UMBRA'],
        guaranteeFirstOffer: true,
        guaranteeStrains: ['UMBRA'],
      },
      tierCap: 2,
      suppressedStrains: [],
      strainThresholdDelta: { UMBRA: 1 },
      splicesUnlocked: true,
      prevRunDied: false,
      ftuePresentation,
      externalSecondLife: 'iron_scales',
    },
  };
}

function roundTrip(context: RunStartContext) {
  return parseRunStartContext(
    JSON.parse(JSON.stringify(serializeRunStartContext(context)))
  );
}

describe('run_context: Genome v2 and Ascendance authority', () => {
  it('round-trips v2-only genes, the full FTUE presentation, and Ascendance stamp', () => {
    const source = v2Context();
    const parsed = roundTrip(source);

    expect(parsed).toEqual({ ok: true, context: source });
  });

  it('keeps an unstamped historical context on Genome v1', () => {
    const raw = {
      v: RUN_CONTEXT_LEGACY_VERSION,
      snake: { id: 'legacy', generation: 20, traits: [] },
      mutationPool: ['gold_trail'],
      freePlay: false,
      genome: {
        // V1 accepted duplicate arrays historically. V2 is strict, but the
        // parser must not retroactively condemn an already-started v1 run.
        genePool: ['gold_trail', 'gold_trail', 'compound_interest'],
        heirloom: {},
        lineage: null,
        tierCap: 1,
        suppressedStrains: ['VOLT', 'VOLT'],
        // Historical v1 accepted a wider authored condition envelope. The v2
        // correction must not retroactively invalidate those frozen sessions.
        strainThresholdDelta: { VOLT: 99 },
        splicesUnlocked: false,
        prevRunDied: false,
      },
    };

    const parsed = parseRunStartContext(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.context.snake.ascendance).toBeUndefined();
    expect(parsed.context.genome?.rulesVersion).toBeUndefined();
  });

  it('accepts a historical v2 context without an interaction stamp as automatic-offer v1', () => {
    const raw = serializeRunStartContext(v2Context());
    const genome = { ...(raw.genome as Record<string, unknown>) };
    delete genome.interactionVersion;

    const parsed = parseRunStartContext({ ...raw, genome });
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.context.genome?.interactionVersion).toBeUndefined();
  });

  it('rejects v2 pools that are duplicated, too small, or contain retired v1 ids', () => {
    const raw = serializeRunStartContext(v2Context());
    for (const genePool of [
      ['live_wire'],
      ['live_wire', 'live_wire'],
      ['magnet_pulse', 'live_wire'],
    ]) {
      const parsed = parseRunStartContext({
        ...raw,
        genome: { ...(raw.genome as object), genePool },
      });
      expect(parsed).toMatchObject({ ok: false, malformed: true });
    }
  });

  it('rejects v2 ladder shifts outside the frozen one-point condition envelope', () => {
    const raw = serializeRunStartContext(v2Context());
    for (const delta of [-2, 2]) {
      const parsed = parseRunStartContext({
        ...raw,
        genome: {
          ...(raw.genome as object),
          strainThresholdDelta: { AURUM: delta },
        },
      });
      expect(parsed).toMatchObject({ ok: false, malformed: true });
    }
  });

  it('rejects a mutated or gate-inconsistent FTUE presentation', () => {
    const raw = serializeRunStartContext(v2Context());
    const genome = raw.genome as Record<string, unknown>;
    const presentation = genome.ftuePresentation as Record<string, unknown>;
    const capabilities = presentation.capabilities as Record<string, unknown>;

    const changedProgress = parseRunStartContext({
      ...raw,
      genome: {
        ...genome,
        ftuePresentation: {
          ...presentation,
          capabilities: {
            ...capabilities,
            continue: {
              ...(capabilities.continue as object),
              unlocked: false,
            },
          },
        },
      },
    });
    expect(changedProgress).toMatchObject({ ok: false, malformed: true });

    const mismatchedSpliceGate = parseRunStartContext({
      ...raw,
      genome: { ...genome, splicesUnlocked: false },
    });
    expect(mismatchedSpliceGate).toMatchObject({ ok: false, malformed: true });
  });

  it('rejects a forged Ascendance multiplier or unsupported curve', () => {
    const raw = serializeRunStartContext(v2Context());
    for (const ascendance of [
      { curveVersion: 2, multiplierBps: 99_999 },
      { curveVersion: 3, multiplierBps: 10_000 },
      { curveVersion: 2, multiplierBps: 10_000.5 },
    ]) {
      const parsed = parseRunStartContext({
        ...raw,
        snake: { ...(raw.snake as object), ascendance },
      });
      expect(parsed).toMatchObject({ ok: false, malformed: true });
    }
  });
});

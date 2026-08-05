import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseReplayTrace,
  stageRunTerminalIntent,
  validateRunCheckpoint,
} from './runContinuity';
import {
  SNAKE_RULES_VERSION,
  SnakeGameLogic,
  type Direction,
  type Position,
  type SnakeCheckpointV1,
  type SnakeReplayAction,
} from '@/lib/game/SnakeGameLogic';
import { sanitizeGenomeCapability } from '@/lib/game/genomeCapability';
import { genomeV2ActivePool } from '@/shared/game/genes';
import {
  GENOME_V2_INTERACTION_PHYSICAL_RELIC,
  GENOME_RULES_V2,
  deriveGenomeV2FtuePresentation,
  genomeV2YieldFloor,
} from '@/shared/game/genomeV2';
import { RULESETS } from '@/shared/game/rulesets';

const START_ID = '7a604a42-9f57-4f50-9a36-a7c7e85dbb28';

function v2Genome(
  runSeed: string,
  dynasty: keyof typeof RULESETS = 'PRIMAL',
  interactionVersion?: typeof GENOME_V2_INTERACTION_PHYSICAL_RELIC
) {
  const genome = sanitizeGenomeCapability({
    rulesVersion: GENOME_RULES_V2,
    ...(interactionVersion ? { interactionVersion } : {}),
    runSeed,
    v2GenePool: genomeV2ActivePool(dynasty),
    heirloom: {},
    ftuePresentation: deriveGenomeV2FtuePresentation(10, 3),
    offerTiltStrain: null,
    suppressedStrains: [],
    strainThresholdDelta: {},
  });
  if (!genome || genome.rulesVersion !== GENOME_RULES_V2) {
    throw new Error('Genome v2 fixture did not sanitize.');
  }
  return genome;
}

function v2Manifest(
  sessionId: string,
  simulationSeed: string,
  genome: ReturnType<typeof v2Genome>,
  dynasty: keyof typeof RULESETS = 'PRIMAL'
) {
  return {
    sessionId,
    simulation: {
      seed: simulationSeed,
      version: 1,
      rulesVersion: SNAKE_RULES_VERSION,
    },
    runSnake: { dynasty },
    genome,
  };
}

function clientWithRowAndRpc(
  row: Record<string, unknown>,
  rpc: jest.Mock
): SupabaseClient {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return { from: jest.fn(() => query), rpc } as unknown as SupabaseClient;
}

const DIRECTIONS: Array<{
  direction: Direction;
  dx: number;
  dz: number;
}> = [
  { direction: 'UP', dx: 0, dz: -1 },
  { direction: 'RIGHT', dx: 1, dz: 0 },
  { direction: 'DOWN', dx: 0, dz: 1 },
  { direction: 'LEFT', dx: -1, dz: 0 },
];

function cellKey(cell: Pick<Position, 'x' | 'z'>): string {
  return `${cell.x}:${cell.z}`;
}

/** Follow a real legal route; every turn remains part of the replay proof. */
function moveToward(game: SnakeGameLogic, target: Position): void {
  const state = game.getState();
  const gridSize = game.exportCheckpoint().config.gridSize;
  const start = state.snake[0];
  const blocked = new Set(
    state.snake.map(cellKey)
  );
  for (const terrain of state.terrain) {
    if (terrain.solid) blocked.add(cellKey(terrain));
  }
  for (const fact of state.genomeV2?.permanentTerrain ?? []) {
    for (const cell of fact.cells) blocked.add(cellKey(cell));
  }
  blocked.delete(cellKey(start));
  blocked.delete(cellKey(target));

  const queue: Position[] = [start];
  const prior = new Map<string, { key: string; direction: Direction }>();
  const seen = new Set([cellKey(start)]);
  while (queue.length > 0 && !seen.has(cellKey(target))) {
    const current = queue.shift()!;
    for (const step of DIRECTIONS) {
      const next = {
        x: current.x + step.dx,
        y: 0,
        z: current.z + step.dz,
      };
      const key = cellKey(next);
      if (
        next.x < 0 ||
        next.z < 0 ||
        next.x >= gridSize ||
        next.z >= gridSize ||
        blocked.has(key) ||
        seen.has(key)
      ) continue;
      seen.add(key);
      prior.set(key, { key: cellKey(current), direction: step.direction });
      queue.push(next);
    }
  }
  if (!seen.has(cellKey(target))) {
    throw new Error('Fixture could not find a legal route to its target.');
  }
  let cursor = cellKey(target);
  let first: Direction | null = null;
  while (cursor !== cellKey(start)) {
    const edge = prior.get(cursor);
    if (!edge) throw new Error('Fixture route is incomplete.');
    first = edge.direction;
    cursor = edge.key;
  }
  if (!first) throw new Error('Fixture target already occupies the head.');
  if (first !== state.direction) {
    expect(game.setDirection(first)).toBe('accepted');
  }
  game.tick();
}

function expectGenomeV2CheckpointInvariants(
  checkpoint: SnakeCheckpointV1
): void {
  const reducer = checkpoint.state.genomeV2;
  const runtime = checkpoint.privateState.genomeV2Runtime;
  if (!reducer || !runtime) {
    throw new Error('Fixture checkpoint lost its Genome v2 runtime.');
  }
  expect(reducer.foodCount).toBe(checkpoint.state.foodEaten);
  expect(checkpoint.state.dnaCollected).toBe(
    genomeV2YieldFloor(reducer.ledger.bankableYield)
  );
  const activeTargetIds = Object.values(reducer.targets)
    .filter(
      (target) =>
        target.lifecycle === 'active' || target.lifecycle === 'armed'
    )
    .map((target) => target.targetId)
    .sort();
  expect(
    runtime.targetProgress.map((entry) => entry.targetId).sort()
  ).toEqual(activeTargetIds);
}

describe('Genome v2 continuity replay boundary', () => {
  const validActions: SnakeReplayAction[] = [
    {
      tick: 1,
      kind: 'genome_v2_offer',
      offerId: 'offer:g2:1:deadbeef',
      choice: 'decline',
      pinCandidate: 0,
    },
    {
      tick: 1,
      kind: 'genome_v2_offer',
      offerId: 'offer:g2:1:deadbeef',
      choice: 1,
      slot: 0,
    },
    {
      tick: 1,
      kind: 'genome_v2_portal',
      portalId: 'portal:g2:2:deadbeef',
      choice: 'bank',
    },
    {
      tick: 1,
      kind: 'genome_v2_portal',
      portalId: 'portal:g2:2:deadbeef',
      choice: 'continue',
      activateMirror: false,
    },
    {
      tick: 1,
      kind: 'genome_v2_portal',
      portalId: 'portal:g2:2:deadbeef',
      choice: 'continue',
      activateMirror: true,
    },
    {
      tick: 1,
      kind: 'genome_v2_portal',
      portalId: 'portal:g2:2:deadbeef',
      choice: 'infuse',
      candidate: 0,
      slot: 0,
    },
    {
      tick: 1,
      kind: 'genome_v2_portal',
      portalId: 'portal:g2:2:deadbeef',
      choice: 'recode',
      candidate: 1,
      slot: 5,
    },
    {
      tick: 1,
      kind: 'genome_v2_target',
      targetId: 'target:g2:3:deadbeef',
      choice: 'ordinary',
    },
    {
      tick: 1,
      kind: 'genome_v2_target',
      targetId: 'target:g2:3:deadbeef',
      choice: 'gilded',
    },
    {
      tick: 1,
      kind: 'genome_v2_overclock',
      source: 'volt_apex',
      activationId: 'overclock:g2:4:deadbeef',
    },
    {
      tick: 1,
      kind: 'genome_v2_overclock',
      source: 'zenith_protocol',
      activationId: 'overclock:g2:4:deadbeef',
    },
  ];

  it.each(validActions)('preserves canonical action %#', (action) => {
    expect(parseReplayTrace({ ticks: 1, actions: [action] })).toEqual({
      ticks: 1,
      actions: [action],
    });
  });

  it.each([
    {
      tick: 0,
      kind: 'genome_v2_offer',
      offerId: '',
      choice: 0,
      slot: 0,
    },
    {
      tick: 0,
      kind: 'genome_v2_offer',
      offerId: 'offer-1',
      choice: 2,
      slot: 0,
    },
    {
      tick: 0,
      kind: 'genome_v2_offer',
      offerId: 'offer-1',
      choice: 0,
      slot: 6,
    },
    {
      tick: 0,
      kind: 'genome_v2_offer',
      offerId: 'offer-1',
      choice: 'decline',
      slot: 0,
    },
    {
      tick: 0,
      kind: 'genome_v2_offer',
      offerId: 'offer-1',
      choice: 0,
      slot: 0,
      pinCandidate: 1,
    },
    {
      tick: 0,
      kind: 'genome_v2_portal',
      portalId: 'portal-1',
      choice: 'continue',
    },
    {
      tick: 0,
      kind: 'genome_v2_portal',
      portalId: 'portal-1',
      choice: 'bank',
      candidate: 0,
    },
    {
      tick: 0,
      kind: 'genome_v2_portal',
      portalId: 'portal-1',
      choice: 'infuse',
      candidate: 0,
    },
    {
      tick: 0,
      kind: 'genome_v2_portal',
      portalId: 'portal-1',
      choice: 'recode',
      candidate: 1,
      slot: -1,
    },
    {
      tick: 0,
      kind: 'genome_v2_target',
      targetId: 'target-1',
      choice: 'future',
    },
    {
      tick: 0,
      kind: 'genome_v2_overclock',
      source: 'automatic',
      activationId: 'overclock-1',
    },
  ])('rejects malformed or branch-incompatible action %#', (action) => {
    expect(() => parseReplayTrace({ ticks: 0, actions: [action] })).toThrow(
      'invalid'
    );
  });

  it('accepts a deterministic Genome v2 opening and rejects reducer drift', () => {
    const now = Date.now();
    const simulationSeed = 'continuity-v2-opening';
    const genome = v2Genome('continuity-v2-run-seed');
    const game = new SnakeGameLogic({
      ruleset: RULESETS.PRIMAL,
      genome,
      simulationSeed,
    });
    game.prepare();
    const opening = game.exportCheckpoint(now);
    const manifest = v2Manifest('v2-opening', simulationSeed, genome);

    expect(
      validateRunCheckpoint(opening, {
        manifest,
        startedAt: new Date(now).toISOString(),
        now,
        opening: true,
      })
    ).toMatchObject({
      state: { genomeV2: { v: GENOME_RULES_V2, foodCount: 0 } },
      privateState: { genomeV2Runtime: { version: 1 } },
    });

    const tampered = JSON.parse(JSON.stringify(opening)) as typeof opening;
    if (!tampered.state.genomeV2) throw new Error('Missing fixture reducer.');
    tampered.state.genomeV2.foodCount = 1;
    expect(() =>
      validateRunCheckpoint(tampered, {
        manifest,
        startedAt: new Date(now).toISOString(),
        now,
        opening: true,
      })
    ).toThrow('seeded opening');
  });

  it('keeps a physical COSMIC Loom valid across offline continuation and successive checkpoints', () => {
    const activatedAt = Date.UTC(2026, 7, 3, 8, 0, 0);
    const resumedAt = activatedAt + 3 * 60 * 60 * 1_000;
    const simulationSeed = 'continuity-physical-cosmic-resume';
    const genome = v2Genome(
      'continuity-physical-cosmic-genome',
      'COSMIC',
      GENOME_V2_INTERACTION_PHYSICAL_RELIC
    );
    const manifest = v2Manifest(
      'physical-cosmic-resume',
      simulationSeed,
      genome,
      'COSMIC'
    );
    const game = new SnakeGameLogic({
      ruleset: RULESETS.COSMIC,
      genome,
      simulationSeed,
    });
    game.prepare();
    const opening = validateRunCheckpoint(game.exportCheckpoint(activatedAt), {
      manifest,
      startedAt: new Date(activatedAt).toISOString(),
      now: activatedAt,
      opening: true,
    });
    game.activatePrepared(activatedAt);

    let steps = 0;
    while (!game.getState().genomeV2?.offer && steps < 1_000) {
      const state = game.getState();
      moveToward(game, state.mutationTile ?? state.foods[0]);
      expect(game.getState().isGameOver).toBe(false);
      steps += 1;
    }
    const liveOffer = game.getState().genomeV2?.offer;
    if (!liveOffer) throw new Error('Physical relic did not open its Loom.');

    const openAt = activatedAt + 60_000;
    const acceptedOpen = validateRunCheckpoint(game.exportCheckpoint(openAt), {
      manifest,
      startedAt: new Date(activatedAt).toISOString(),
      now: openAt,
      previous: opening,
    });
    expect(acceptedOpen).toMatchObject({
      config: {
        ruleset: 'COSMIC',
        genome: {
          interactionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
        },
      },
      state: {
        genomeV2: {
          offer: { offerId: liveOffer.offerId },
        },
      },
    });
    expectGenomeV2CheckpointInvariants(acceptedOpen);

    // Resume reconstructs the latest canonical checkpoint under a rotated
    // lease. The first held write must remain valid after a long wall-clock
    // gap without charging that offline time to the active run.
    const resumed = new SnakeGameLogic({
      ruleset: RULESETS.COSMIC,
      genome,
      simulationSeed,
    });
    resumed.prepare();
    resumed.restoreCheckpoint(acceptedOpen, resumedAt, {
      replacePreparedOpening: true,
    });
    const acceptedHeld = validateRunCheckpoint(
      resumed.exportCheckpoint(resumedAt + 3_000),
      {
        manifest,
        startedAt: new Date(activatedAt).toISOString(),
        now: resumedAt + 3_000,
        previous: acceptedOpen,
      }
    );
    expect(acceptedHeld.privateState.elapsedMs).toBe(
      acceptedOpen.privateState.elapsedMs + 3_000
    );
    expect(acceptedHeld.state.genomeV2?.offer?.offerId).toBe(liveOffer.offerId);
    expectGenomeV2CheckpointInvariants(acceptedHeld);

    expect(resumed.resolveGenomeV2Offer({
      action: 'choose',
      offerId: liveOffer.offerId,
      candidateIndex: 0,
    })).toBe(true);
    expect(resumed.pause('decision')).toBe(true);
    const acceptedChoice = validateRunCheckpoint(
      resumed.exportCheckpoint(resumedAt + 4_000),
      {
        manifest,
        startedAt: new Date(activatedAt).toISOString(),
        now: resumedAt + 4_000,
        previous: acceptedHeld,
      }
    );
    expect(acceptedChoice.state).toMatchObject({
      isPaused: true,
      genomeV2: { offer: null },
    });
    expectGenomeV2CheckpointInvariants(acceptedChoice);

    expect(
      resumed.resumeWithDirection(resumed.getState().direction)
    ).toBe('duplicate');
    const acceptedResumed = validateRunCheckpoint(
      resumed.exportCheckpoint(resumedAt + 5_000),
      {
        manifest,
        startedAt: new Date(activatedAt).toISOString(),
        now: resumedAt + 5_000,
        previous: acceptedChoice,
      }
    );
    expect(acceptedResumed.state).toMatchObject({
      isPaused: false,
      genomeV2: { offer: null },
    });
    expectGenomeV2CheckpointInvariants(acceptedResumed);

    // Checkpoint every legal post-resume move, including the first food eat.
    // This is deliberately stricter than the three-second client cadence: a
    // bad cursor, target-progress snapshot, reducer food count, or Yield fold
    // is isolated to the exact tick on which it diverges.
    const foodBeforeRoute = acceptedResumed.state.foodEaten;
    const targetOrdinalBeforeRoute =
      acceptedResumed.privateState.genomeV2Runtime!.targetOrdinal;
    let acceptedAfterMove = acceptedResumed;
    let checkpointAt = resumedAt + 5_000;
    let postResumeMoves = 0;
    while (
      resumed.getState().foodEaten === foodBeforeRoute &&
      postResumeMoves < 200
    ) {
      moveToward(resumed, resumed.getState().foods[0]);
      expect(resumed.getState().isGameOver).toBe(false);
      checkpointAt += 3_000;
      acceptedAfterMove = validateRunCheckpoint(
        resumed.exportCheckpoint(checkpointAt),
        {
          manifest,
          startedAt: new Date(activatedAt).toISOString(),
          now: checkpointAt,
          previous: acceptedAfterMove,
        }
      );
      expectGenomeV2CheckpointInvariants(acceptedAfterMove);
      postResumeMoves += 1;
    }
    expect(postResumeMoves).toBeGreaterThan(0);
    expect(acceptedAfterMove.state.foodEaten).toBe(foodBeforeRoute + 1);
    expect(acceptedAfterMove.state.genomeV2?.offer).toBeNull();
    // WEAKENED DELIBERATELY, 2026-08-05, and why. This read `toBeGreaterThan`,
    // which was never a statement about the food boundary: on COSMIC a wave is
    // a five-star constellation, so collecting ONE star spawns nothing and
    // draws nothing. It passed because the old 6 +/- 2 relic cadence happened
    // to land an offer inside this window and the 8 +/- 2 cadence does not.
    // The property the case actually proves - that the newly folded RNG state
    // is a usable replay base rather than a proposal that validates once - is
    // proved by `acceptedSuccessor` below, which is validated AGAINST this
    // checkpoint and would reject a stream that had drifted. What stays here is
    // the monotonicity: a counter that went backwards would be a replayed
    // stream rewinding.
    expect(acceptedAfterMove.rng.draws).toBeGreaterThanOrEqual(
      acceptedResumed.rng.draws
    );
    // Same fact, same weakening, same reason: the ordinal counts REGISTERED
    // targets, and collecting one star of a five-star constellation registers
    // none. The reducer's own food count is the assertion that still bites,
    // and it is made above.
    expect(
      acceptedAfterMove.privateState.genomeV2Runtime?.targetOrdinal
    ).toBeGreaterThanOrEqual(targetOrdinalBeforeRoute);
    expect(
      acceptedAfterMove.privateState.genomeV2Runtime
        ?.nextCadenceOfferAtFood
    ).toBeGreaterThan(acceptedAfterMove.state.foodEaten);

    // Accept one more checkpoint after the food boundary as well. This proves
    // that the newly folded target/ledger/RNG state is a usable replay base,
    // rather than merely a proposal that validates once and poisons its
    // successor.
    moveToward(resumed, resumed.getState().foods[0]);
    checkpointAt += 3_000;
    const acceptedSuccessor = validateRunCheckpoint(
      resumed.exportCheckpoint(checkpointAt),
      {
        manifest,
        startedAt: new Date(activatedAt).toISOString(),
        now: checkpointAt,
        previous: acceptedAfterMove,
      }
    );
    expectGenomeV2CheckpointInvariants(acceptedSuccessor);
    expect(acceptedSuccessor.privateState.replay).toMatchObject({
      ticks: acceptedAfterMove.privateState.replay.ticks + 1,
      actions: expect.arrayContaining([
        expect.objectContaining({
          kind: 'genome_v2_offer',
          offerId: liveOffer.offerId,
          choice: 0,
        }),
        expect.objectContaining({ kind: 'pause', hold: 'decision' }),
        expect.objectContaining({ kind: 'resume' }),
      ]),
    });
  });

  it('replays resolved v2 Loom and portal decisions into one canonical checkpoint', () => {
    const now = Date.now();
    const startedAt = now - 120_000;
    const simulationSeed = 'continuity-v2-decisions';
    const genome = v2Genome('continuity-v2-decision-run');
    const game = new SnakeGameLogic({
      ruleset: RULESETS.PRIMAL,
      genome,
      simulationSeed,
    });
    game.prepare();
    const opening = game.exportCheckpoint(startedAt);
    game.activatePrepared(startedAt);

    let declinedOffer = false;
    let continuedPortal = false;
    for (
      let step = 0;
      step < 500 && (!declinedOffer || !continuedPortal);
      step += 1
    ) {
      const reducer = game.getState().genomeV2;
      if (reducer?.offer) {
        expect(
          game.resolveGenomeV2Offer({
            action: 'decline',
            offerId: reducer.offer.offerId,
          })
        ).toBe(true);
        declinedOffer = true;
        continue;
      }
      if (reducer?.portal && game.getState().pendingPortalChoice) {
        expect(
          game.resolveGenomeV2Portal({
            action: 'continue',
            portalId: reducer.portal.portalId,
            activateMirror: false,
          })
        ).toBe(true);
        continuedPortal = true;
        continue;
      }
      const state = game.getState();
      moveToward(game, state.exitTile ?? state.foods[0]);
      if (game.getState().isGameOver) {
        throw new Error('Fixture crashed before reaching both decisions.');
      }
    }
    expect({ declinedOffer, continuedPortal }).toEqual({
      declinedOffer: true,
      continuedPortal: true,
    });

    const proposed = game.exportCheckpoint(now);
    expect(
      validateRunCheckpoint(proposed, {
        manifest: v2Manifest('v2-decisions', simulationSeed, genome),
        startedAt: new Date(startedAt).toISOString(),
        now,
        previous: opening,
      })
    ).toMatchObject({
      state: {
        genomeV2: {
          offerCount: expect.any(Number),
          carryPasses: 1,
        },
      },
    });
    expect(proposed.privateState.replay.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'genome_v2_offer', choice: 'decline' }),
        expect.objectContaining({
          kind: 'genome_v2_portal',
          choice: 'continue',
          activateMirror: false,
        }),
      ])
    );
  });

  it('stages the replay-authored Genome v2 record for settlement', async () => {
    const now = Date.now();
    const lease = 'genome-v2-terminal-lease-with-enough-entropy';
    const simulationSeed = 'continuity-v2-terminal';
    const genome = v2Genome('continuity-v2-terminal-run');
    const game = new SnakeGameLogic({
      gridSize: 4,
      ruleset: RULESETS.PRIMAL,
      genome,
      simulationSeed,
    });
    game.prepare();
    const opening = game.exportCheckpoint(now - 1_000);
    game.activatePrepared(now - 1_000);
    for (let index = 0; index < 10 && !game.getState().isGameOver; index += 1) {
      game.tick();
    }
    expect(game.getState().isGameOver).toBe(true);
    const trace = game.getReplayTrace();
    const rpc = jest.fn().mockResolvedValue({
      data: { accepted: true, inserted: true },
      error: null,
    });
    const intent = await stageRunTerminalIntent(
      clientWithRowAndRpc(
        {
          id: 'v2-terminal',
          start_request_id: START_ID,
          start_manifest: v2Manifest(
            'v2-terminal',
            simulationSeed,
            genome
          ),
          continuity_phase: 'active',
          continuity_activated_at: new Date(now - 1_000).toISOString(),
          continuity_checkpoint: opening,
          continuity_checkpoint_revision: 1,
          continuity_lease_hash: createHash('sha256')
            .update(lease)
            .digest('hex'),
          simulation_rules_version: SNAKE_RULES_VERSION,
          started_at: new Date(now - 2_000).toISOString(),
          ended_at: null,
          end_reason: null,
        },
        rpc
      ),
      {
        playerId: 'player-1',
        sessionId: 'v2-terminal',
        expectedRevision: 1,
        leaseToken: lease,
        replay: {
          fromTick: 0,
          toTick: trace.ticks,
          actionOffset: 0,
          actions: trace.actions,
          activeElapsedMs: 1_000,
        },
        now,
      }
    );

    expect(intent.facts.genome).toMatchObject({
      v: GENOME_RULES_V2,
      settlement: null,
    });
    expect(intent.facts.mutations).toEqual([]);
  });
});

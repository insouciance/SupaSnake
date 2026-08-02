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
  type SnakeReplayAction,
} from '@/lib/game/SnakeGameLogic';
import { sanitizeGenomeCapability } from '@/lib/game/genomeCapability';
import { genomeV2ActivePool } from '@/shared/game/genes';
import {
  GENOME_RULES_V2,
  deriveGenomeV2FtuePresentation,
} from '@/shared/game/genomeV2';
import { RULESETS } from '@/shared/game/rulesets';

const START_ID = '7a604a42-9f57-4f50-9a36-a7c7e85dbb28';

function v2Genome(runSeed: string) {
  const genome = sanitizeGenomeCapability({
    rulesVersion: GENOME_RULES_V2,
    runSeed,
    v2GenePool: genomeV2ActivePool('PRIMAL'),
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
  genome: ReturnType<typeof v2Genome>
) {
  return {
    sessionId,
    simulation: {
      seed: simulationSeed,
      version: 1,
      rulesVersion: SNAKE_RULES_VERSION,
    },
    runSnake: { dynasty: 'PRIMAL' },
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
    state.snake.slice(0, -1).map(cellKey)
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

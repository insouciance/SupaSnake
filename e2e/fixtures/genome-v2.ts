import type { Page } from '@playwright/test';
import {
  SNAKE_RULES_VERSION,
  SnakeGameLogic,
  type GenomeEngineConfig,
  type SnakeCheckpointV1,
} from '../../src/lib/game/SnakeGameLogic';
import { genomeV2ActivePool } from '../../src/shared/game/genes';
import {
  GENOME_V2_INTERACTION_PHYSICAL_RELIC,
  GENOME_RULES_V2,
  createGenomeV2State,
  deriveGenomeV2Ftue,
  deriveGenomeV2FtuePresentation,
  genomeV2EventId,
  reduceGenomeV2Event,
  type GenomeV2Event,
  type GenomeV2State,
} from '../../src/shared/game/genomeV2';
import { RULESETS } from '../../src/shared/game/rulesets';

type GenomeEventFacts = GenomeV2Event extends infer Event
  ? Event extends GenomeV2Event
    ? Omit<Event, 'index' | 'tick' | 'eventId'>
    : never
  : never;

function applyGenomeEvent(
  state: GenomeV2State,
  facts: GenomeEventFacts
): GenomeV2State {
  const index = state.eventIndex + 1;
  return reduceGenomeV2Event(state, {
    ...facts,
    index,
    tick: state.tick + 1,
    eventId: genomeV2EventId(state.runSeed, index),
  } as GenomeV2Event);
}

const ENERGY = {
  state: 'charged' as const,
  available: 4,
  capacity: 6,
  recoveryIntervalSeconds: 3_600,
  recoveryStartedAt: '2026-08-02T07:00:00.000Z',
  nextRecoveryAt: '2026-08-02T08:00:00.000Z',
  recoveryProgress: 0.5,
  serverNow: '2026-08-02T07:30:00.000Z',
  remaining: 4,
  perDay: 6,
  usedToday: 2,
  day: '2026-08-02',
  refillsAt: '2026-08-02T08:00:00.000Z',
  visible: true,
  committed: 2,
  commitmentMultiplierBps: 22_000,
};

// This seed makes the first physical-relic offer after the authored Mirror
// Wager prehistory resolve to Phoenix / Loan Shark. The candidate pair is
// still rolled by the production runtime only after the relic is collected.
const RUN_SEED = 'physical-e2e-2';
const SIMULATION_SEED = 'playwright-genome-v2-board';
const SESSION_ID = 'playwright-genome-v2-session';

/**
 * Build one legal reducer prehistory with a meaningful reaction map:
 *
 * - Mirror Wager is already held;
 * - collecting the next physical relic rolls Phoenix, which forms Styx
 *   Contract immediately;
 * - the same Phoenix candidate visibly closes the competing Ashen Stake path.
 *
 * The browser still mounts the production SnakeGameLogic, restores its real
 * reducer/runtime snapshot, and commits the choice through the normal bridge.
 * Only the prehistory is authored so the journey never depends on random food
 * placement or a lucky offer roll.
 */
function tacticalRelicReducer(): GenomeV2State {
  const pool = [...genomeV2ActivePool('PRIMAL')];
  let state = createGenomeV2State('PRIMAL', {
    runSeed: RUN_SEED,
    genePool: pool,
    ftue: deriveGenomeV2Ftue(10, 3),
    startingStrainPoints: { UMBRA: 1, FERAL: 1 },
    offerTiltStrain: null,
    suppressedStrains: [],
    strainThresholdDelta: {},
  });
  state = applyGenomeEvent(state, {
    type: 'offer_opened',
    offerId: 'fixture-offer-mirror',
    source: 'cadence',
    candidates: ['mirror_wager', 'gold_trail'],
  });
  state = applyGenomeEvent(state, {
    type: 'gene_acquired',
    offerId: 'fixture-offer-mirror',
    instanceId: 'fixture-instance-mirror',
    geneId: 'mirror_wager',
    slot: 0,
    source: 'offer',
  });
  return state;
}

export interface GenomeV2BrowserFixture {
  checkpoint: SnakeCheckpointV1;
  checkpointWrites: SnakeCheckpointV1[];
  exposeInterruptedRun(): void;
}

/** Install deterministic account/run fixtures while retaining real guest auth. */
export async function installGenomeV2BrowserFixture(
  page: Page
): Promise<GenomeV2BrowserFixture> {
  const genePool = [...genomeV2ActivePool('PRIMAL')];
  const ftuePresentation = deriveGenomeV2FtuePresentation(10, 3);
  const publicGenome = {
    rulesVersion: GENOME_RULES_V2,
    interactionVersion: GENOME_V2_INTERACTION_PHYSICAL_RELIC,
    runSeed: RUN_SEED,
    v2GenePool: genePool,
    heirloom: { UMBRA: 1, FERAL: 1 },
    ftuePresentation,
    offerTiltStrain: null,
    suppressedStrains: [],
    strainThresholdDelta: {},
  } satisfies GenomeEngineConfig;
  const game = new SnakeGameLogic({
    gridSize: 40,
    ruleset: RULESETS.PRIMAL,
    simulationSeed: SIMULATION_SEED,
    genome: {
      ...publicGenome,
      reducerState: tacticalRelicReducer(),
    },
  });
  game.setGrowthProfile('dynasty');
  game.startDriven({
    snake: [
      { x: 5, y: 0, z: 5 },
      { x: 4, y: 0, z: 5 },
      { x: 3, y: 0, z: 5 },
    ],
    direction: 'RIGHT',
    foods: [{ x: 6, y: 0, z: 5 }],
  });
  const relicDueAt = game.getState().nextMutationAtFood;
  if (relicDueAt < 4 || relicDueAt > 8) {
    throw new Error(`Genome v2 browser fixture rolled invalid relic cadence ${relicDueAt}.`);
  }
  for (let eaten = 0; eaten < relicDueAt; eaten += 1) {
    const head = game.getState().snake[0];
    game.placeFood({ x: head.x + 1, y: 0, z: head.z });
    game.tick();
  }
  const head = game.getState().snake[0];
  game.placeMutation({ x: head.x + 1, y: 0, z: head.z }, 40);
  const checkpoint = game.exportCheckpoint(Date.now());
  if (checkpoint.state.genomeV2?.offer || !checkpoint.state.mutationTile) {
    throw new Error('Genome v2 browser fixture did not preserve its uncollected relic.');
  }
  // A real manifest never repeats mutable reducer state inside its immutable
  // capability block. Restoration gets that state from checkpoint.state and
  // verifies it against the runtime snapshot, exactly like production.
  if (checkpoint.config.genome) {
    delete checkpoint.config.genome.reducerState;
  }

  const manifest = {
    sessionId: SESSION_ID,
    simulation: {
      seed: SIMULATION_SEED,
      version: 1 as const,
      rulesVersion: SNAKE_RULES_VERSION,
    },
    runSnake: {
      id: 'playwright-genome-v2-snake',
      name: 'Tactical Coil',
      generation: 8,
      dynasty: 'PRIMAL',
      traits: [],
      lineage: null,
    },
    energy: ENERGY,
    freePlay: false,
    traits: [],
    mutationPool: [],
    growthProfile: 'dynasty',
    ladder: { rung: 0 },
    mastery: { dynasty: 'PRIMAL', xp: 1_200, level: 3 },
    genome: publicGenome,
  };

  let exposed = false;
  let revision = 2;
  let latestCheckpoint = checkpoint;
  const checkpointWrites: SnakeCheckpointV1[] = [];
  const activeRun = (leaseToken: string | null) => ({
    sessionId: SESSION_ID,
    phase: 'active',
    startedAt: '2026-08-02T07:25:00.000Z',
    activatedAt: '2026-08-02T07:25:01.000Z',
    energyCommitted: 2,
    canContinue: true,
    requiresAbandon: false,
    manifest,
    checkpoint: latestCheckpoint,
    checkpointRevision: revision,
    checkpointSavedAt: '2026-08-02T07:25:02.000Z',
    leaseToken,
    leaseEpoch: leaseToken ? 2 : 1,
    startIntent: null,
  });

  await page.route('**/api/player', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        player: {
          id: 'playwright-genome-v2-player',
          total_games_played: 40,
          high_score: 18_000,
        },
        energy: ENERGY,
        charge: ENERGY,
        ladder: { available: true, attemptable: 3 },
        needsStarterSelection: false,
        hasCompletedFirstRun: true,
        aimSystem: 'deadeye',
      },
    });
  });

  await page.route('**/api/collection', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        dnaBalance: 4_200,
        snakes: [{
          id: 'playwright-genome-v2-snake',
          playerId: 'playwright-genome-v2-player',
          isEquipped: true,
          isFavorited: true,
          generation: 8,
          variantName: 'Tactical Coil',
          variantId: 'primal',
          snakeVariantId: 'playwright-primal-variant',
          dynastyName: 'PRIMAL',
          traits: [],
          lineage: null,
          acquiredAt: '2026-07-01T12:00:00.000Z',
          acquiredMethod: 'tutorial',
        }],
      },
    });
  });

  await page.route('**/api/game/session', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { activeRun: exposed ? activeRun(null) : null },
      });
    }
    const body = request.postDataJSON() as {
      action?: string;
      sessionId?: string;
      checkpoint?: SnakeCheckpointV1;
      expectedRevision?: number;
    } | null;
    if (body?.action === 'resume') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          activeRun: activeRun('playwright-genome-v2-exclusive-lease-token'),
        },
      });
    }
    if (body?.action === 'checkpoint' && body.checkpoint) {
      latestCheckpoint = body.checkpoint;
      checkpointWrites.push(body.checkpoint);
      revision = Math.max(revision + 1, Number(body.expectedRevision ?? 0) + 1);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          checkpoint: {
            revision,
            savedAt: '2026-08-02T07:25:03.000Z',
          },
        },
      });
    }
    return route.fulfill({
      status: 409,
      contentType: 'application/json',
      json: { error: `Unexpected Genome v2 fixture action: ${body?.action ?? 'none'}` },
    });
  });

  return {
    checkpoint,
    checkpointWrites,
    exposeInterruptedRun() {
      exposed = true;
    },
  };
}

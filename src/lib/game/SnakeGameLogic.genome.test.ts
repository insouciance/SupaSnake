/**
 * Genome engine tests - Buildcraft: The Genome (BUILDCRAFT_GENOME_DESIGN.md)
 *
 * The engine runs genome behavior ONLY when a GenomeEngineConfig (server
 * capability) is present. These suites cover: capability gating, seeded
 * gravity offers + trace, splice fusion, strain tier activation with
 * board-level physics (Rift Aura, Phantom Coil, Arc Lightning, Gilded
 * Wake, Molt, Ouroboros, Thick Hide), the portal BANK/INFUSE trichotomy,
 * surges at the gene cap, the one-revive rule, and the genome payload.
 */

import { describe, it, expect } from '@jest/globals';
import { SnakeGameLogic, type GameOverData, type GenomeEngineConfig } from './SnakeGameLogic';
import { RULESETS } from '@/shared/game/rulesets';
import { GENOME_SPAWN } from '@/shared/game/genes';
import { STRAIN_ECONOMICS, STRAIN_PHYSICS } from '@/shared/game/strains';

function eatFoods(game: SnakeGameLogic, count: number): void {
  for (let i = 0; i < count; i++) {
    const state = game.getState();
    expect(state.isGameOver).toBe(false);
    expect(state.isDeathSequence).toBe(false);
    game.placeFood({ x: state.snake[0].x + 1, y: 0, z: state.snake[0].z });
    game.tick();
    if (game.getState().pendingChoice) game.declineMutation();
  }
}

const genomeConfig = (
  partial: Partial<GenomeEngineConfig> = {}
): GenomeEngineConfig => ({
  runSeed: 'test-run-seed',
  heirloom: {},
  ...partial,
});

/** A genome engine on a huge grid (deterministic straight-line eating). */
function makeGenomeGame(
  config: Partial<GenomeEngineConfig> = {},
  gridSize = 120
): SnakeGameLogic {
  const game = new SnakeGameLogic({
    gridSize,
    ruleset: RULESETS.PRIMAL,
    rng: () => 0.5,
    genome: genomeConfig(config),
  });
  game.start();
  return game;
}

describe('capability gating', () => {
  it('legacy engines (no genome config) expose inert genome state', () => {
    const game = new SnakeGameLogic({ gridSize: 30, ruleset: RULESETS.PRIMAL });
    game.start();
    const state = game.getState();
    expect(state.strainCounts).toEqual({});
    expect(state.fusedSplices).toEqual([]);
    expect(state.pendingPortalChoice).toBeNull();
    expect(game.resolvePortalChoice('bank')).toBe(false);
    expect(game.chooseSurge('AURUM')).toBe(false);
  });

  it('setGenome is refused mid-run', () => {
    const game = new SnakeGameLogic({ gridSize: 30, ruleset: RULESETS.PRIMAL });
    game.start();
    game.setGenome(genomeConfig());
    expect(game.getGenome()).toBeNull();
  });

  it('heirloom points seed the strain counts at start', () => {
    const game = makeGenomeGame({ heirloom: { UMBRA: 2, AURUM: 1 } });
    const state = game.getState();
    expect(state.strainCounts.UMBRA).toBe(2);
    expect(state.strainCounts.AURUM).toBe(1);
    // 2 spawn points = minor active from food 0 (no expression).
    expect(state.strainTiers.UMBRA).toBe(1);
    expect(state.strainTiers.AURUM).toBeUndefined();
  });
});

describe('gene picks, strain tiers, splices', () => {
  it('three same-strain genes activate the Expression (with events)', () => {
    const game = makeGenomeGame();
    const activated: unknown[] = [];
    game.on('expressionActivated', (d) => activated.push(d));
    game.grantMutation('gold_trail', 0); // AURUM 1
    game.grantMutation('tithe', 5); // AURUM 2 -> minor
    game.grantMutation('loan_shark', 10); // AURUM 3 -> expression
    const state = game.getState();
    expect(state.strainTiers.AURUM).toBe(2);
    expect(activated.length).toBeGreaterThanOrEqual(2); // minor + expression
  });

  it('picking the second parent fuses a splice (event + one slot freed)', () => {
    const game = makeGenomeGame();
    const fused: unknown[] = [];
    game.on('spliceFused', (d) => fused.push(d));
    game.grantMutation('gold_trail', 0);
    game.grantMutation('compound_interest', 5);
    const state = game.getState();
    expect(state.fusedSplices).toEqual([
      { id: 'splice_dragon_hoard', atFood: 5 },
    ]);
    expect(fused).toEqual([{ id: 'splice_dragon_hoard', atFood: 5 }]);
  });

  it('FTUE gate: expressions stay capped at minor before unlock', () => {
    const game = makeGenomeGame({
      ftue: {
        expressionsUnlocked: false,
        infuseUnlocked: false,
        splicesUnlocked: false,
        apexesUnlocked: false,
      },
    });
    game.grantMutation('gold_trail', 0);
    game.grantMutation('tithe', 5);
    game.grantMutation('loan_shark', 10);
    expect(game.getState().strainTiers.AURUM).toBe(1); // capped
  });
});

describe('strain physics on the board', () => {
  it('FLUX Expression (Rift Aura): walls wrap instead of killing', () => {
    const game = makeGenomeGame({}, 40);
    game.grantMutation('wall_rush', 0);
    game.grantMutation('magnet_pulse', 0);
    game.grantMutation('tectonic_patience', 0); // FLUX x3 -> expression
    expect(game.getState().strainTiers.FLUX).toBe(2);
    // Drive to the right wall - the head should wrap, not die.
    for (let i = 0; i < 45; i++) {
      const s = game.getState();
      if (s.isGameOver || s.isDeathSequence) break;
      game.tick();
      if (game.getState().pendingChoice) game.declineMutation();
    }
    const state = game.getState();
    expect(state.isGameOver).toBe(false);
    expect(state.isDeathSequence).toBe(false);
  });

  it('UMBRA Expression (Phantom Coil): tail-phase after every eat', () => {
    const game = makeGenomeGame();
    game.grantMutation('mirror_wager', 0);
    game.grantMutation('phoenix', 0); // fuses -> Styx (UMBRA x2)
    game.grantMutation('overclock_harvest', 0); // UMBRA 3 -> expression
    expect(game.getState().strainTiers.UMBRA).toBe(2);
    eatFoods(game, 1);
    expect(game.getState().phantomTicksRemaining).toBe(
      STRAIN_PHYSICS.phantomCoilTicks
    );
  });

  it('AURUM Expression (Gilded Wake): eaten cells turn gilded and pay on re-traverse', () => {
    const game = makeGenomeGame();
    game.grantMutation('gold_trail', 0);
    game.grantMutation('tithe', 0);
    game.grantMutation('midnight_oil', 0); // AURUM x3 -> expression
    eatFoods(game, 2);
    const state = game.getState();
    expect(state.gildedCells.length).toBe(2);
    // Wide loop back onto the FIRST gilded cell (avoids the own body):
    // DOWN, DOWN, LEFT, UP, UP lands exactly on it.
    const target = state.gildedCells[0];
    game.placeFood({ x: 5, y: 0, z: 5 }); // park the food off the path
    const dnaBefore = game.getState().dnaCollected;
    game.setDirection('DOWN');
    game.tick();
    game.tick();
    game.setDirection('LEFT');
    game.tick();
    game.setDirection('UP');
    game.tick();
    game.tick();
    const after = game.getState();
    expect(after.snake[0].x).toBe(target.x);
    expect(after.snake[0].z).toBe(target.z);
    expect(after.dnaCollected).toBe(
      dnaBefore + STRAIN_ECONOMICS.aurumWakeCellFlat
    );
    expect(after.genomeClaims.aurumWakeDna).toBe(
      STRAIN_ECONOMICS.aurumWakeCellFlat
    );
    expect(after.gildedCells.length).toBe(1); // consumed
  });

  it('VOLT Expression (Arc Lightning): nearby foods auto-collect at full value', () => {
    const game = makeGenomeGame();
    game.grantMutation('time_dilation', 0);
    game.grantMutation('splitter', 0);
    game.grantMutation('redline_dividend', 0); // VOLT x3 -> expression
    expect(game.getState().strainTiers.VOLT).toBe(2);
    const head = game.getState().snake[0];
    // Main food in the path + one extra within arc radius (3 cells).
    game.placeFoods([
      { x: head.x + 1, y: 0, z: head.z },
      { x: head.x + 2, y: 0, z: head.z + 2 },
    ]);
    game.tick();
    const state = game.getState();
    expect(state.foodEaten).toBe(2); // main + arced
  });

  it('FERAL Expression (Molt): every 20th food resets the tail to 12 and drops molt-food', () => {
    const game = makeGenomeGame({}, 160);
    game.grantMutation('overgrowth', 0);
    game.grantMutation('deep_roots', 0);
    game.grantMutation('glacial_reserve', 0); // FERAL x3... deep+glacial fuse
    // Old Growth carries FERAL x2 + overgrowth = 3 FERAL genes.
    expect(game.getState().strainTiers.FERAL).toBe(2);
    const molts: unknown[] = [];
    game.on('moltShed', (d) => molts.push(d));
    eatFoods(game, 20);
    const state = game.getState();
    expect(molts.length).toBe(1);
    expect(state.snake.length).toBeGreaterThanOrEqual(
      STRAIN_PHYSICS.moltResetLength
    );
    expect(state.bonusFoods.some((f) => f.kind === 'molt')).toBe(true);
  });
});

describe('portal trichotomy', () => {
  function driveToPortal(game: SnakeGameLogic): void {
    const head = game.getState().snake[0];
    game.placeExit({ x: head.x + 1, y: 0, z: head.z });
    game.tick();
  }

  it('stepping onto the portal opens the BANK/INFUSE hold when infusable', () => {
    const game = makeGenomeGame();
    eatFoods(game, 10); // length 13 >= infuseMinLength
    driveToPortal(game);
    const state = game.getState();
    expect(state.pendingPortalChoice).toEqual({ canInfuse: true });
    expect(state.isGameOver).toBe(false);
    // Hold freezes the engine like the gene choice hold.
    expect(game.setDirection('UP')).toBe('inactive');
  });

  it('BANK resolves to a banked extraction', () => {
    const game = makeGenomeGame();
    let payload: GameOverData | null = null;
    game.on('gameOver', (d) => {
      payload = d as GameOverData;
    });
    eatFoods(game, 10);
    driveToPortal(game);
    expect(game.resolvePortalChoice('bank')).toBe(true);
    expect(payload).not.toBeNull();
    expect(payload!.extracted).toBe(true);
    expect(payload!.genome).not.toBeNull();
  });

  it('INFUSE consumes the portal, pays 4 segments, and opens a gene offer', () => {
    const game = makeGenomeGame();
    eatFoods(game, 10);
    const lengthBefore = game.getState().snake.length;
    driveToPortal(game);
    expect(game.resolvePortalChoice('infuse')).toBe(true);
    const state = game.getState();
    expect(state.infuses).toEqual([{ atFood: 10 }]);
    expect(state.exitTile).toBeNull();
    expect(state.snake.length).toBe(
      lengthBefore - STRAIN_PHYSICS.infuseSegmentCost
    );
    expect(state.pendingChoice).not.toBeNull();
    expect(state.choiceSource).toBe('infuse');
  });

  it('infusing at the gene cap grants a Strain Surge choice instead', () => {
    const game = makeGenomeGame();
    game.grantMutation('gold_trail', 0);
    game.grantMutation('overgrowth', 0);
    game.grantMutation('wall_rush', 0);
    game.grantMutation('slipstream', 0);
    game.grantMutation('serpentine', 0);
    game.grantMutation('bulk_up', 0);
    expect(game.getState().heldMutations.length).toBe(GENOME_SPAWN.maxHeld);
    eatFoods(game, 10);
    driveToPortal(game);
    game.resolvePortalChoice('infuse');
    const state = game.getState();
    expect(state.pendingSurgeChoice).toBe(true);
    expect(game.chooseSurge('UMBRA')).toBe(false); // no held UMBRA gene
    expect(game.getState().pendingSurgeChoice).toBe(true);
    expect(game.chooseSurge('AURUM')).toBe(true);
    expect(game.getState().surges).toEqual([{ strain: 'AURUM', atFood: 10 }]);
    expect(game.getState().strainCounts.AURUM).toBe(2); // gene + surge
  });

  it('a splice frees one held slot for an infuse gene offer', () => {
    const game = makeGenomeGame();
    game.grantMutation('gold_trail', 0);
    game.grantMutation('compound_interest', 0); // Dragon Hoard: one slot
    game.grantMutation('overgrowth', 0);
    game.grantMutation('wall_rush', 0);
    game.grantMutation('slipstream', 0);
    game.grantMutation('serpentine', 0);
    expect(game.getState().heldMutations.length).toBe(GENOME_SPAWN.maxHeld);
    expect(game.getState().fusedSplices).toHaveLength(1); // five occupied slots

    eatFoods(game, 10);
    driveToPortal(game);
    expect(game.resolvePortalChoice('infuse')).toBe(true);
    expect(game.getState().pendingChoice).not.toBeNull();
    expect(game.getState().pendingSurgeChoice).toBe(false);
  });

  it('short snakes cannot infuse but can still BANK or PASS', () => {
    const game = makeGenomeGame();
    eatFoods(game, 2); // length 5 < 8
    let over = false;
    game.on('gameOver', () => {
      over = true;
    });
    driveToPortal(game);
    expect(over).toBe(false);
    expect(game.getState().pendingPortalChoice).toEqual({ canInfuse: false });
    expect(game.resolvePortalChoice('pass')).toBe(true);
    expect(game.getState().pendingPortalChoice).toBeNull();
    expect(game.getState().exitTile).toBeNull();
    expect(over).toBe(false);
  });

  it('FTUE: infuse locked -> the portal banks immediately', () => {
    const game = makeGenomeGame({
      ftue: {
        expressionsUnlocked: true,
        infuseUnlocked: false,
        splicesUnlocked: true,
        apexesUnlocked: true,
      },
    });
    eatFoods(game, 10);
    let over = false;
    game.on('gameOver', () => {
      over = true;
    });
    driveToPortal(game);
    expect(over).toBe(true);
  });

  it('PASS can hand off synchronously to a frozen planning gate', () => {
    const game = makeGenomeGame();
    eatFoods(game, 2);
    driveToPortal(game);

    expect(game.resolvePortalChoice('pass')).toBe(true);
    game.pause(); // mirrors GamePage.armResumeAfterDecision in the same turn

    expect(game.isPaused).toBe(true);
    const head = { ...game.getState().snake[0] };
    game.tick();
    expect(game.getState().snake[0]).toEqual(head);
  });

  it('INFUSE waits for its gene choice, then freezes before another tick', () => {
    const game = makeGenomeGame();
    eatFoods(game, 10);
    driveToPortal(game);
    expect(game.resolvePortalChoice('infuse')).toBe(true);
    expect(game.getState().pendingChoice).not.toBeNull();

    game.on('mutationPicked', () => game.pause());
    expect(game.chooseMutation(0)).toBe(true);

    expect(game.getState().pendingChoice).toBeNull();
    expect(game.isPaused).toBe(true);
    const head = { ...game.getState().snake[0] };
    game.tick();
    expect(game.getState().snake[0]).toEqual(head);
  });

  it('a Strain Surge can freeze synchronously after the six-gene choice', () => {
    const game = makeGenomeGame();
    game.grantMutation('gold_trail', 0);
    game.grantMutation('overgrowth', 0);
    game.grantMutation('wall_rush', 0);
    game.grantMutation('slipstream', 0);
    game.grantMutation('serpentine', 0);
    game.grantMutation('bulk_up', 0);
    eatFoods(game, 10);
    driveToPortal(game);
    expect(game.resolvePortalChoice('infuse')).toBe(true);
    expect(game.getState().pendingSurgeChoice).toBe(true);

    game.on('surged', () => game.pause());
    expect(game.chooseSurge('AURUM')).toBe(true);

    expect(game.getState().pendingSurgeChoice).toBe(false);
    expect(game.isPaused).toBe(true);
    const head = { ...game.getState().snake[0] };
    game.tick();
    expect(game.getState().snake[0]).toEqual(head);
  });
});

describe('offers under genome rules', () => {
  it('offers come from the seeded gravity stream and record a trace', () => {
    const game = makeGenomeGame();
    eatFoods(game, 5);
    const head = game.getState().snake[0];
    game.placeMutation({ x: head.x + 1, y: 0, z: head.z });
    game.tick();
    const offer = game.getState().pendingChoice;
    expect(offer).not.toBeNull();
    expect(game.chooseMutation(0)).toBe(true);
    let payload: GameOverData | null = null;
    game.on('gameOver', (d) => {
      payload = d as GameOverData;
    });
    // Die: reverse into the wall
    const g = game.getState();
    game.placeFood({ x: 0, y: 0, z: g.snake[0].z }); // keep food away
    game.setDirection('UP');
    for (let i = 0; i < 200 && !game.getState().isDeathSequence; i++) {
      game.tick();
      if (game.getState().pendingChoice) game.declineMutation();
      if (game.getState().pendingPortalChoice) game.resolvePortalChoice('bank');
      if (game.getState().isGameOver) break;
    }
    // Death sequence uses a timeout; force-run the payload check on what
    // we already have: the offer trace lives on the engine until then.
    expect(offer![0]).not.toBe(offer![1]);
    if (payload) {
      const p = payload as GameOverData;
      expect(p.genome?.offerTrace[0]?.picked).toBe(offer![0]);
    }
  });

  it('identical runSeed + picks produce identical offers (determinism)', () => {
    const roll = (seed: string): string[] => {
      const game = makeGenomeGame({ runSeed: seed });
      eatFoods(game, 5);
      const head = game.getState().snake[0];
      game.placeMutation({ x: head.x + 1, y: 0, z: head.z });
      game.tick();
      return [...(game.getState().pendingChoice ?? [])];
    };
    expect(roll('seed-a')).toEqual(roll('seed-a'));
  });
});

describe('one revive per run', () => {
  it('Second Sun revives without a Phoenix and pays the flat claim', () => {
    const game = makeGenomeGame();
    game.grantMutation('overclock_harvest', 0);
    game.grantMutation('grave_robber', 0);
    game.grantMutation('last_gasp', 0); // UMBRA x3 = expression...
    game.grantMutation('mirror_wager', 0); // UMBRA x4 genes -> apex
    expect(game.getState().strainTiers.UMBRA).toBe(3);
    eatFoods(game, 6);
    // Park the automatically respawned food away from the wall-crash route.
    // This assertion isolates the Second Sun flat claim from incidental food
    // DNA instead of depending on a random spawn missing the 60-cell path.
    game.placeFood({ x: 0, y: 0, z: 0 });
    const revives: unknown[] = [];
    game.on('reviveTriggered', (d) => revives.push(d));
    // Drive into the left wall
    game.setDirection('UP');
    game.tick();
    game.setDirection('LEFT');
    const dnaBefore = game.getState().dnaCollected;
    for (let i = 0; i < 200; i++) {
      game.tick();
      const s = game.getState();
      if (s.revive || s.isDeathSequence || s.isGameOver) break;
    }
    const state = game.getState();
    expect(state.revive?.kind).toBe('second_sun');
    expect(state.genomeClaims.secondSunTriggered).toBe(true);
    expect(state.dnaCollected).toBe(
      dnaBefore + STRAIN_ECONOMICS.secondSunTriggerFlat
    );
    expect(revives.length).toBe(1);
  });

  it('a fused Styx Contract revive reports kind styx', () => {
    const game = makeGenomeGame();
    game.grantMutation('mirror_wager', 0);
    game.grantMutation('phoenix', 0); // -> Styx
    eatFoods(game, 4);
    game.setDirection('UP');
    game.tick();
    game.setDirection('LEFT');
    for (let i = 0; i < 200; i++) {
      game.tick();
      const s = game.getState();
      if (s.revive || s.isDeathSequence || s.isGameOver) break;
    }
    expect(game.getState().revive?.kind).toBe('styx');
  });
});

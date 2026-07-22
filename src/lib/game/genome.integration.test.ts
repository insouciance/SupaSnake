/** G8 vertical integration: engine trace -> server validator -> bank payout. */

import { SnakeGameLogic, type GameOverData } from './SnakeGameLogic';
import { validateGameResult } from '@/lib/server/gameValidator';
import { RULESETS } from '@/shared/game/rulesets';
import type { GeneId } from '@/shared/game/genes';

function eatStraight(game: SnakeGameLogic, count: number): void {
  for (let index = 0; index < count; index++) {
    const state = game.getState();
    const head = state.snake[0];
    game.placeFood({ x: head.x + 1, y: 0, z: head.z });
    game.tick();
    if (game.getState().pendingChoice) game.declineMutation();
  }
}

function enterPortal(game: SnakeGameLogic): void {
  const head = game.getState().snake[0];
  game.placeFood({ x: 0, y: 0, z: 0 });
  game.placeExit({ x: head.x + 1, y: 0, z: head.z });
  game.tick();
}

describe('Genome run vertical integration', () => {
  it('accepts a seeded same-strain expression, infuse, and bank at the exact payout', () => {
    const genePool: GeneId[] = ['gold_trail', 'tithe', 'loan_shark', 'static_charge'];
    const game = new SnakeGameLogic({
      gridSize: 300,
      ruleset: RULESETS.PRIMAL,
      rng: () => 0.5,
      genome: {
        runSeed: 'integration-seed-001',
        heirloom: {},
        genePool,
        lineage: null,
        ftue: {
          expressionsUnlocked: true,
          infuseUnlocked: true,
          splicesUnlocked: true,
          apexesUnlocked: true,
        },
      },
    });
    game.start();

    eatStraight(game, 15);
    game.grantMutation('gold_trail', 15);
    eatStraight(game, 15);
    game.grantMutation('tithe', 30);
    eatStraight(game, 15);
    game.grantMutation('loan_shark', 45);
    expect(game.getState().strainTiers.AURUM).toBe(2);

    enterPortal(game);
    expect(game.resolvePortalChoice('infuse')).toBe(true);
    expect(game.getState().infuses).toEqual([{ atFood: 45 }]);
    game.declineMutation();

    eatStraight(game, 15);
    let gameOver: GameOverData | null = null;
    game.on('gameOver', (data) => { gameOver = data as GameOverData; });
    enterPortal(game);
    expect(game.resolvePortalChoice('bank')).toBe(true);
    expect(gameOver).not.toBeNull();

    const result = gameOver as unknown as GameOverData;
    const validation = validateGameResult(
      {
        score: result.score,
        dna_earned: result.dnaCollected,
        duration_seconds: 60,
        food_count: result.foodEaten,
        extracted: result.extracted,
        died: !result.extracted,
        victory: false,
        mutations: result.mutations,
        genome: result.genome,
      },
      new Date(Date.now() - 65_000),
      'PRIMAL',
      [],
      null,
      null,
      {
        heirloom: {},
        genePool,
        prevRunDied: false,
        crownAllowed: false,
        tierCap: 3,
        suppressedStrains: [],
        splicesUnlocked: true,
      }
    );

    expect(validation.valid).toBe(true);
    expect(validation.genome?.expressions.AURUM).toBe(45);
    expect(validation.genome?.infuses).toEqual([{ atFood: 45 }]);
    expect(validation.rawDna).toBe(result.dnaCollected);
    expect(validation.adjustedDna).toBeGreaterThan(validation.rawDna);
  });
});

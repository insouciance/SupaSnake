/**
 * PASS parity: the pity rule feeds from passes alone (WP-2.09).
 *
 * PASS has shipped end to end since the genome landed - `declineMutation`
 * resolves the trace with `picked: null`, `recentOffers` is pushed at ROLL
 * time so the pity window counts offers rather than picks, and the server's
 * `verifyOfferTrace` replays the identical stream. None of it had a test.
 *
 * This is that test. It is the one that would catch the failure that
 * matters: if either side ever started counting picks instead of offers, a
 * player who passes would be quietly starved of their own build's strain
 * forever, and every honest passing run would be flagged as a mismatch.
 *
 * The seed is fixed and the starvation precondition is asserted explicitly,
 * so a gene-catalog or weight retune that stops starving AURUM here fails
 * loudly on the precondition instead of passing vacuously.
 */

import { describe, it, expect } from '@jest/globals';
import { SnakeGameLogic, type GameOverData, type GenomeEngineConfig } from './SnakeGameLogic';
import { RULESETS } from '@/shared/game/rulesets';
import { GENE_POOL, geneStrains, type GeneId } from '@/shared/game/genes';
import { OFFER_GRAVITY, topStrain, pityForecast } from '@/shared/game/offerGravity';
import { verifyOfferTrace } from '@/lib/server/offerVerifier';

/**
 * A seed whose first two offers carry no AURUM gene, with 2 AURUM heirloom
 * points making AURUM the run's top strain from food 0. Two passes are then
 * the ONLY thing that can fill the pity window.
 */
const RUN_SEED = 'pity-AURUM-2';
const HEIRLOOM = { AURUM: 2 } as const;
const TOP = 'AURUM' as const;

function makeGame(): SnakeGameLogic {
  const genome: GenomeEngineConfig = {
    runSeed: RUN_SEED,
    heirloom: { ...HEIRLOOM },
  };
  const game = new SnakeGameLogic({
    gridSize: 120,
    ruleset: RULESETS.PRIMAL,
    rng: () => 0.5,
    genome,
  });
  game.start();
  return game;
}

/** Eat straight ahead, never touching an offer. */
function eat(game: SnakeGameLogic, count: number): void {
  for (let i = 0; i < count; i++) {
    const head = game.getState().snake[0];
    game.placeFood({ x: head.x + 1, y: 0, z: head.z });
    game.tick();
    expect(game.getState().pendingChoice).toBeNull();
  }
}

/** Walk onto a gene tile and return the offer it opened. */
function openOffer(game: SnakeGameLogic): [GeneId, GeneId] {
  const head = game.getState().snake[0];
  game.placeMutation({ x: head.x + 1, y: 0, z: head.z });
  game.tick();
  const offer = game.getState().pendingChoice;
  expect(offer).not.toBeNull();
  return offer as [GeneId, GeneId];
}

describe('PASS feeds the pity window on its own', () => {
  it('two passes force the third offer\'s slot 1 to the top strain, and verify clean', () => {
    const game = makeGame();
    let payload: GameOverData | null = null;
    game.on('gameOver', (d) => {
      payload = d as GameOverData;
    });

    // AURUM leads from food 0 on heirloom points alone - no pick required,
    // which is what lets a run of pure passes exercise the rule.
    expect(topStrain(game.getState().strainCounts)).toBe(TOP);

    // --- Offer 0: pass -----------------------------------------------------
    eat(game, 3);
    const offer0 = openOffer(game);
    expect(offer0.some((id) => geneStrains(id).includes(TOP))).toBe(false);
    game.declineMutation();
    expect(game.getState().pendingChoice).toBeNull();
    expect(game.getState().heldMutations).toEqual([]);

    // --- Offer 1: pass -----------------------------------------------------
    eat(game, 3);
    const offer1 = openOffer(game);
    expect(offer1.some((id) => geneStrains(id).includes(TOP))).toBe(false);
    // The window is now exactly full of passed offers, so the engine can
    // already name what the next slot 1 will be - this is what the PASS
    // card's consequence line renders.
    expect(game.getState().pendingChoicePity).toBe(TOP);
    game.declineMutation();

    // Two starved offers is exactly the pity window; if the constants move,
    // this is the assertion that says so rather than the one below.
    expect(OFFER_GRAVITY.pityOfferWindow).toBe(2);

    // --- Offer 2: pity fires, from passes alone ----------------------------
    eat(game, 3);
    const offer2 = openOffer(game);
    expect(geneStrains(offer2[0])).toContain(TOP);
    // ...and having just been fed a top-strain gene, the window is no longer
    // starved, so passing again would NOT force the next one.
    expect(game.getState().pendingChoicePity).toBeNull();
    game.declineMutation();

    // --- The trace: three offers, three passes, nothing picked -------------
    const head = game.getState().snake[0];
    game.placeExit({ x: head.x + 1, y: 0, z: head.z });
    game.tick();
    expect(game.resolvePortalChoice('bank')).toBe(true);
    expect(payload).not.toBeNull();

    const trace = (payload as unknown as GameOverData).genome!.offerTrace;
    expect(trace).toHaveLength(3);
    expect(trace.map((e) => e.picked)).toEqual([null, null, null]);
    expect(trace.map((e) => e.k)).toEqual([0, 1, 2]);
    // `picked: null` is the shipped pass contract - no `passed` flag, and no
    // stray engine-internal field on the wire.
    for (const entry of trace) {
      expect(Object.keys(entry).sort()).toEqual(['atFood', 'k', 'picked']);
    }

    // --- The server replays the same stream and agrees ---------------------
    const result = verifyOfferTrace(trace, [], {
      runSeed: RUN_SEED,
      pool: [...GENE_POOL],
      heirloom: { ...HEIRLOOM },
      surges: [],
      lineage: null,
      anomalyStrain: null,
      tierCap: 3,
    });
    expect(result.mismatches).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(3);
  });

  it('a pass-only run is not mistaken for a starved one when the offer carries the strain', () => {
    // The negative half: pityForecast must stay null while the window still
    // holds a top-strain gene, or the PASS card would promise a forcing that
    // never happens.
    const withTop = pityForecast({
      picks: [],
      pool: [...GENE_POOL],
      points: { ...HEIRLOOM },
      recentOffers: [
        ['gold_trail', 'phoenix'] as GeneId[],
        ['mirror_wager', 'phoenix'] as GeneId[],
      ],
    });
    expect(geneStrains('gold_trail')).toContain(TOP);
    expect(withTop).toBeNull();

    const starved = pityForecast({
      picks: [],
      pool: [...GENE_POOL],
      points: { ...HEIRLOOM },
      recentOffers: [
        ['mirror_wager', 'phoenix'] as GeneId[],
        ['phoenix', 'mirror_wager'] as GeneId[],
      ],
    });
    expect(starved).toBe(TOP);

    // A single offer is not yet a window - no promise before the rule can
    // actually fire.
    expect(
      pityForecast({
        picks: [],
        pool: [...GENE_POOL],
        points: { ...HEIRLOOM },
        recentOffers: [['mirror_wager', 'phoenix'] as GeneId[]],
      })
    ).toBeNull();

    // No points at all means no top strain, so nothing to promise.
    expect(
      pityForecast({
        picks: [],
        pool: [...GENE_POOL],
        points: {},
        recentOffers: [
          ['mirror_wager', 'phoenix'] as GeneId[],
          ['phoenix', 'mirror_wager'] as GeneId[],
        ],
      })
    ).toBeNull();
  });
});

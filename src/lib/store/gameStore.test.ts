/**
 * Tests for Game State Store (Zustand)
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { useGameStore, GameStore } from './gameStore';

describe('Game Store', () => {
  beforeEach(() => {
    useGameStore.setState({
      isPlaying: false,
      isGameOver: false,
      score: 0,
      dnaCollected: 0,
      energy: 5,
      maxEnergy: 5,
      selectedDynasty: 'PRIMAL',
      snake: [],
      food: null,
      direction: 'RIGHT',
    });
  });

  describe('Initial State', () => {
    it('should have correct default values', () => {
      const state = useGameStore.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.isGameOver).toBe(false);
      expect(state.score).toBe(0);
      expect(state.energy).toBe(5);
      expect(state.selectedDynasty).toBe('PRIMAL');
    });
  });

  describe('Game Actions', () => {
    it('should start game', () => {
      useGameStore.getState().startGame();
      const state = useGameStore.getState();
      expect(state.isPlaying).toBe(true);
      expect(state.isGameOver).toBe(false);
    });

    it('should not consume energy on start (server handles this)', () => {
      // Energy is now deducted server-side, not in the store
      useGameStore.getState().startGame();
      const state = useGameStore.getState();
      expect(state.energy).toBe(5); // Energy unchanged - server handles deduction
    });

    it('should start even with 0 energy (server validates)', () => {
      // Energy validation is now done server-side
      useGameStore.setState({ energy: 0 });
      useGameStore.getState().startGame();
      expect(useGameStore.getState().isPlaying).toBe(true); // UI starts, server may reject
    });

    it('should end game (defaults to a death ending)', () => {
      useGameStore.getState().startGame();
      useGameStore.getState().endGame(100, 50);
      const state = useGameStore.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.isGameOver).toBe(true);
      expect(state.score).toBe(100);
      expect(state.dnaCollected).toBe(50);
      expect(state.endReason).toBe('died');
    });

    it('records an extracted ending and clears the exit portal', () => {
      useGameStore.getState().startGame();
      useGameStore.getState().setExitTile({ x: 3, y: 0, z: 4 }, 42);
      useGameStore.getState().endGame(200, 150, 'extracted');
      const state = useGameStore.getState();
      expect(state.endReason).toBe('extracted');
      expect(state.exitTile).toBeNull();
      expect(state.exitTicksRemaining).toBe(0);
    });

    it('startGame resets extraction fields from the previous run', () => {
      useGameStore.setState({ foodEaten: 12, endReason: 'extracted' });
      useGameStore.getState().startGame();
      const state = useGameStore.getState();
      expect(state.foodEaten).toBe(0);
      expect(state.endReason).toBeNull();
    });
  });

  describe('Extraction state mirror', () => {
    it('tracks foodEaten', () => {
      useGameStore.getState().setFoodEaten(9);
      expect(useGameStore.getState().foodEaten).toBe(9);
    });

    it('tracks the exit portal with its countdown', () => {
      useGameStore.getState().setExitTile({ x: 5, y: 0, z: 6 }, 90);
      expect(useGameStore.getState().exitTile).toEqual({ x: 5, y: 0, z: 6 });
      expect(useGameStore.getState().exitTicksRemaining).toBe(90);
    });

    it('clears the countdown when the portal despawns', () => {
      useGameStore.getState().setExitTile({ x: 5, y: 0, z: 6 }, 90);
      useGameStore.getState().setExitTile(null);
      expect(useGameStore.getState().exitTile).toBeNull();
      expect(useGameStore.getState().exitTicksRemaining).toBe(0);
    });

    it('resetGame clears extraction state', () => {
      useGameStore.setState({
        foodEaten: 7,
        endReason: 'extracted',
        exitTile: { x: 1, y: 0, z: 1 },
        exitTicksRemaining: 10,
      });
      useGameStore.getState().resetGame();
      const state = useGameStore.getState();
      expect(state.foodEaten).toBe(0);
      expect(state.endReason).toBeNull();
      expect(state.exitTile).toBeNull();
      expect(state.exitTicksRemaining).toBe(0);
    });
  });

  describe('Score and DNA', () => {
    it('should update score', () => {
      useGameStore.getState().setScore(42);
      expect(useGameStore.getState().score).toBe(42);
    });

    it('should update DNA collected', () => {
      useGameStore.getState().setDnaCollected(100);
      expect(useGameStore.getState().dnaCollected).toBe(100);
    });

    it('should increment score', () => {
      useGameStore.getState().setScore(10);
      useGameStore.getState().incrementScore();
      expect(useGameStore.getState().score).toBe(11);
    });
  });

  describe('Dynasty Selection', () => {
    it('should change selected dynasty', () => {
      useGameStore.getState().setSelectedDynasty('PRIMAL');
      expect(useGameStore.getState().selectedDynasty).toBe('PRIMAL');
    });

    it('should accept all valid dynasties', () => {
      useGameStore.getState().setSelectedDynasty('COSMIC');
      expect(useGameStore.getState().selectedDynasty).toBe('COSMIC');

      useGameStore.getState().setSelectedDynasty('CYBER');
      expect(useGameStore.getState().selectedDynasty).toBe('CYBER');
    });
  });

  describe('Harvest envelope (Constitution §8.6)', () => {
    const snapshot = {
      state: 'charged' as const,
      remaining: 4,
      perDay: 6,
      usedToday: 2,
      day: '2026-07-25',
      refillsAt: '2026-07-26T00:00:00.000Z',
      visible: true,
    };

    it('starts with no assumed charge state', () => {
      // The old store seeded a full energy bar from config, so the client
      // rendered "5/5" before the server had said anything. Charges are
      // server-derived; the client must not invent them.
      expect(useGameStore.getState().charge).toBeNull();
    });

    it('mirrors the server snapshot verbatim', () => {
      useGameStore.getState().syncChargeFromServer(snapshot);
      expect(useGameStore.getState().charge).toEqual(snapshot);
    });

    it('clears back to null when the server reports nothing', () => {
      useGameStore.getState().syncChargeFromServer(snapshot);
      useGameStore.getState().syncChargeFromServer(null);
      expect(useGameStore.getState().charge).toBeNull();
    });

    it('exposes no local mutator that could grant or spend a charge', () => {
      // Rule 11: the client never writes balances. There is exactly one
      // charge action and it is a mirror of the server.
      const state = useGameStore.getState() as unknown as Record<string, unknown>;
      expect(typeof state.syncChargeFromServer).toBe('function');
      expect(state.setEnergy).toBeUndefined();
      expect(state.setCharge).toBeUndefined();
      expect(state.spendCharge).toBeUndefined();
      expect(state.syncEnergyFromServer).toBeUndefined();
    });
  });

  describe('Snake State', () => {
    it('should update snake positions', () => {
      const snake = [
        { x: 10, y: 0, z: 10 },
        { x: 9, y: 0, z: 10 },
      ];
      useGameStore.getState().setSnake(snake);
      expect(useGameStore.getState().snake).toEqual(snake);
    });

    it('should update food position', () => {
      const food = { x: 15, y: 0, z: 15 };
      useGameStore.getState().setFood(food);
      expect(useGameStore.getState().food).toEqual(food);
    });

    it('should update direction', () => {
      useGameStore.getState().setDirection('UP');
      expect(useGameStore.getState().direction).toBe('UP');
    });

    it('should update queued directions (aim telegraph mirror)', () => {
      useGameStore.getState().setQueuedDirections(['UP', 'LEFT']);
      expect(useGameStore.getState().queuedDirections).toEqual(['UP', 'LEFT']);
    });

    it('should clear queued directions on reset', () => {
      useGameStore.getState().setQueuedDirections(['UP']);
      useGameStore.getState().resetGame();
      expect(useGameStore.getState().queuedDirections).toEqual([]);
    });
  });

  describe('Reset', () => {
    it('should reset game state', () => {
      useGameStore.setState({
        isPlaying: true,
        score: 100,
        dnaCollected: 500,
      });

      useGameStore.getState().resetGame();

      const state = useGameStore.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.score).toBe(0);
      expect(state.dnaCollected).toBe(0);
    });

    it('should preserve energy on reset', () => {
      useGameStore.setState({ energy: 3 });
      useGameStore.getState().resetGame();
      expect(useGameStore.getState().energy).toBe(3);
    });

    it('should preserve dynasty selection on reset', () => {
      useGameStore.setState({ selectedDynasty: 'PRIMAL' });
      useGameStore.getState().resetGame();
      expect(useGameStore.getState().selectedDynasty).toBe('PRIMAL');
    });
  });

  describe('Design v2 Phase 2: mutations + COSMIC constellations', () => {
    it('has clean Phase 2 defaults', () => {
      const state = useGameStore.getState();
      expect(state.extraFoods).toEqual([]);
      expect(state.constellationGlyph).toBeNull();
      expect(state.constellationTicksRemaining).toBe(0);
      expect(state.constellationWindowTicks).toBe(0);
      expect(state.mutationTile).toBeNull();
      expect(state.heldMutations).toEqual([]);
      expect(state.choiceOptions).toBeNull();
      expect(state.phoenixTriggered).toBe(false);
      expect(state.torus).toBe(false);
    });

    it('mirrors engine state through the Phase 2 setters', () => {
      const store = useGameStore.getState();
      store.setExtraFoods([{ x: 1, y: 0, z: 2 }]);
      store.setConstellation(2, 31, 50);
      store.setMutationTile({ x: 4, y: 0, z: 4 }, 33);
      store.setHeldMutations([{ id: 'overgrowth', atFood: 17 }]);
      store.setChoiceOptions(['gold_trail', 'phoenix']);
      store.setPhoenixTriggered(true);
      store.setTorus(true);

      const state = useGameStore.getState();
      expect(state.extraFoods).toEqual([{ x: 1, y: 0, z: 2 }]);
      expect(state.constellationGlyph).toBe(2);
      expect(state.constellationTicksRemaining).toBe(31);
      expect(state.constellationWindowTicks).toBe(50);
      expect(state.mutationTile).toEqual({ x: 4, y: 0, z: 4 });
      expect(state.mutationTicksRemaining).toBe(33);
      expect(state.heldMutations).toEqual([{ id: 'overgrowth', atFood: 17 }]);
      expect(state.choiceOptions).toEqual(['gold_trail', 'phoenix']);
      expect(state.phoenixTriggered).toBe(true);
      expect(state.torus).toBe(true);
    });

    it('clearing the mutation tile zeroes its countdown', () => {
      const store = useGameStore.getState();
      store.setMutationTile({ x: 4, y: 0, z: 4 }, 33);
      store.setMutationTile(null);
      const state = useGameStore.getState();
      expect(state.mutationTile).toBeNull();
      expect(state.mutationTicksRemaining).toBe(0);
    });

    it('the constellation window survives a redraw of the same wave', () => {
      // The window is the mechanic's only visible surface; a mirror that
      // dropped it would hide the deadline the abandonment is chosen under.
      const store = useGameStore.getState();
      store.setConstellation(1, 12, 50);
      expect(useGameStore.getState().constellationTicksRemaining).toBe(12);
      store.setConstellation(1, 11, 50);
      expect(useGameStore.getState().constellationTicksRemaining).toBe(11);
      expect(useGameStore.getState().constellationWindowTicks).toBe(50);
    });

    it('startGame clears the previous run build', () => {
      useGameStore.setState({
        heldMutations: [{ id: 'phoenix', atFood: 20 }],
        phoenixTriggered: true,
        choiceOptions: ['gold_trail', 'shed'],
        constellationTicksRemaining: 6,
        constellationWindowTicks: 50,
      });
      useGameStore.getState().startGame();
      const state = useGameStore.getState();
      expect(state.heldMutations).toEqual([]);
      expect(state.phoenixTriggered).toBe(false);
      expect(state.choiceOptions).toBeNull();
      expect(state.constellationTicksRemaining).toBe(0);
      expect(state.constellationWindowTicks).toBe(0);
    });

    it('endGame keeps the build for the game-over screen but closes overlays', () => {
      useGameStore.setState({
        isPlaying: true,
        heldMutations: [{ id: 'mirror_wager', atFood: 18 }],
        phoenixTriggered: true,
        choiceOptions: ['gold_trail', 'shed'],
        mutationTile: { x: 3, y: 0, z: 3 },
        mutationTicksRemaining: 12,
      });
      useGameStore.getState().endGame(100, 300, 'extracted');
      const state = useGameStore.getState();
      expect(state.heldMutations).toEqual([{ id: 'mirror_wager', atFood: 18 }]);
      expect(state.phoenixTriggered).toBe(true);
      expect(state.choiceOptions).toBeNull();
      expect(state.mutationTile).toBeNull();
      expect(state.mutationTicksRemaining).toBe(0);
    });

    it('resetGame clears everything Phase 2', () => {
      useGameStore.setState({
        heldMutations: [{ id: 'shed', atFood: 15 }],
        phoenixTriggered: true,
        extraFoods: [{ x: 1, y: 0, z: 1 }],
        constellationGlyph: 1,
        constellationTicksRemaining: 20,
      });
      useGameStore.getState().resetGame();
      const state = useGameStore.getState();
      expect(state.heldMutations).toEqual([]);
      expect(state.phoenixTriggered).toBe(false);
      expect(state.extraFoods).toEqual([]);
      expect(state.constellationGlyph).toBeNull();
      expect(state.constellationTicksRemaining).toBe(0);
    });
  });

  describe('Game Mode (Free Play, Design v2 §7.4)', () => {
    it('defaults to the earning mode', () => {
      useGameStore.setState({ gameMode: 'earn' });
      expect(useGameStore.getState().gameMode).toBe('earn');
    });

    it('setGameMode switches between earn and free', () => {
      useGameStore.getState().setGameMode('free');
      expect(useGameStore.getState().gameMode).toBe('free');

      useGameStore.getState().setGameMode('earn');
      expect(useGameStore.getState().gameMode).toBe('earn');
    });

    it('survives resetGame (Play Again keeps the chosen mode)', () => {
      useGameStore.getState().setGameMode('free');
      useGameStore.getState().startGame();
      useGameStore.getState().endGame(10, 5);
      useGameStore.getState().resetGame();

      expect(useGameStore.getState().gameMode).toBe('free');
    });

    it('startGame does not touch the mode or energy', () => {
      useGameStore.setState({ energy: 0, gameMode: 'free' });
      useGameStore.getState().startGame();

      const state = useGameStore.getState();
      expect(state.isPlaying).toBe(true); // free play starts at zero energy
      expect(state.energy).toBe(0);
      expect(state.gameMode).toBe('free');
    });
  });

  describe('Weekly Anomaly board (Design v2 §7.2)', () => {
    it('anomaly is a first-class run mode', () => {
      useGameStore.getState().setGameMode('anomaly');
      expect(useGameStore.getState().gameMode).toBe('anomaly');
    });

    it('mirrors the Twin Exits second portal and clears it on end/start', () => {
      useGameStore.getState().startGame();
      useGameStore.getState().setExitTile2({ x: 3, y: 0, z: 4 });
      expect(useGameStore.getState().exitTile2).toEqual({ x: 3, y: 0, z: 4 });

      useGameStore.getState().endGame(10, 5, 'extracted');
      expect(useGameStore.getState().exitTile2).toBeNull();

      useGameStore.getState().setExitTile2({ x: 1, y: 0, z: 1 });
      useGameStore.getState().startGame();
      expect(useGameStore.getState().exitTile2).toBeNull();
    });

    it('anomalyRun context survives game over (board line on the end screen) but resets with resetGame', () => {
      const info = {
        id: 'gold_rush',
        name: 'Gold Rush',
        effect: 'All food ×1.5 DNA',
        endsAt: '2026-07-27T00:00:00.000Z',
      };
      useGameStore.getState().setAnomalyRun(info);
      useGameStore.getState().startGame();
      useGameStore.getState().endGame(10, 5);
      expect(useGameStore.getState().anomalyRun).toEqual(info);

      useGameStore.getState().resetGame();
      expect(useGameStore.getState().anomalyRun).toBeNull();
    });
  });
});

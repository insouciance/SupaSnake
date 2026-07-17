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
      selectedDynasty: 'CYBER',
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
      expect(state.selectedDynasty).toBe('CYBER');
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

    it('should end game', () => {
      useGameStore.getState().startGame();
      useGameStore.getState().endGame(100, 50);
      const state = useGameStore.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.isGameOver).toBe(true);
      expect(state.score).toBe(100);
      expect(state.dnaCollected).toBe(50);
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

  describe('Energy System', () => {
    it('should set energy', () => {
      useGameStore.getState().setEnergy(3);
      expect(useGameStore.getState().energy).toBe(3);
    });

    it('should allow bonus energy above max (purchases)', () => {
      // setEnergy documents: "Allow bonus energy above maxEnergy (from purchases)"
      useGameStore.getState().setEnergy(10);
      expect(useGameStore.getState().energy).toBe(10);
    });

    it('should not go below 0', () => {
      useGameStore.getState().setEnergy(-5);
      expect(useGameStore.getState().energy).toBeGreaterThanOrEqual(0);
    });

    it('should sync energy from server', () => {
      const regenAt = new Date(Date.now() + 60000).toISOString();
      useGameStore.getState().syncEnergyFromServer(4, regenAt);
      expect(useGameStore.getState().energy).toBe(4);
      expect(useGameStore.getState().energyRegenAt).toBe(regenAt);
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
});

/**
 * Aim systems - unlock predicates, id validation, and feature tiers.
 * These predicates are the single source of truth for BOTH the selector UI
 * and the server-side PATCH validation, so they are tested exhaustively.
 */

import {
  AIM_SYSTEMS,
  AIM_SYSTEM_IDS,
  DEFAULT_AIM_SYSTEM,
  getAimFeatures,
  getUnlockedAimSystems,
  isAimSystemId,
  isAimSystemUnlocked,
  type AimStats,
} from './aimSystems';

const zeroStats: AimStats = {
  highScore: 0,
  totalGames: 0,
  breeds: 0,
  maxGeneration: 0,
};

const stats = (overrides: Partial<AimStats>): AimStats => ({
  ...zeroStats,
  ...overrides,
});

describe('aim system registry', () => {
  it('defines exactly the five systems in progression order', () => {
    expect(AIM_SYSTEM_IDS).toEqual([
      'pulse',
      'vector',
      'sequence',
      'radar',
      'apex',
    ]);
  });

  it('defaults to pulse', () => {
    expect(DEFAULT_AIM_SYSTEM).toBe('pulse');
  });

  it('every system has a name, description, and unlock hint', () => {
    for (const def of AIM_SYSTEMS) {
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.unlockHint.length).toBeGreaterThan(0);
    }
  });
});

describe('isAimSystemId', () => {
  it('accepts the five ids', () => {
    for (const id of AIM_SYSTEM_IDS) {
      expect(isAimSystemId(id)).toBe(true);
    }
  });

  it('rejects unknown values and non-strings', () => {
    expect(isAimSystemId('laser')).toBe(false);
    expect(isAimSystemId('PULSE')).toBe(false);
    expect(isAimSystemId('')).toBe(false);
    expect(isAimSystemId(null)).toBe(false);
    expect(isAimSystemId(undefined)).toBe(false);
    expect(isAimSystemId(3)).toBe(false);
  });
});

describe('unlock predicates', () => {
  it('pulse is always unlocked', () => {
    expect(isAimSystemUnlocked('pulse', zeroStats)).toBe(true);
  });

  it('vector unlocks at high score 15', () => {
    expect(isAimSystemUnlocked('vector', stats({ highScore: 14 }))).toBe(false);
    expect(isAimSystemUnlocked('vector', stats({ highScore: 15 }))).toBe(true);
  });

  it('sequence unlocks at 25 games OR 1 breed', () => {
    expect(isAimSystemUnlocked('sequence', stats({ totalGames: 24 }))).toBe(false);
    expect(isAimSystemUnlocked('sequence', stats({ totalGames: 25 }))).toBe(true);
    expect(isAimSystemUnlocked('sequence', stats({ breeds: 1 }))).toBe(true);
  });

  it('radar unlocks at high score 30', () => {
    expect(isAimSystemUnlocked('radar', stats({ highScore: 29 }))).toBe(false);
    expect(isAimSystemUnlocked('radar', stats({ highScore: 30 }))).toBe(true);
  });

  it('apex unlocks at high score 50 OR generation 5', () => {
    expect(isAimSystemUnlocked('apex', stats({ highScore: 49, maxGeneration: 4 }))).toBe(false);
    expect(isAimSystemUnlocked('apex', stats({ highScore: 50 }))).toBe(true);
    expect(isAimSystemUnlocked('apex', stats({ maxGeneration: 5 }))).toBe(true);
  });

  it('rejects unknown ids (server-side guard path)', () => {
    expect(isAimSystemUnlocked('laser', stats({ highScore: 999 }))).toBe(false);
  });
});

describe('getUnlockedAimSystems', () => {
  it('a fresh player only has pulse', () => {
    expect(getUnlockedAimSystems(zeroStats)).toEqual(['pulse']);
  });

  it('a maxed player has all five', () => {
    const all = getUnlockedAimSystems(
      stats({ highScore: 50, totalGames: 25, breeds: 1, maxGeneration: 5 })
    );
    expect(all).toEqual([...AIM_SYSTEM_IDS]);
  });

  it('mid-progression: score 20 unlocks pulse + vector only', () => {
    expect(getUnlockedAimSystems(stats({ highScore: 20 }))).toEqual([
      'pulse',
      'vector',
    ]);
  });
});

describe('getAimFeatures', () => {
  it('pulse renders no extra layers', () => {
    expect(getAimFeatures('pulse')).toEqual({
      lane: false,
      queue: false,
      radar: false,
      subtle: false,
    });
  });

  it('vector adds the lane, sequence adds queued turns', () => {
    expect(getAimFeatures('vector')).toMatchObject({ lane: true, queue: false });
    expect(getAimFeatures('sequence')).toMatchObject({ lane: true, queue: true });
  });

  it('radar renders danger sense without the lane', () => {
    expect(getAimFeatures('radar')).toMatchObject({
      lane: false,
      queue: false,
      radar: true,
    });
  });

  it('apex combines everything at subtle opacity', () => {
    expect(getAimFeatures('apex')).toEqual({
      lane: true,
      queue: true,
      radar: true,
      subtle: true,
    });
  });
});

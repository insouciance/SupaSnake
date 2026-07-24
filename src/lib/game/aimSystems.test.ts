/**
 * Aim systems v2 - unlock predicates and id validation.
 * These predicates are the single source of truth for BOTH the selector UI
 * and the server-side PATCH validation, so the unlock boundaries are
 * tested exhaustively (14/15, 29/30, 24/25, 0/1 breeds, 49/50).
 */

import {
  AIM_SYSTEMS,
  AIM_SYSTEM_IDS,
  DEFAULT_AIM_SYSTEM,
  getAimSystem,
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
  it('defines exactly the four v2 systems in progression order', () => {
    expect(AIM_SYSTEM_IDS).toEqual(['deadeye', 'gridlock', 'pathline', 'firefly']);
  });

  it('defaults to deadeye', () => {
    expect(DEFAULT_AIM_SYSTEM).toBe('deadeye');
    expect(getAimSystem(DEFAULT_AIM_SYSTEM).isUnlocked(zeroStats)).toBe(true);
  });

  it('describes deadeye as a heading-relative board-edge guide with a cell cue', () => {
    const description = getAimSystem('deadeye').description.toLowerCase();
    expect(description).toContain('heading-relative');
    expect(description).toContain('t guide');
    expect(description).toContain('board edges');
    expect(description).toContain('highlighted tile');
    expect(description).toContain('current cell');
    expect(description).not.toContain('centered crosshair');
    expect(description).not.toContain('target lock');
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
  it('accepts the four v2 ids', () => {
    for (const id of AIM_SYSTEM_IDS) {
      expect(isAimSystemId(id)).toBe(true);
    }
  });

  it('rejects the retired v1 ids (migration 026 remaps them)', () => {
    for (const legacy of ['pulse', 'vector', 'sequence', 'radar', 'apex']) {
      expect(isAimSystemId(legacy)).toBe(false);
    }
  });

  it('rejects unknown values and non-strings', () => {
    expect(isAimSystemId('laser')).toBe(false);
    expect(isAimSystemId('DEADEYE')).toBe(false);
    expect(isAimSystemId('')).toBe(false);
    expect(isAimSystemId(null)).toBe(false);
    expect(isAimSystemId(undefined)).toBe(false);
    expect(isAimSystemId(3)).toBe(false);
  });
});

describe('unlock predicates (boundary matrix)', () => {
  it('deadeye is always unlocked', () => {
    expect(isAimSystemUnlocked('deadeye', zeroStats)).toBe(true);
  });

  it('gridlock unlocks at exactly high score 15', () => {
    expect(isAimSystemUnlocked('gridlock', stats({ highScore: 14 }))).toBe(false);
    expect(isAimSystemUnlocked('gridlock', stats({ highScore: 15 }))).toBe(true);
  });

  it('pathline unlocks at high score 30 OR 25 games', () => {
    expect(isAimSystemUnlocked('pathline', stats({ highScore: 29 }))).toBe(false);
    expect(isAimSystemUnlocked('pathline', stats({ highScore: 30 }))).toBe(true);
    expect(isAimSystemUnlocked('pathline', stats({ totalGames: 24 }))).toBe(false);
    expect(isAimSystemUnlocked('pathline', stats({ totalGames: 25 }))).toBe(true);
    expect(
      isAimSystemUnlocked('pathline', stats({ highScore: 29, totalGames: 24 }))
    ).toBe(false);
  });

  it('firefly unlocks at 1 breed OR high score 50', () => {
    expect(isAimSystemUnlocked('firefly', stats({ breeds: 0 }))).toBe(false);
    expect(isAimSystemUnlocked('firefly', stats({ breeds: 1 }))).toBe(true);
    expect(isAimSystemUnlocked('firefly', stats({ highScore: 49 }))).toBe(false);
    expect(isAimSystemUnlocked('firefly', stats({ highScore: 50 }))).toBe(true);
    expect(
      isAimSystemUnlocked('firefly', stats({ breeds: 0, highScore: 49 }))
    ).toBe(false);
  });

  it('maxGeneration no longer gates anything (kept in AimStats for the API shape)', () => {
    expect(getUnlockedAimSystems(stats({ maxGeneration: 99 }))).toEqual(['deadeye']);
  });

  it('rejects unknown ids (server-side guard path)', () => {
    expect(isAimSystemUnlocked('laser', stats({ highScore: 999 }))).toBe(false);
    expect(isAimSystemUnlocked('apex', stats({ highScore: 999 }))).toBe(false);
  });
});

describe('getUnlockedAimSystems', () => {
  it('a fresh player only has deadeye', () => {
    expect(getUnlockedAimSystems(zeroStats)).toEqual(['deadeye']);
  });

  it('a maxed player has all four', () => {
    const all = getUnlockedAimSystems(
      stats({ highScore: 50, totalGames: 25, breeds: 1 })
    );
    expect(all).toEqual([...AIM_SYSTEM_IDS]);
  });

  it('mid-progression: score 20 unlocks deadeye + gridlock only', () => {
    expect(getUnlockedAimSystems(stats({ highScore: 20 }))).toEqual([
      'deadeye',
      'gridlock',
    ]);
  });

  it('lab path: one breed unlocks firefly while pathline stays locked', () => {
    expect(getUnlockedAimSystems(stats({ breeds: 1 }))).toEqual([
      'deadeye',
      'firefly',
    ]);
  });
});

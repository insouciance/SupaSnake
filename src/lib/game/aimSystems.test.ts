/**
 * Aim systems - universalization (WP-0.07).
 *
 * This suite used to be an exhaustive unlock-boundary matrix (14/15, 29/30,
 * 24/25, 0/1 breeds, 49/50). Those boundaries no longer exist: Constitution
 * §6.1 and §15 overturn 10 make all four systems settings from the first run.
 * The suite now asserts the OPPOSITE rule - that the module carries no unlock
 * predicate, no progression stat, and no way to reintroduce one.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as aimSystems from './aimSystems';
import {
  AIM_SYSTEMS,
  AIM_SYSTEM_IDS,
  DEFAULT_AIM_SYSTEM,
  getAimSystem,
  isAimSystemId,
} from './aimSystems';

const MODULE_SOURCE = readFileSync(
  join(process.cwd(), 'src/lib/game/aimSystems.ts'),
  'utf8'
);

describe('aim system registry', () => {
  it('defines exactly the four systems', () => {
    expect(AIM_SYSTEM_IDS).toEqual(['deadeye', 'gridlock', 'pathline', 'firefly']);
  });

  it('defaults to deadeye', () => {
    expect(DEFAULT_AIM_SYSTEM).toBe('deadeye');
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

  it('every system has a name and a description', () => {
    for (const def of AIM_SYSTEMS) {
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });
});

describe('universalization (§6.1, §15 overturn 10)', () => {
  it('exposes no unlock predicate or unlock hint on any system', () => {
    for (const def of AIM_SYSTEMS) {
      expect(Object.keys(def).sort()).toEqual(['description', 'id', 'name']);
    }
  });

  it('exports no unlock API at all', () => {
    const exported = Object.keys(aimSystems);
    for (const removed of [
      'isAimSystemUnlocked',
      'getUnlockedAimSystems',
      'AimStats',
      'DEFAULT_AIM_STATS',
    ]) {
      expect(exported).not.toContain(removed);
    }
    expect(exported.sort()).toEqual(
      [
        'AIM_SYSTEMS',
        'AIM_SYSTEM_IDS',
        'DEFAULT_AIM_SYSTEM',
        'getAimSystem',
        'isAimSystemId',
      ].sort()
    );
  });

  /**
   * The regression this WP exists to prevent: a gate creeping back in behind
   * a stat read. The source itself must never mention progression state
   * outside prose. Comments are stripped so the module can still explain what
   * it retired and why.
   */
  it('reads no progression, breeding or account state in executable code', () => {
    const code = MODULE_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(
      /\/\/.*$/gm,
      ''
    );
    for (const forbidden of [
      /\bhighScore\b/,
      /\bhigh_score\b/,
      /\btotalGames\b/,
      /\btotal_games_played\b/,
      /\bbreeds\b/,
      /\bbreeds_completed\b/,
      /\bmaxGeneration\b/,
      /\bisUnlocked\b/,
      /\bunlockHint\b/,
      /\bpremium\b/i,
      /\bentitlement\b/i,
    ]) {
      expect(code).not.toMatch(forbidden);
    }
  });
});

describe('isAimSystemId', () => {
  it('accepts the four ids', () => {
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

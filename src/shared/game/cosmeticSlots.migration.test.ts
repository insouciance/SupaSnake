/**
 * Slot-vocabulary parity: TypeScript ↔ migration 069 (LF-B).
 *
 * The slot list is written four times and cannot be reduced to one (see
 * `cosmeticSlots.ts` for why). This test is the thing that keeps the four
 * honest: it reads the migration's SQL text and compares every list in it to
 * the authored constant. Drift one and the build names the list that lied.
 *
 * Doctrine FM-1 (dual source of truth) is the failure mode; the counter here
 * is mechanical parity rather than a single predicate, because a CHECK
 * constraint cannot call one safely.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import {
  COSMETIC_SLOTS,
  SNAKE_COSMETIC_SLOTS,
  PROFILE_COSMETIC_SLOTS,
  SNAKE_COSMETIC_CATEGORIES,
  cosmeticSlotPositions,
  isCosmeticSlot,
  isSnakeCosmeticSlot,
} from '@/shared/game/cosmeticSlots';

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/069_snake_cosmetic_loadout.sql'
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

/**
 * The same file with every `--` comment line removed. Structural assertions
 * read THIS: the migration explains itself at length, and prose that quotes
 * `SECURITY DEFINER` or `supporter_only` must not be mistaken for code that
 * does. Assertions about the prose itself still read `sql`.
 */
const code = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

/** Pull the quoted members out of the first `IN (...)` list after `marker`. */
function slotListAfter(marker: string): string[] {
  const at = code.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const inAt = code.indexOf('IN (', at);
  expect(inAt).toBeGreaterThan(-1);
  const open = inAt + 'IN '.length;
  const close = code.indexOf(')', open);
  expect(close).toBeGreaterThan(open);
  return code
    .slice(open + 1, close)
    .split(',')
    .map((part) => part.trim().replace(/^'|'$/g, ''))
    .filter((part) => part.length > 0);
}

describe('cosmetic slot vocabulary parity with migration 069', () => {
  it('the authored list is the six profile slots then the three snake slots', () => {
    expect(PROFILE_COSMETIC_SLOTS).toEqual([
      'title',
      'banner',
      'badge',
      'trail',
      'board_accent',
      'emblem',
    ]);
    expect(SNAKE_COSMETIC_SLOTS).toEqual(['face', 'crown', 'food_skin']);
    expect(COSMETIC_SLOTS).toEqual([
      ...PROFILE_COSMETIC_SLOTS,
      ...SNAKE_COSMETIC_SLOTS,
    ]);
  });

  it('cosmetic_definitions_slot_check lists exactly the authored slots', () => {
    expect(slotListAfter('ADD CONSTRAINT cosmetic_definitions_slot_check')).toEqual([
      ...COSMETIC_SLOTS,
    ]);
  });

  it('player_loadout_slot_check lists exactly the authored slots', () => {
    expect(slotListAfter('ADD CONSTRAINT player_loadout_slot_check')).toEqual([
      ...COSMETIC_SLOTS,
    ]);
  });

  it('the equip_cosmetic guard lists exactly the authored slots', () => {
    expect(slotListAfter('IF p_slot NOT IN')).toEqual([...COSMETIC_SLOTS]);
  });

  it('read_snake_cosmetic_catalog browses exactly the snake slots', () => {
    expect(slotListAfter('WHERE cd.slot IN')).toEqual([...SNAKE_COSMETIC_SLOTS]);
  });

  it('read_snake_loadout answers for every snake slot and nothing else', () => {
    const body = code.slice(
      code.indexOf('CREATE OR REPLACE FUNCTION read_snake_loadout'),
      code.indexOf('COMMENT ON FUNCTION read_snake_loadout')
    );
    expect(body.length).toBeGreaterThan(0);
    for (const slot of SNAKE_COSMETIC_SLOTS) {
      // one jsonb key, and one predicate reading that slot's loadout row
      expect(body).toContain(`'${slot}',`);
      expect(body).toContain(`pl.slot = '${slot}'`);
    }
    for (const slot of PROFILE_COSMETIC_SLOTS) {
      expect(body).not.toContain(`pl.slot = '${slot}'`);
    }
  });

  it('the menu renders one category per snake slot, in slot order', () => {
    expect(SNAKE_COSMETIC_CATEGORIES.map((c) => c.slot)).toEqual([
      ...SNAKE_COSMETIC_SLOTS,
    ]);
  });

  it('badge is the only multi-position slot; every snake slot wears one thing', () => {
    expect(cosmeticSlotPositions('badge')).toBe(3);
    for (const slot of COSMETIC_SLOTS) {
      if (slot !== 'badge') expect(cosmeticSlotPositions(slot)).toBe(1);
    }
    // 069 leaves player_loadout_position_valid alone precisely because
    // `slot <> 'badge' AND position = 1` already covers the new slots.
    expect(code).not.toContain('player_loadout_position_valid');
  });

  it('guards accept the authored slots and reject anything else', () => {
    for (const slot of COSMETIC_SLOTS) expect(isCosmeticSlot(slot)).toBe(true);
    for (const slot of SNAKE_COSMETIC_SLOTS) {
      expect(isSnakeCosmeticSlot(slot)).toBe(true);
    }
    for (const slot of PROFILE_COSMETIC_SLOTS) {
      expect(isSnakeCosmeticSlot(slot)).toBe(false);
    }
    for (const bad of ['', 'FACE', 'face ', 'wings', null, undefined, 7]) {
      expect(isCosmeticSlot(bad)).toBe(false);
      expect(isSnakeCosmeticSlot(bad)).toBe(false);
    }
  });
});

describe('migration 069 ships the catalog it says it ships', () => {
  it('seeds the two free launch cosmetics, both owned by everyone', () => {
    expect(sql).toContain("'face_shades_deadpan'");
    expect(sql).toContain("'crown_braids_amber'");
    // Constitution decision 13: a slot is never money-exclusive in kind. Both
    // launch entries are free, so the rule holds and keeps holding when the
    // Atelier adds beside them.
    const seed = sql.slice(
      sql.indexOf('INSERT INTO cosmetic_definitions (id, name, slot, rarity, default_owned, render)'),
      sql.indexOf('ON CONFLICT (id) DO NOTHING')
    );
    expect(seed).toContain("'face_shades_deadpan', 'Deadpan Shades', 'face', 'uncommon', TRUE");
    expect(seed).toContain("'crown_braids_amber',  'Amber Braids',   'crown', 'uncommon', TRUE");
  });

  it('ships no food-skin item and asserts the scaffold stays empty', () => {
    expect(sql).toContain('MIGRATION_069_FOOD_SKIN_SCAFFOLD_MUST_BE_EMPTY');
    expect(sql).not.toMatch(/'[a-z_]*egg[a-z_]*'\s*,\s*'[^']*'\s*,\s*'food_skin'/);
    expect(sql).not.toMatch(/'[a-z_]*cube[a-z_]*'\s*,\s*'[^']*'\s*,\s*'food_skin'/);
  });

  it('ships no supporter-only item, and never gates equip on a subscription', () => {
    // supporter_only is presentation. Entitlement is a player_cosmetics row,
    // so a lapsed Keeper keeps what they were granted (§10.2 lapse contract).
    expect(code).toContain('supporter_only BOOLEAN NOT NULL DEFAULT FALSE');
    expect(code).not.toMatch(/supporter_only\s*(=|,)\s*TRUE/i);
    const equipBody = code.slice(
      code.indexOf('CREATE OR REPLACE FUNCTION equip_cosmetic'),
      code.indexOf('COMMENT ON FUNCTION equip_cosmetic')
    );
    expect(equipBody.length).toBeGreaterThan(0);
    expect(equipBody).not.toContain('has_premium');
    expect(equipBody).not.toContain('supporter_only');
  });

  it('closes the 022 policy-without-GRANT gap on both player-keyed tables', () => {
    // A policy without a matching table grant is decorative: the privilege
    // check runs before the policy. This is the player_ladders (057) defect,
    // which 022 also carries for these two tables.
    for (const table of ['player_cosmetics', 'player_loadout']) {
      expect(sql).toContain(`REVOKE ALL ON ${table} FROM PUBLIC, anon, authenticated;`);
      expect(sql).toContain(`GRANT SELECT ON ${table} TO authenticated;`);
      // authenticated only — Supabase anonymous sign-in IS `authenticated`
      expect(sql).not.toContain(`GRANT SELECT ON ${table} TO anon`);
    }
  });

  it('asserts the ACL by naming the browser roles, never by trusting the grantor', () => {
    const functions = [
      'read_snake_loadout(UUID)',
      'read_snake_cosmetic_catalog(UUID)',
      'equip_cosmetic(UUID, TEXT, INTEGER, TEXT)',
    ];
    for (const fn of functions) {
      expect(sql).toContain(
        `REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC, anon, authenticated;`
      );
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${fn} TO service_role;`);
      expect(sql).not.toContain(`GRANT EXECUTE ON FUNCTION ${fn} TO authenticated;`);
    }
  });

  it('pins search_path on every SECURITY DEFINER function it defines', () => {
    const definers = code.match(/SECURITY DEFINER[^;]*/g) ?? [];
    expect(definers.length).toBeGreaterThanOrEqual(3);
    for (const clause of definers) {
      expect(clause).toContain('SET search_path = public');
    }
  });

  it('is one transaction and carries a forward-only down-note', () => {
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;/);
    expect(sql).toContain('DOWN-NOTE (forward-only');
  });
});

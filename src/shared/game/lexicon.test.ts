/**
 * The Lexicon registry — structure, coverage and the boundaries it keeps.
 *
 * `describe` is imported aliased: the registry's function and jest's global
 * share a name, and the global has to win inside this file.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ACTIVE_STRAIN_TIERS,
  COSTLESS_IDS,
  DOCUMENTED_SECTIONS,
  DYNASTY_IDS,
  MECHANIC_IDS,
  STRAIN_TIER_DORMANT,
  describe as describeEntry,
  lexiconSection,
  strainTierId,
  strainTierLabel,
  type LexiconCategory,
} from './lexicon';
import { GENES, GENOME_V2_GENES } from './genes';
import { GENOME_V2_SPLICE_IDS, GENOME_V2_STRAIN_LADDERS } from './genomeV2';
import { MUTATIONS } from './mutations';
import { STRAIN_IDS } from './strains';
import { TRAIT_POOL } from './traits';
import { ANOMALIES } from './anomalies';

const ALL_CATEGORIES: LexiconCategory[] = [
  'trait',
  'gene',
  'splice',
  'strain',
  'strainTier',
  'anomaly',
  'dynasty',
  'mechanic',
];

describe('describe()', () => {
  it('resolves every gene, because it reads GENES and not MUTATIONS', () => {
    // The trap this guards: a dozen of the 34 genes have no entry in
    // MUTATIONS at all, and reading that map instead would silently drop
    // them — along with every strain tag, since MUTATIONS carries none.
    // (The wave document says "15 of 34"; the tree says 12 of 34. The code
    // is the truth, and the count is asserted so a future gene addition
    // cannot quietly shrink this coverage.)
    const missingFromMutations = (Object.keys(GENES) as (keyof typeof GENES)[])
      .filter((id) => !(id in MUTATIONS));
    expect(missingFromMutations.length).toBe(12);
    expect(Object.keys(GENES)).toHaveLength(34);

    for (const id of Object.keys(GENES)) {
      const entry = describeEntry('gene', id);
      expect(entry).not.toBeNull();
      expect(entry!.name.length).toBeGreaterThan(0);
    }

    // And every Power a live v2 run can draw, which is the catalog the
    // published section now enumerates.
    for (const id of Object.keys(GENOME_V2_GENES)) {
      const entry = describeEntry('gene', id);
      expect(entry).not.toBeNull();
      expect(entry!.name.length).toBeGreaterThan(0);
    }

    // The two the spec names explicitly: one genome-era base gene and one
    // M10 dynasty signature. Both are absent from MUTATIONS. Both ids are
    // also in the v2 pool, so they answer with their v2 meaning — the one a
    // player can act on.
    expect(describeEntry('gene', 'loan_shark')).toMatchObject({
      kind: 'gene',
      name: 'Double or Nothing',
      strains: ['AURUM', 'UMBRA'],
    });
    expect(describeEntry('gene', 'heartwood')).toMatchObject({
      kind: 'gene',
      name: 'Roots',
      strains: ['FERAL'],
    });
  });

  it('returns null rather than guessing at an unknown id', () => {
    for (const kind of ALL_CATEGORIES) {
      expect(describeEntry(kind, 'not_a_real_id')).toBeNull();
      expect(describeEntry(kind, '')).toBeNull();
    }
    expect(describeEntry('strainTier', 'AURUM:0')).toBeNull();
    expect(describeEntry('strainTier', 'AURUM:4')).toBeNull();
    expect(describeEntry('strainTier', 'NOPE:1')).toBeNull();
  });

  it('carries a run notice only where a whole system is removed or dampened', () => {
    // Ascetic REMOVES mutation foods — the defect that started this WP.
    expect(describeEntry('trait', 'ascetic')!.runNotice).toEqual({
      tone: 'warning',
      text: expect.stringContaining('no mutation foods'),
    });
    // Patient DAMPENS the same system, so it informs rather than warns.
    expect(describeEntry('trait', 'patient')!.runNotice!.tone).toBe('notice');

    const noticed = TRAIT_POOL.filter(
      (id) => describeEntry('trait', id)!.runNotice
    );
    expect(noticed.sort()).toEqual(['ascetic', 'patient']);
  });
});

describe('lexiconSection()', () => {
  it('covers every catalog completely', () => {
    expect(lexiconSection('trait')).toHaveLength(TRAIT_POOL.length);
    // Powers and Combos publish the REACHABLE catalog, not the historical
    // one. Iterating the v1 tables advertised seven Combos whose parents had
    // left the pool — recipes no v2 run could ever complete.
    expect(lexiconSection('gene')).toHaveLength(Object.keys(GENOME_V2_GENES).length);
    expect(lexiconSection('splice')).toHaveLength(GENOME_V2_SPLICE_IDS.length);
    expect(lexiconSection('strain')).toHaveLength(STRAIN_IDS.length);
    expect(lexiconSection('anomaly')).toHaveLength(Object.keys(ANOMALIES).length);
    expect(lexiconSection('dynasty')).toHaveLength(DYNASTY_IDS.length);
    expect(lexiconSection('mechanic')).toHaveLength(MECHANIC_IDS.length);
    // Five families times three activation tiers.
    expect(lexiconSection('strainTier')).toHaveLength(
      STRAIN_IDS.length * ACTIVE_STRAIN_TIERS.length
    );
  });

  it('gives every entry a name and an effect, and a cost unless documented costless', () => {
    for (const kind of ALL_CATEGORIES) {
      for (const entry of lexiconSection(kind)) {
        expect(entry.kind).toBe(kind);
        expect(entry.name.trim().length).toBeGreaterThan(0);
        expect(entry.effect.trim().length).toBeGreaterThan(0);
        if (!entry.cost.trim()) {
          // An empty cost is a design statement, never missing copy.
          expect(COSTLESS_IDS).toContain(entry.id);
        }
      }
    }
  });

  it('keeps COSTLESS_IDS exact in both directions', () => {
    // A permit-list that is merely a superset lets a missing cost hide in
    // it. This asserts set equality, so growing a cost or adding a costless
    // entry both fail here until the list is updated.
    const empty = ALL_CATEGORIES.flatMap((kind) =>
      lexiconSection(kind)
        .filter((entry) => !entry.cost.trim())
        .map((entry) => entry.id)
    );
    expect(empty.sort()).toEqual([...COSTLESS_IDS].sort());
  });

  it('round-trips: every listed entry is retrievable by its own id', () => {
    for (const kind of ALL_CATEGORIES) {
      for (const entry of lexiconSection(kind)) {
        expect(describeEntry(kind, entry.id)).toEqual(entry);
      }
    }
  });

  it('documents the sections a signed-out visitor can read without an API', () => {
    // Genes and splices are excluded because their section carries a
    // discovery layer, not because their rules are secret.
    expect([...DOCUMENTED_SECTIONS].sort()).toEqual([
      'anomaly',
      'dynasty',
      'mechanic',
      'strain',
      'strainTier',
      'trait',
    ]);
  });
});

describe('strain tier labels', () => {
  it('names every rung from the one live ladder, and tier 0 from the lexicon', () => {
    // The v1 `STRAIN_TIER_NAMES` table named fifteen rungs the v2 ladder had
    // already replaced, so the meter and the Workbench called the same rung
    // two different things. There is now one source.
    for (const strain of STRAIN_IDS) {
      const ladder = GENOME_V2_STRAIN_LADDERS[strain];
      expect(strainTierLabel(strain, 0)).toBe(STRAIN_TIER_DORMANT);
      expect(strainTierLabel(strain, 1)).toBe(ladder[0].name);
      expect(strainTierLabel(strain, 2)).toBe(ladder[1].name);
      expect(strainTierLabel(strain, 3)).toBe(ladder[2].name);
      // Out-of-range input clamps rather than throwing — it comes from a HUD.
      expect(strainTierLabel(strain, 9)).toBe(ladder[2].name);
      expect(strainTierLabel(strain, -1)).toBe(STRAIN_TIER_DORMANT);
    }
  });

  it('names each tier by its Path, its level and its rung', () => {
    const entry = describeEntry('strainTier', strainTierId('FERAL', 2));
    expect(entry!.name).toBe('Coils II — Claim');
    expect(entry!.color).toBe(describeEntry('strain', 'FERAL')!.color);
  });

  it('is the only home for the tier name — StrainMeterHUD keeps no copy', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/game/StrainMeterHUD.tsx'),
      'utf8'
    );
    expect(source).toContain('strainTierLabel');
    expect(source).not.toContain('STRAIN_TIER_NAMES');
    expect(source).not.toMatch(/'Asleep'/);
  });
});

describe('category boundaries', () => {
  /**
   * `CodexDiscoveryType` is persisted in `player_codex.discovery_type` and
   * validated by the discovery RPC. Growing it would need a migration — and
   * would assert that traits, dynasties and mechanics are *discoverable*,
   * which they are not. `LexiconCategory` is therefore its own union, and
   * this test holds the two apart at the source level.
   */
  it('keeps LexiconCategory out of the persisted CodexDiscoveryType', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/shared/game/lexicon.ts'),
      'utf8'
    );
    // No import of the persisted union, in any form.
    expect(source).not.toMatch(/from\s+'@\/shared\/game\/codex'/);

    // And no *use* of it either: the only place the name may appear is the
    // comment that explains why the two unions are separate.
    const codeLines = source
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line));
    expect(codeLines.join('\n')).not.toContain('CodexDiscoveryType');
  });
});

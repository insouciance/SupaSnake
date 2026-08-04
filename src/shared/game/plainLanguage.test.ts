/**
 * The plain-language vocabulary, held mechanically.
 *
 * The rename is the easy half. The half that rots is the invariants that made
 * the rename necessary in the first place, and every one of them was violated
 * in shipped code before this file existed:
 *
 *  - two names for one thing (PASS and CONTINUE, Tactical Loom and Mutation
 *    Loom, THREAD and FORK for "take this");
 *  - one name for two things (Side Door was proposed for two different
 *    Powers in the same document);
 *  - effect lines long enough that the surface that shows them truncates;
 *  - a unit suffix appended twice, because two formatters both owned it.
 *
 * Each `describe` below is one of those failures, turned into a test.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GENOME_V2_GENES } from './genes';
import {
  GENOME_V2_SPLICES,
  GENOME_V2_SPLICE_IDS,
  GENOME_V2_STRAIN_LADDERS,
} from './genomeV2';
import { STRAINS, STRAIN_IDS } from './strains';
import { lexiconSection } from './lexicon';
import { genomeV2PresentationFormat } from '@/components/game/genome/genomeV2PresentationAdapter';

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

const POWER_IDS = Object.keys(GENOME_V2_GENES) as (keyof typeof GENOME_V2_GENES)[];

describe('every display name is unique across the whole vocabulary', () => {
  it('gives no two entities the same name', () => {
    // The concrete near-miss: ruling ④ awarded "Side Door" to `phase_gate`,
    // which had already been proposed for `mirror_wager`. Two Powers, one
    // name, and nothing in the build would have noticed.
    const named: { kind: string; id: string; name: string }[] = [
      ...STRAIN_IDS.map((id) => ({ kind: 'path', id, name: STRAINS[id].name })),
      ...POWER_IDS.map((id) => ({
        kind: 'power',
        id,
        name: GENOME_V2_GENES[id].name,
      })),
      ...GENOME_V2_SPLICE_IDS.map((id) => ({
        kind: 'combo',
        id,
        name: GENOME_V2_SPLICES[id].name,
      })),
      ...STRAIN_IDS.flatMap((strain) =>
        GENOME_V2_STRAIN_LADDERS[strain].map((tier) => ({
          kind: 'rung',
          id: `${strain}:${tier.points}`,
          name: tier.name,
        }))
      ),
    ];

    const byName = new Map<string, string[]>();
    for (const entry of named) {
      const owners = byName.get(entry.name) ?? [];
      owners.push(`${entry.kind}:${entry.id}`);
      byName.set(entry.name, owners);
    }
    const collisions = [...byName.entries()].filter(
      ([, owners]) => owners.length > 1
    );
    expect(collisions).toEqual([]);
  });

  it('names every entity, with no placeholder left behind', () => {
    for (const id of POWER_IDS) {
      expect(GENOME_V2_GENES[id].name.trim().length).toBeGreaterThan(0);
      expect(GENOME_V2_GENES[id].detail.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('one-liners fit the surface that shows them', () => {
  /**
   * 60 characters is the Drop's GAIN line at 390px. Past it the surface
   * truncates, and a truncated rule is a rule the player cannot act on — the
   * exact failure mode the plain-language pass exists to remove.
   */
  const LIMIT = 60;

  it.each(POWER_IDS)('%s effect is one readable line', (id) => {
    expect(GENOME_V2_GENES[id].effect.length).toBeLessThanOrEqual(LIMIT);
  });

  it.each(GENOME_V2_SPLICE_IDS)('%s rule is one readable line', (id) => {
    expect(GENOME_V2_SPLICES[id].rule.length).toBeLessThanOrEqual(LIMIT);
  });

  it.each(STRAIN_IDS)('%s ladder rules are one readable line each', (strain) => {
    for (const tier of GENOME_V2_STRAIN_LADDERS[strain]) {
      expect(tier.rule.length).toBeLessThanOrEqual(LIMIT);
    }
  });

  it.each(STRAIN_IDS)('%s identity is one readable line', (strain) => {
    expect(STRAINS[strain].identity.length).toBeLessThanOrEqual(LIMIT);
  });
});

describe('one verb per action on the decision surfaces', () => {
  /**
   * The uppercase forms only. Lowercase `pass`, `mutate` and `continue`
   * survive as identifiers and enum values on purpose — `onPass`,
   * `mutationLoom`, `'portal_continue'` are contract, and the `portal-pass`
   * and `portal-infuse` test ids deliberately lag their labels.
   */
  const RETIRED = /\b(PASS|INFUSE|MUTATE|CONTINUE)\b/;
  const SURFACES = [
    'src/components/game/PortalChoiceOverlay.tsx',
    'src/components/game/genome/TacticalLoomDecision.tsx',
    'src/components/growth/LandingPitch.tsx',
    'src/components/workbench/WorkbenchView.tsx',
  ];

  it.each(SURFACES)('%s shows none of the retired verbs', (path) => {
    const text = source(path)
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n');
    expect(text).not.toMatch(RETIRED);
  });

  it('keeps the enum values the retired verbs became', () => {
    // Renaming a label must never renumber a contract. `THREAD` and `FORK`
    // still travel with the decision; only `loomActionLabel` reaches a screen.
    const contract = source(
      'src/components/game/genome/tacticalLoomPresentation.ts'
    );
    expect(contract).toContain("'THREAD' | 'FORK' | 'DECLINE'");
  });

  it('keeps the test ids that intentionally lag their labels', () => {
    const portal = source('src/components/game/PortalChoiceOverlay.tsx');
    expect(portal).toContain('data-testid="portal-pass"');
    expect(portal).toContain('data-testid="portal-infuse"');
    const workbench = source('src/components/workbench/WorkbenchView.tsx');
    expect(workbench).toContain('data-testid="workbench-infuse"');
    expect(workbench).toContain('data-testid="workbench-recode"');
  });
});

describe('a payout figure carries its unit exactly once', () => {
  it('appends one suffix, and the short form appends none', () => {
    const long = genomeV2PresentationFormat.scaledYield(420_000);
    expect(long.match(/Payout/g)).toHaveLength(1);
    expect(long).not.toMatch(/Yield/);

    const short = genomeV2PresentationFormat.scaledYield(420_000, {
      short: true,
    });
    expect(short).not.toMatch(/Payout|Yield/);
    // Same number, same rounding — only the suffix differs.
    expect(short.replace(/P$/, '')).toBe(long.replace(/ Payout$/, ''));
  });

  it('leaves no caller re-appending the unit the formatter already added', () => {
    const workbench = source('src/components/workbench/WorkbenchView.tsx');
    expect(workbench).not.toMatch(/scaledYield\([^)]*\)\}\s*Yield/);
    expect(workbench).not.toContain('Yield Yield');
  });

  it('keeps one implementation, not a private copy per surface', () => {
    const rail = source(
      'src/components/game/genome/genomeV2BoardPresentation.ts'
    );
    expect(rail).toContain('genomeV2PresentationFormat.scaledYield');
    expect(rail).not.toMatch(/GENOME_V2_YIELD_SCALE\}Y`/);
  });
});

describe('the glossary is reachable', () => {
  it('publishes the three portal verbs a signed-out player must read', () => {
    const mechanics = lexiconSection('mechanic');
    const byId = new Map(mechanics.map((entry) => [entry.id, entry]));
    expect(byId.get('extraction_bank')?.name).toBe('BANK');
    expect(byId.get('extraction_pass')?.name).toBe('RIDE ON');
    expect(byId.get('extraction_infuse')?.name).toBe('TRADE UP');
    for (const entry of mechanics) {
      expect(entry.effect.trim().length).toBeGreaterThan(0);
    }
  });

  it('is rendered by a route rather than only by a test', () => {
    // This module was authored, unit-tested and never mounted. The one thing
    // that guarantees a glossary is a glossary is that a page calls it.
    const codex = source('src/app/codex/page.tsx');
    expect(codex).toContain("lexiconSection('mechanic')");
    expect(codex).toContain('data-testid="codex-mechanics"');
  });

  it('publishes only Combos a run can actually reach', () => {
    // Seven of the ten v1 recipes have parents outside the v2 pool. A Codex
    // that lists them is advertising something nobody can make.
    const published = lexiconSection('splice').map((entry) => entry.id);
    expect(published.sort()).toEqual([...GENOME_V2_SPLICE_IDS].sort());
  });
});

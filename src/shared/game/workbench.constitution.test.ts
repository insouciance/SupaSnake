/**
 * THE TWO THINGS THE WORKBENCH IS NOT ALLOWED TO BE (WP-2.08).
 *
 * A build calculator is the single most dangerous place in this codebase to
 * quietly break two of the Inviolable Rules, because both breaks would look
 * like features:
 *
 *   RULE 2 — Score is independent of genes, traits and anomalies. A calculator
 *   that projected Score would be asserting the exact opposite of that rule in
 *   the one place a player would believe it, and it would do so before they
 *   ever pressed START. So `WorkbenchReading` carries no `score` field in any
 *   shape it can produce, and `workbench.ts` does not so much as import the
 *   score constant. Both halves are asserted here: the runtime shape, because
 *   a type can be widened; and the SOURCE, because a field can be added under
 *   another name.
 *
 *   RULE 1 — nothing intrudes on a live run. The Workbench is a planning
 *   surface; the arena is not a place to plan. This file walks the real import
 *   graph out of `src/app/game/page.tsx` and asserts that nothing under
 *   `src/components/workbench/` is reachable from it — an assertion no amount
 *   of careful reviewing keeps true on its own, because one convenient import
 *   three modules deep is all it takes.
 *
 * Neither test asserts a comment or a convention. Both read what ships.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import {
  EMPTY_PLAN,
  rankInventory,
  readWorkbench,
  suggestPlan,
  type WorkbenchAccount,
  type WorkbenchPlan,
  type WorkbenchReading,
  type WorkbenchSnake,
} from '@/shared/game/workbench';
import type { GeneId } from '@/shared/game/genes';
import { conditionFromAnomaly, type ConditionInput } from '@/shared/game/worldCondition';

const ROOT = process.cwd();

// ---------------------------------------------------------------------------
// Rule 2 — no Score, in any shape, under any name
// ---------------------------------------------------------------------------

/**
 * Every key on every object a reading contains, at any depth.
 *
 * Deliberately keys and not values: the condition summary is prose that may
 * legitimately contain any word, while a KEY called `score` — or `bestScore`,
 * or `projectedScore` — is a projection no matter what it is called.
 */
function deepKeys(value: unknown, seen = new Set<unknown>()): string[] {
  if (value === null || typeof value !== 'object') return [];
  if (seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((entry) => deepKeys(entry, seen));
  const keys: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    keys.push(key);
    keys.push(...deepKeys(child, seen));
  }
  return keys;
}

const VETERAN: WorkbenchAccount = {
  bankedRuns: 40,
  ownedVariants: 6,
  seasonalGeneIds: [],
  gauntletBan: null,
  runFoods: [40, 90, 120, 60, 150],
};

/** A brand-new account: FTUE ramp closed, no history, so no median or best. */
const NEWCOMER: WorkbenchAccount = {
  bankedRuns: 0,
  ownedVariants: 1,
  seasonalGeneIds: [],
  gauntletBan: null,
  runFoods: [],
};

function snake(over: Partial<WorkbenchSnake> = {}): WorkbenchSnake {
  return {
    id: 'snake-1',
    name: 'Vyper',
    dynasty: 'CYBER',
    generation: 4,
    traits: [],
    lineage: null,
    masteryLevel: 10,
    ...over,
  };
}

const AURUM_FOUR: GeneId[] = ['gold_trail', 'compound_interest', 'loan_shark', 'tithe'];

/**
 * The shapes a reading can take, chosen to cover every branch in
 * `readWorkbench` that produces a differently-shaped object: no plan, a plan
 * with fusions, a plan with infuses, a blocked pool, a capped FTUE account, a
 * lineage, a Gauntlet ban and a full week condition with a clause.
 */
const SHAPES: Array<{
  name: string;
  snake: WorkbenchSnake;
  plan: WorkbenchPlan;
  account: WorkbenchAccount;
  condition: ConditionInput;
}> = [
  {
    name: 'the empty plan on a veteran account',
    snake: snake(),
    plan: EMPTY_PLAN,
    account: VETERAN,
    condition: null,
  },
  {
    name: 'a four-gene AURUM plan',
    snake: snake(),
    plan: { genes: AURUM_FOUR, infuses: 0 },
    account: VETERAN,
    condition: null,
  },
  {
    name: 'a plan carrying infuses',
    snake: snake(),
    plan: { genes: AURUM_FOUR, infuses: 2 },
    account: VETERAN,
    condition: null,
  },
  {
    name: 'a newcomer with no run history at all',
    snake: snake({ masteryLevel: 0 }),
    plan: { genes: AURUM_FOUR, infuses: 0 },
    account: NEWCOMER,
    condition: null,
  },
  {
    name: 'an Ascetic snake, whose pool is blocked outright',
    snake: snake({ traits: ['ascetic'] }),
    plan: { genes: AURUM_FOUR, infuses: 1 },
    account: VETERAN,
    condition: null,
  },
  {
    name: 'a snake with a lineage under a Gauntlet ban',
    snake: snake({ lineage: { strains: ['AURUM'], strength: 2 } }),
    plan: { genes: AURUM_FOUR, infuses: 0 },
    account: { ...VETERAN, gauntletBan: 'gene:gold_trail' },
    condition: null,
  },
  {
    name: 'a full week condition with an anomaly',
    snake: snake({ dynasty: 'PRIMAL' }),
    plan: { genes: AURUM_FOUR, infuses: 1 },
    account: VETERAN,
    condition: conditionFromAnomaly('gold_rush'),
  },
];

describe('Rule 2 — the Workbench does not project Score, in any shape', () => {
  for (const shape of SHAPES) {
    it(`carries no score-shaped field: ${shape.name}`, () => {
      const reading: WorkbenchReading = readWorkbench(
        shape.snake,
        shape.plan,
        shape.account,
        shape.condition
      );

      // The declared contract first: the field the rule names is absent.
      expect(Object.prototype.hasOwnProperty.call(reading, 'score')).toBe(false);
      expect((reading as Record<string, unknown>).score).toBeUndefined();

      // Then the whole tree, so a rename cannot smuggle one back in.
      const offenders = deepKeys(reading).filter((key) => /score/i.test(key));
      expect(offenders).toEqual([]);
    });
  }

  it('carries no score-shaped field anywhere in the inventory ranking either', () => {
    const ranked = rankInventory(
      [snake(), snake({ id: 'snake-2', dynasty: 'COSMIC', name: 'Nadir' })],
      { genes: AURUM_FOUR, infuses: 1 },
      VETERAN,
      conditionFromAnomaly('gold_rush')
    );
    expect(ranked.length).toBeGreaterThan(0);
    expect(deepKeys(ranked).filter((key) => /score/i.test(key))).toEqual([]);
  });

  it('carries no score-shaped field on a suggested plan', () => {
    const reading = readWorkbench(
      snake(),
      suggestPlan(
        readWorkbench(snake(), EMPTY_PLAN, VETERAN, null).pool,
        null,
        'AURUM'
      ),
      VETERAN,
      null
    );
    expect(deepKeys(reading).filter((key) => /score/i.test(key))).toEqual([]);
  });

  /**
   * The source half. A runtime shape can only prove what the fixtures reached;
   * the import list proves the module has no ACCESS to the score fold at all,
   * which is the stronger statement and the one that survives refactoring.
   */
  it('the module imports neither the score constant nor the score multiplier', () => {
    const source = readFileSync(join(ROOT, 'src/shared/game/workbench.ts'), 'utf8');

    // Strip the module header and every other comment: the header EXPLAINS
    // this rule in prose, and a gate that its own rationale trips is a gate
    // that gets deleted.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    // Prove the strip left the code behind before trusting what it does not
    // find — a regex that ate the file would pass every assertion below.
    expect(code).toMatch(/computeGenomeRunTotals/);
    expect(code).toMatch(/applyGenomeOutcome/);

    expect(code).not.toMatch(/FOOD_BASE_SCORE/);
    expect(code).not.toMatch(/scoreMultiplier/);
    expect(code).not.toMatch(/\bcomputeRunTotals\b/);

    // And the prose the rule rests on is still in the file, because a comment
    // that is deleted is a rule the next author never learns.
    expect(source).toMatch(/SCORE\./);
  });

  it('no Workbench code was added to the two files the CI score gate guards', () => {
    for (const guarded of [
      'src/shared/game/rulesets.ts',
      'src/lib/game/SnakeGameLogic.ts',
    ]) {
      const source = readFileSync(join(ROOT, guarded), 'utf8');
      expect(source).not.toMatch(/workbench/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Rule 1 — the arena is not a planning surface
// ---------------------------------------------------------------------------

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/** Resolve one import specifier to a file under `src`, or null if it leaves. */
function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) {
    base = join(ROOT, 'src', specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = resolve(dirname(fromFile), specifier);
  } else {
    // A package. Nothing in node_modules can reach src/components/workbench.
    return null;
  }

  for (const ext of SOURCE_EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of SOURCE_EXTENSIONS) {
      const index = join(base, `index${ext}`);
      if (existsSync(index)) return index;
    }
  }
  return existsSync(base) && statSync(base).isFile() ? base : null;
}

/**
 * Every specifier a file imports — static `import`, `export … from` and
 * `import()`. Type-only imports are INCLUDED deliberately: they are erased at
 * build time, but a type-only edge is still a coupling, and today's
 * `import type` is tomorrow's value import when somebody needs the helper next
 * to the type.
 */
function specifiersOf(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(source);
    while (match !== null) {
      found.push(match[1]);
      match = pattern.exec(source);
    }
  }
  return found;
}

/** Everything reachable from an entry file, with the path that got there. */
function reachableFrom(entry: string): Map<string, string[]> {
  const trail = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const path = trail.get(current) as string[];
    let source: string;
    try {
      source = readFileSync(current, 'utf8');
    } catch {
      continue;
    }
    for (const specifier of specifiersOf(source)) {
      const next = resolveImport(current, specifier);
      if (next === null || trail.has(next)) continue;
      trail.set(next, [...path, next]);
      queue.push(next);
    }
  }
  return trail;
}

const GAME_PAGE = join(ROOT, 'src/app/game/page.tsx');
const WORKBENCH_COMPONENTS = join(ROOT, 'src/components/workbench') + '/';

describe('Rule 1 — no Workbench surface is reachable from a live run', () => {
  it('the walker actually walks: the game page reaches the engine', () => {
    // A graph test that silently resolved nothing would pass for the wrong
    // reason forever, so prove the walker works before trusting its verdict.
    const reached = reachableFrom(GAME_PAGE);
    expect(reached.size).toBeGreaterThan(20);
    expect(reached.has(join(ROOT, 'src/lib/game/SnakeGameLogic.ts'))).toBe(true);
    expect(reached.has(join(ROOT, 'src/shared/game/rulesets.ts'))).toBe(true);

    // And it walks TRANSITIVELY, not just the entry file's own import list —
    // otherwise an intrusion three modules deep, which is the only kind that
    // ever actually happens, would sail through.
    const deepest = Math.max(...[...reached.values()].map((path) => path.length));
    expect(deepest).toBeGreaterThan(3);
  });

  it('nothing under src/components/workbench/ is reachable from /game', () => {
    const reached = reachableFrom(GAME_PAGE);
    const intruders = [...reached.entries()]
      .filter(([file]) => file.startsWith(WORKBENCH_COMPONENTS))
      .map(([, path]) => path.map((file) => file.slice(ROOT.length + 1)).join('\n  → '));

    expect(intruders).toEqual([]);
  });

  it('and no Workbench component reaches the run engine in the other direction', () => {
    // The mirror of the same rule, and the one that catches the intrusion
    // EARLY: a planning component that already imports `SnakeGameLogic` or the
    // game store is one convenient refactor away from being mounted inside a
    // run. The edge is forbidden from both ends.
    if (!existsSync(WORKBENCH_COMPONENTS)) return;

    const forbidden = [
      join(ROOT, 'src/lib/game/SnakeGameLogic.ts'),
      join(ROOT, 'src/app/game/page.tsx'),
    ];
    const offences: string[] = [];
    for (const entry of readdirSync(WORKBENCH_COMPONENTS)) {
      if (!SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) continue;
      const reached = reachableFrom(join(WORKBENCH_COMPONENTS, entry));
      for (const target of forbidden) {
        const path = reached.get(target);
        if (path) offences.push(path.map((f) => f.slice(ROOT.length + 1)).join('\n  → '));
      }
    }
    expect(offences).toEqual([]);
  });
});

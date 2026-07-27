/**
 * THE BUILD CODE REFUSES (WP-2.08).
 *
 * The interesting half of a codec that renders a public page is not what it
 * decodes — it is what it declines to. `decodeBuildCode` returns `null` for
 * anything malformed and NEVER repairs, so the refusal table below is the
 * specification rather than a sample: every row is a code a stranger could
 * type into the address bar, and every row must 404 rather than render a card
 * of guesses.
 *
 * The second half of this file asserts the constraint the SPEC is built
 * around: no build card, in any shape, carries a projected Yield. A build code
 * is forgeable, so a Yield number on one would be a leaderboard-shaped claim
 * arriving through a channel that settles nothing (Rule 11), and Score is
 * independent of build by Rule 2.
 */

import {
  MAX_BUILD_CODE,
  MAX_BUILD_GENES,
  MAX_BUILD_INFUSES,
  buildCondition,
  buildContextName,
  buildGeneNames,
  buildStrainReach,
  decodeBuildCode,
  encodeBuildCode,
  type BuildCardModel,
} from '@/lib/share/buildCode';
import { buildCardModelFor } from '@/lib/share/artifactCards';
import { buildArtifactPath, buildArtifactUrl, buildShare } from '@/lib/share/artifactUrls';
import { GENE_POOL, type GeneId } from '@/shared/game/genes';

const AURUM_FOUR: GeneId[] = ['gold_trail', 'compound_interest', 'loan_shark', 'tithe'];

const PLAN: BuildCardModel = {
  snakeName: 'Vyper',
  dynasty: 'CYBER',
  generation: 4,
  genes: AURUM_FOUR,
  anomaly: 'gold_rush',
  clause: 'clause:deep_apex',
  infuses: 2,
};

describe('a build code round-trips the plan exactly, order included', () => {
  it('encodes seven tilde-separated fields', () => {
    const code = encodeBuildCode(PLAN);
    expect(code.split('~')).toHaveLength(7);
    expect(code).toBe(
      'Vyper~CYBER~4~gold_trail%2Ccompound_interest%2Cloan_shark%2Ctithe~gold_rush~clause%3Adeep_apex~2'
    );
  });

  it('decodes back to the same plan', () => {
    expect(decodeBuildCode(encodeBuildCode(PLAN))).toEqual(PLAN);
  });

  it('preserves PICK ORDER — the order is the plan', () => {
    const reversed = { ...PLAN, genes: [...AURUM_FOUR].reverse() };
    const forward = decodeBuildCode(encodeBuildCode(PLAN));
    const backward = decodeBuildCode(encodeBuildCode(reversed));
    expect(forward?.genes).toEqual(AURUM_FOUR);
    expect(backward?.genes).toEqual([...AURUM_FOUR].reverse());
    expect(forward?.genes).not.toEqual(backward?.genes);
  });

  it('accepts a neutral week — an empty context field is a real plan', () => {
    const neutral: BuildCardModel = {
      ...PLAN,
      anomaly: null,
      clause: null,
      infuses: 0,
    };
    const code = encodeBuildCode(neutral);
    expect(code.split('~')).toHaveLength(7);
    expect(decodeBuildCode(code)).toEqual(neutral);
  });

  it('accepts an empty plan — no genes named claims nothing', () => {
    const empty: BuildCardModel = { ...PLAN, genes: [], infuses: 0 };
    expect(decodeBuildCode(encodeBuildCode(empty))).toEqual(empty);
  });

  it('survives a name that needs percent-encoding, separator included', () => {
    const awkward: BuildCardModel = { ...PLAN, snakeName: 'a~b c/d?e&f' };
    const code = encodeBuildCode(awkward);
    expect(code.split('~')).toHaveLength(7);
    expect(decodeBuildCode(code)?.snakeName).toBe('a~b c/d?e&f');
  });

  it('decodes a segment whose separators are still percent-encoded', () => {
    // A hand-typed or chat-mangled link can arrive with `~` written as `%7E`.
    // Next hands route params already decoded once, so the ordinary path is
    // the branch above; this is the one that arrives raw.
    expect(decodeBuildCode(encodeBuildCode(PLAN).replace(/~/g, '%7E'))).toEqual(PLAN);
  });

  it('refuses a doubly-encoded code rather than peeling it', () => {
    // `encodeURIComponent` leaves `~` alone, so a double-encode escapes the
    // percent signs INSIDE the fields while leaving the separators bare. The
    // result names genes that do not exist, and inventing the un-escaping a
    // second time would be exactly the repair this decoder refuses to do.
    expect(decodeBuildCode(encodeURIComponent(encodeBuildCode(PLAN)))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The refusal table
// ---------------------------------------------------------------------------

const VALID = encodeBuildCode(PLAN);
const OVERLONG_GENES = GENE_POOL.slice(0, MAX_BUILD_GENES + 2).join(',');

const REFUSALS: Array<[string, unknown]> = [
  ['six fields — one short of the format', 'Vyper~CYBER~4~gold_trail~gold_rush~clause%3Adeep_apex'],
  ['eight fields — one too many', `${VALID}~extra`],
  ['four fields — a lineage code, which is a different thing', 'Vyper~CYBER~4~gold_trail'],
  ['no separators at all', 'garbage'],
  ['an unknown dynasty', 'Vyper~EMBER~4~gold_trail~~~0'],
  ['a lowercase dynasty — this decoder does not normalise', 'Vyper~cyber~4~gold_trail~~~0'],
  ['an empty dynasty', 'Vyper~~4~gold_trail~~~0'],
  ['generation 0', 'Vyper~CYBER~0~gold_trail~~~0'],
  ['a negative generation', 'Vyper~CYBER~-1~gold_trail~~~0'],
  ['a non-numeric generation', 'Vyper~CYBER~four~gold_trail~~~0'],
  ['a generation past the bound', 'Vyper~CYBER~99999~gold_trail~~~0'],
  ['a gene that is not in GENES', 'Vyper~CYBER~4~gold_trail%2Cnot_a_gene~~~0'],
  ['a gene list that is entirely invented', 'Vyper~CYBER~4~alpha%2Cbeta~~~0'],
  ['the same gene twice — a run cannot pick one gene twice', 'Vyper~CYBER~4~tithe%2Ctithe~~~0'],
  [`more than ${MAX_BUILD_GENES} genes`, `Vyper~CYBER~4~${encodeURIComponent(OVERLONG_GENES)}~~~0`],
  ['an unknown clause id', 'Vyper~CYBER~4~tithe~~clause%3Ainvented~0'],
  ['a clause without its namespace prefix', 'Vyper~CYBER~4~tithe~~deep_apex~0'],
  ['an unknown anomaly', 'Vyper~CYBER~4~tithe~heat_death~~0'],
  ['a deprecated anomaly this build no longer knows', 'Vyper~CYBER~4~tithe~ember_storm~~0'],
  ['an empty name', '~CYBER~4~tithe~~~0'],
  ['a name that is only whitespace', '%20%20~CYBER~4~tithe~~~0'],
  [`more than ${MAX_BUILD_INFUSES} infuses`, 'Vyper~CYBER~4~tithe~~~9'],
  ['a non-numeric infuse count', 'Vyper~CYBER~4~tithe~~~two'],
  ['a negative infuse count', 'Vyper~CYBER~4~tithe~~~-1'],
  ['an empty infuse field', 'Vyper~CYBER~4~tithe~~~'],
  ['an over-length code', `${'V'.repeat(MAX_BUILD_CODE + 1)}~CYBER~4~tithe~~~0`],
  ['the empty string', ''],
  ['a number', 4],
  ['null', null],
  ['undefined', undefined],
  ['an object', { snakeName: 'Vyper' }],
  ['a malformed percent escape with no separator to save it', '%E0%A4%A'],
];

describe('the refusal table — every malformed code returns null, none is repaired', () => {
  for (const [why, code] of REFUSALS) {
    it(`refuses ${why}`, () => {
      expect(decodeBuildCode(code)).toBeNull();
    });
  }

  it('the valid code the table is built around still decodes', () => {
    // Without this the table could pass by refusing everything, including a
    // legal code, and nobody would notice until the route 404'd in production.
    expect(decodeBuildCode(VALID)).toEqual(PLAN);
  });

  it('refuses rather than truncating an over-long gene list', () => {
    // The distinction the whole file rests on: `decodeLineageCode` truncates a
    // portrait's gene list, because a portrait with fewer genes is still that
    // snake. A truncated PLAN is a different plan.
    const code = `Vyper~CYBER~4~${encodeURIComponent(OVERLONG_GENES)}~~~0`;
    expect(decodeBuildCode(code)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The card carries no projected Yield, in any shape
// ---------------------------------------------------------------------------

const CARD_SHAPES: BuildCardModel[] = [
  PLAN,
  { ...PLAN, genes: [], anomaly: null, clause: null, infuses: 0 },
  { ...PLAN, genes: AURUM_FOUR, anomaly: null, clause: 'clause:aurum_dampened' },
  { ...PLAN, genes: GENE_POOL.slice(0, MAX_BUILD_GENES) as GeneId[], infuses: MAX_BUILD_INFUSES },
  { ...PLAN, dynasty: 'PRIMAL', generation: 1, infuses: 0 },
  { ...PLAN, dynasty: 'COSMIC', generation: 9999 },
];

describe('a build card is a recipe, never evidence', () => {
  for (const model of CARD_SHAPES) {
    it(`quotes no Yield and no Score: ${model.dynasty} / ${model.genes.length} genes`, () => {
      const card = buildCardModelFor(model);
      const text = [card.kicker, card.title, card.subtitle, card.callToAction]
        .concat((card.stats ?? []).map((stat) => `${stat.label} ${stat.value}`))
        .join(' ');

      expect(text).not.toMatch(/\byield\b/i);
      expect(text).not.toMatch(/\bscore\b/i);
      expect(text).not.toMatch(/\bDNA\b/);
      expect(card.stats?.some((stat) => /yield|score|dna/i.test(stat.label))).toBe(false);

      // And it is honest about where its facts came from.
      expect(card.provenance).toBe('claimed');
    });
  }

  it('carries the strain reach and the context instead of a number', () => {
    const card = buildCardModelFor(PLAN);
    expect(card.kicker).toContain('Build');
    expect(card.kicker).toContain(buildContextName(PLAN));
    expect(card.subtitle).toBe(buildGeneNames(PLAN).join(' → '));
    const reach = buildStrainReach(PLAN);
    const strainStat = card.stats?.find((stat) => /^Strains?$/.test(stat.label));
    expect(strainStat).toBeDefined();
    expect(strainStat?.value).toBe(reach.map((entry) => entry.label).join(' · '));
  });

  it('carries no commercial surface (Rule 7) and implies no loss (Rules 5 and 6)', () => {
    for (const model of CARD_SHAPES) {
      const card = buildCardModelFor(model);
      const text = [card.kicker, card.title, card.subtitle, card.callToAction]
        .concat((card.stats ?? []).map((stat) => `${stat.label} ${stat.value}`))
        .join(' ');
      expect(text).not.toMatch(/\b(buy|shop|store|upgrade|premium|subscribe|sale)\b/i);
      expect(text).not.toMatch(/[€$]\s?\d/);
      expect(text).not.toMatch(/\b(lost|expired|forfeit|decayed|dropped to)\b/i);
    }
  });

  it('the share payload carries no number the game never produced', () => {
    const share = buildShare({
      code: VALID,
      snakeName: PLAN.snakeName,
      dynasty: PLAN.dynasty,
      generation: PLAN.generation,
      geneNames: buildGeneNames(PLAN),
      contextName: buildContextName(PLAN),
      infuses: PLAN.infuses,
    });
    expect(share.text).not.toMatch(/\byield\b/i);
    expect(share.text).not.toMatch(/\bscore\b/i);
    // The WP-0.08 lesson: the URL is the last line of `text`, not only `url`.
    expect(share.text.split('\n').pop()).toBe(share.url);
    expect(share.url).toBe(buildArtifactUrl(VALID));
  });
});

// ---------------------------------------------------------------------------
// The strain reach is the engine's, not a second implementation
// ---------------------------------------------------------------------------

describe('the strain reach comes from the engine resolver', () => {
  it('reports the strains four AURUM genes actually reach', () => {
    const reach = buildStrainReach(PLAN);
    expect(reach.length).toBeGreaterThan(0);
    expect(reach.map((entry) => entry.strain)).toContain('AURUM');
    for (const entry of reach) {
      expect(entry.tier).toBeGreaterThanOrEqual(1);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it('reports nothing for an empty plan', () => {
    expect(buildStrainReach({ ...PLAN, genes: [] })).toEqual([]);
  });

  it("honours the week's clause — a dampening clause lowers the reach", () => {
    const plain = buildStrainReach({ ...PLAN, anomaly: null, clause: null });
    const dampened = buildStrainReach({
      ...PLAN,
      anomaly: null,
      clause: 'clause:aurum_dampened',
    });
    const aurumOf = (reach: ReturnType<typeof buildStrainReach>) =>
      reach.find((entry) => entry.strain === 'AURUM')?.tier ?? 0;
    // The clause shifts AURUM's thresholds upward, so the same plan cannot
    // reach further under it than without it.
    expect(aurumOf(dampened)).toBeLessThanOrEqual(aurumOf(plain));
  });

  it('composes the condition from the anomaly and the clause together', () => {
    const condition = buildCondition(PLAN);
    expect(condition.anomaly).toBe('gold_rush');
    expect(condition.clauses.map((clause) => clause.id)).toEqual(['clause:deep_apex']);
  });
});

describe('the seventh artifact path', () => {
  it('addresses a build at /b/<code>', () => {
    expect(buildArtifactPath(VALID)).toBe(`/b/${encodeURIComponent(VALID)}`);
    expect(buildArtifactUrl(VALID)).toContain(`/b/${encodeURIComponent(VALID)}`);
  });

  it('does not collide with the lineage path', () => {
    expect(buildArtifactPath(VALID).startsWith('/x/')).toBe(false);
  });
});

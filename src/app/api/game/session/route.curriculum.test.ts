/**
 * The curriculum's two touch points in the session route (WP-B).
 *
 * Both are structural properties that a behavioural test cannot state as
 * clearly as the source can, and both are the kind of thing a later edit
 * breaks silently:
 *
 *   - AT START, the vocabulary is composed once, from server-read eligibility,
 *     and stamped. Free Play, the flag being off, and absent infrastructure all
 *     land on the same untouched `genomeV2ActivePool(startDynasty)`.
 *   - AT SETTLEMENT, the trial comes from the START STAMP and the resolution
 *     comes from the VALIDATED RECORD. Vocabulary is never recomputed and the
 *     compacting journal is never scanned.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from '@jest/globals';

const source = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
/**
 * The promotion moved out of this route (WP-D, deduplicated by WP-F): it
 * lives in the durable settlement, which is the only caller the recovery
 * sweep also reaches and the only one that can emit the REVEAL. The
 * structural assertions below follow it there rather than being dropped.
 */
const settlementSource = fs.readFileSync(
  path.join(__dirname, '../../../../lib/server/gameProgressionSettlement.ts'),
  'utf8'
);

describe('run start: composing the vocabulary', () => {
  it('reads eligibility server-side, and only when the curriculum is live', () => {
    expect(source).toMatch(
      /const curriculumLive =\s*\n?\s*playerEvolutionEnabled\(\) && !isFreePlay/
    );
    expect(source).toMatch(
      /const eligibility = curriculumLive\s*\n?\s*\? await readGeneEligibility\(supabase, player\.id\)\s*\n?\s*: null/
    );
    // There is no request field through which eligibility could arrive.
    expect(source).not.toMatch(/body\.\w*[eE]ligib/);
    expect(source).not.toMatch(/eligibleGeneIds\s*=\s*body/);
  });

  it('falls back to the complete Dynasty roster on every unavailable path', () => {
    expect(source).toMatch(/let genePool = genomeV2ActivePool\(startDynasty\)/);
    expect(source).toMatch(/if \(eligibility\?\.available\) \{/);
    expect(source).toMatch(
      /genePool = genomeV2PlayableVocabulary\(startDynasty, facts\)/
    );
  });

  it('leaves the Apex tier ramp exactly where it was', () => {
    // Ruling 1 deleted the Signature's OFFER lock. Apex tier activation, which
    // binds the economy through `tierCap`, keeps its ramp.
    expect(source).toMatch(
      /tierCap: ftue\.apexesUnlocked\s*\n?\s*\? 3\s*\n?\s*: ftue\.expressionsUnlocked\s*\n?\s*\? 2\s*\n?\s*: 1/
    );
  });

  it('stamps the same block on the manifest and on the run context', () => {
    expect(source).toMatch(
      /const eligibilityBlock = eligibilityStamp\s*\n?\s*\? \{/
    );
    expect(source).toMatch(
      /eligibilityContractVersion:\s*\n?\s*GENOME_V2_ELIGIBILITY_CONTRACT_VERSION/
    );
    expect(source).toMatch(
      /learningEventVersion: GENOME_V2_LEARNING_EVENT_VERSION/
    );
    expect(source).toMatch(/eligibilityInputs: eligibilityStamp/);
    // Once into the client manifest, once into the durable stamp.
    expect(source.match(/\.\.\.eligibilityBlock,/g)).toHaveLength(2);
  });

  it('seeds the starter rows for the Dynasty actually being played, once', () => {
    expect(source).toMatch(
      /await grantStarterEligibility\(\s*\n?\s*supabase,\s*\n?\s*player\.id,\s*\n?\s*GENOME_V2_STARTER_POOLS\[startDynasty\]\s*\n?\s*\)/
    );
    // The RPC is DO-NOTHING-on-conflict, so an unconditional call would be
    // correct — and a round trip on the hot path that inserts nothing.
    expect(source).toMatch(
      /GENOME_V2_STARTER_POOLS\[startDynasty\]\.some\(\s*\n?\s*\(geneId\) => !held\.has\(geneId\)\s*\n?\s*\)/
    );
  });

  it('writes the legacy context version and lets serialization derive the real one', () => {
    expect(source).toMatch(/v: RUN_CONTEXT_LEGACY_VERSION,/);
    expect(source).not.toMatch(/v: RUN_CONTEXT_VERSION,/);
  });
});

describe('settlement: resolving a learning event', () => {
  it('takes the trial from the start stamp, never from a fresh read', () => {
    expect(source).toMatch(
      /const stampedTrialGeneId =\s*\n?\s*runContext\?\.genome\?\.rulesVersion === GENOME_RULES_V2/
    );
    expect(source).toMatch(
      /\? runContext\.genome\.eligibilityInputs\?\.trialGeneId \?\? null/
    );
    // Exactly one eligibility read in the whole route, and it is at start.
    expect(source.match(/readGeneEligibility\(/g)).toHaveLength(1);
    expect(
      source.indexOf('readGeneEligibility(supabase, player.id)')
    ).toBeLessThan(source.indexOf('const stampedTrialGeneId'));
    // The settlement's own trial also comes from the stamp, read out of the
    // run's stored context rather than from today's eligibility rows.
    expect(settlementSource).toMatch(
      /const parsed = parseRunStartContext\(runContextRaw\)/
    );
    expect(settlementSource).toMatch(/const trialGeneId = inputs\.trialGeneId/);
  });

  it('reads the resolution from the validated record and never from the journal', () => {
    // The journal compacts above 256 entries, so a scan for "did event X
    // happen" answers false for exactly the long runs an engaged learner
    // produces. The resolution is a reducer-written state field instead.
    expect(settlementSource).toMatch(
      /const resolvedRaw = settledGenome\?\.learningEventsResolved/
    );
    const promotion = settlementSource.slice(
      settlementSource.indexOf('function readCurriculumFacts'),
      settlementSource.indexOf('await resolveLearningEvent(')
    );
    expect(promotion.length).toBeGreaterThan(0);
    expect(promotion).not.toContain('.journal');
  });

  it('promotes only from a validated run, and never from this route', () => {
    // `validated` is the settlement snapshot's own flag, and a Free Play run
    // never carries an eligibility stamp to begin with, so both exclusions
    // survive the move.
    expect(settlementSource).toMatch(/const resolved =\s*\n?\s*validated &&/);
    expect(settlementSource).toMatch(/if \(!inputs\) return NO_CURRICULUM_FACTS;/);
    // ONE promotion path. The route's duplicate call was deleted by WP-F: a
    // settlement that promotes a Gene must be the settlement that can also
    // announce it, and two callers meant one of them was silent.
    expect(source).not.toContain('resolveLearningEvent');
    expect(settlementSource.match(/await resolveLearningEvent\(/g)).toHaveLength(1);
  });

  it('promotes after the durable settlement, and never blocks it', () => {
    // Inside the durable settlement now, so "after" means after the reward and
    // progression RPCs have committed and before the receipt is built.
    const reward = settlementSource.indexOf(
      "'settle_game_session_reward_from_snapshot'"
    );
    const resolve = settlementSource.indexOf('await resolveLearningEvent(');
    const receipt = settlementSource.indexOf('buildRunImpactEnvelope({');
    expect(reward).toBeGreaterThan(0);
    expect(resolve).toBeGreaterThan(reward);
    expect(receipt).toBeGreaterThan(resolve);
    // Its result gates the REVEAL beat and nothing else: no early return, no
    // throw, no settlement failure.
    expect(settlementSource).toMatch(
      /const promoted = await resolveLearningEvent\(/
    );
    expect(settlementSource).toMatch(/if \(promoted\) \{/);
  });

  it('never recomposes a vocabulary at settlement', () => {
    // The pool a run settles under is the pool it was stamped with. A later
    // unlock applies to a later run.
    const settlementStart = source.indexOf(
      "action === 'end' || action === 'terminal'"
    );
    expect(settlementStart).toBeGreaterThan(0);
    const settlementBody = source.slice(settlementStart);
    expect(settlementBody).not.toContain('genomeV2PlayableVocabulary(');
    expect(settlementBody).not.toContain('grantStarterEligibility(');
  });
});

describe('run start: stamping the trial guarantee (WP-C)', () => {
  it('freezes the appearances the account had left, and only with a trial', () => {
    // Frozen WITH the vocabulary: an appearance spent by another run in
    // flight, or a trial switched mid-run, changes the next run and not this
    // one — the same rule the pool itself follows.
    expect(source).toMatch(
      /\.\.\.\(eligibility\.trialGeneId &&\s*\n?\s*eligibility\.trialOffersRemaining > 0\s*\n?\s*\? \{ trialOffersRemaining: eligibility\.trialOffersRemaining \}\s*\n?\s*: \{\}\)/
    );
    // Still exactly one eligibility read in the whole route, and still at start.
    expect(source.match(/readGeneEligibility\(/g)).toHaveLength(1);
  });

  it('hands settlement the stamped trial, never a fresh read', () => {
    expect(source).toMatch(
      /trial: genomeV2StampedTrial\(\s*\n?\s*runContext\.genome\.eligibilityInputs\s*\n?\s*\)/
    );
  });
});

describe('settlement: consuming guaranteed appearances (WP-C)', () => {
  it('counts them from the validated record and never from the journal', () => {
    expect(source).toMatch(
      /const trialAppearances = settledV2Record\s*\n?\s*\? genomeV2TrialOffersConsumed\(settledV2Record\)\s*\n?\s*: 0/
    );
    const consumption = source.slice(
      source.indexOf('const trialAppearances'),
      source.indexOf('await recordTrialOffer(')
    );
    expect(consumption.length).toBeGreaterThan(0);
    expect(consumption).not.toContain('.journal');
  });

  it('consumes nothing on a Free Play or unvalidated run', () => {
    const consumption = source.slice(
      source.indexOf('const trialAppearances'),
      source.indexOf('await recordTrialOffer(')
    );
    expect(consumption).toMatch(/validation\.valid &&\s*\n?\s*!isFreeSession &&/);
    expect(consumption).toMatch(/trialAppearances > 0/);
  });

  it('records the appearances after the durable settlement, and never blocks it', () => {
    // WP-C asserted this consumption sits after `settleDurableRunProgression`
    // and before the promotion. The promotion moved INSIDE that settlement
    // (WP-D/WP-F), so the ordering claim it was really making — the guarantee
    // is spent only once the run is durably settled, and the promotion the
    // settlement performs sees the spend — is unchanged and still checked.
    const settlement = source.indexOf('await settleDurableRunProgression(');
    const record = source.indexOf('await recordTrialOffer(');
    expect(settlement).toBeGreaterThan(0);
    expect(record).toBeGreaterThan(settlement);
    // `record_trial_offer` only touches a row still in the trial state, so a
    // Gene the settlement just promoted is untouched by a later appearance.
    expect(source).toContain('await recordTrialOffer(');
    // Nothing reads its result, so nothing can branch on it.
    expect(source).not.toMatch(/const \w+ = await recordTrialOffer\(/);
  });
});

/**
 * Curriculum PRESENTATION — the words and the choices, never the authority
 * (WP-D; `docs/game/PLAYER_EVOLUTION_ONBOARDING.md` §4.2, §4.4, §5).
 *
 * WHAT THIS OWNS
 *
 * How the server's eligibility rows are described to a player, and which two
 * trials the Workbench may offer next. Nothing here decides what a run may be
 * offered — `genomeV2PlayableVocabulary` does that, from the same rows, and
 * this module never touches it.
 *
 * WHY IT IS PURE
 *
 * The annotation is composed on the server (so the client cannot invent an
 * eligibility state) but rendered in the browser, and the same strings are
 * asserted by unit tests rather than eyeballed on a screen. A pure module is
 * the only shape that lets all three read the identical text.
 *
 * THE REVEAL GRAMMAR (§5)
 *
 *   REVEAL -> INVITATION -> CONTEXTUAL PRACTICE -> PROOF -> REFERENCE
 *
 * `curriculumUnlockBeat` is the REVEAL (a settled fact, granting nothing) and
 * `curriculumInvitation` is the INVITATION. Both state an action and its
 * consequence; neither names a feature and stops. The decline idiom is
 * **Not now** everywhere — decision 13 — and declining never hides the unlock.
 */

import {
  GENOME_V2_GENES,
  genomeV2ActivePool,
  isGenomeV2ActiveGeneId,
  type GenomeV2ActiveGeneId,
  type GenomeV2Dynasty,
  type GenomeV2GeneCategory,
} from '@/shared/game/genes';

/**
 * At most two next trials, from different decision categories (§4.4 [H]).
 *
 * Two is a choice; one is an assignment and three is a menu. The categories
 * must differ so the choice is between two kinds of decision rather than two
 * flavours of the same one.
 */
export const CURRICULUM_MAX_TRIAL_CANDIDATES = 2;

/**
 * The shipped decline idiom (decision 13). "Later" was drafted and rejected:
 * introducing it would fork a vocabulary the product already has.
 */
export const CURRICULUM_DECLINE_LABEL = 'Not now';

/** The three server-held states of §4.2. `visible_locked` is the row's absence. */
export type CurriculumGeneState = 'visible_locked' | 'trial' | 'offer_eligible';

export interface CurriculumGeneAnnotation {
  geneId: GenomeV2ActiveGeneId;
  name: string;
  category: GenomeV2GeneCategory;
  state: CurriculumGeneState;
  /** True when an ordinary Power Pod may draw it today. */
  offerable: boolean;
  /** The truthful next step, in the words the player can act on. */
  nextStep: string;
  /** True when `POST /api/genome/curriculum` would accept it as the trial. */
  selectable: boolean;
}

export interface CurriculumFacts {
  /** Offer-eligible Genes held by the account, from the satellite table. */
  eligibleGeneIds: readonly GenomeV2ActiveGeneId[];
  /** The single selected trial, or null. */
  trialGeneId: GenomeV2ActiveGeneId | null;
  /** Validated banked runs. The first trial is chosen after the first BANK. */
  bankedRuns: number;
}

/**
 * A trial may be chosen once the player has banked once (§4.4: "After the
 * first BANK, the Workbench may present up to two legal next trials").
 */
export function curriculumTrialsOpen(facts: CurriculumFacts): boolean {
  return Number.isSafeInteger(facts.bankedRuns) && facts.bankedRuns >= 1;
}

function stateFor(
  geneId: GenomeV2ActiveGeneId,
  facts: CurriculumFacts
): CurriculumGeneState {
  if (facts.eligibleGeneIds.includes(geneId)) return 'offer_eligible';
  if (facts.trialGeneId === geneId) return 'trial';
  return 'visible_locked';
}

/**
 * The next step for one Gene, derived from mechanics rather than a per-Gene
 * prose table.
 *
 * Every branch is a fact the player can check: it says what is true now and
 * the one action that changes it. "Locked" as a bare word appears nowhere —
 * boundary 2 makes locked mean "not yet in your live choices", never "secret",
 * and §9.4 blocks launch if players read later as stronger.
 */
function nextStepFor(
  state: CurriculumGeneState,
  facts: CurriculumFacts,
  selectable: boolean
): string {
  if (state === 'offer_eligible') {
    return 'Ordinary Power Pods can offer this.';
  }
  if (state === 'trial') {
    return 'Your chosen trial. It holds one Pod slot until you use it once — succeed or fail, it stays.';
  }
  if (!curriculumTrialsOpen(facts)) {
    return 'Not offered yet. BANK a run and you can choose your first trial here.';
  }
  if (selectable) {
    return facts.trialGeneId
      ? 'Not offered yet. Switch your trial to this and it enters your next Pods; switching costs nothing.'
      : 'Not offered yet. Choose it as your trial and it enters your next Pods.';
  }
  return 'Not offered yet. It becomes choosable as your vocabulary grows.';
}

/**
 * Up to two legal next trials, from different decision categories.
 *
 * DETERMINISTIC BY CONSTRUCTION. The scan is in catalog order and the tie
 * break is the catalog's, so the server and a test produce the same pair for
 * the same facts. The current trial is included as the first candidate when
 * one is set, because §4.4's "switch" needs the player to see what they would
 * be switching away from.
 */
export function curriculumTrialCandidates(
  dynasty: GenomeV2Dynasty,
  facts: CurriculumFacts
): GenomeV2ActiveGeneId[] {
  if (!curriculumTrialsOpen(facts)) return [];
  const eligible = new Set(facts.eligibleGeneIds);
  const categories = new Set<GenomeV2GeneCategory>();
  const chosen: GenomeV2ActiveGeneId[] = [];
  for (const geneId of genomeV2ActivePool(dynasty)) {
    if (chosen.length >= CURRICULUM_MAX_TRIAL_CANDIDATES) break;
    if (eligible.has(geneId)) continue;
    if (geneId === facts.trialGeneId) continue;
    const category = GENOME_V2_GENES[geneId].category;
    if (categories.has(category)) continue;
    categories.add(category);
    chosen.push(geneId);
  }
  return chosen;
}

/** True when `select_gene_trial` should accept this Gene for this account. */
export function curriculumTrialSelectable(
  dynasty: GenomeV2Dynasty,
  facts: CurriculumFacts,
  geneId: unknown
): geneId is GenomeV2ActiveGeneId {
  if (!isGenomeV2ActiveGeneId(geneId)) return false;
  if (!genomeV2ActivePool(dynasty).includes(geneId)) return false;
  if (facts.eligibleGeneIds.includes(geneId)) return false;
  if (facts.trialGeneId === geneId) return false;
  return curriculumTrialCandidates(dynasty, facts).includes(geneId);
}

/** Every current-roster Gene with its state and its one truthful next step. */
export function curriculumAnnotations(
  dynasty: GenomeV2Dynasty,
  facts: CurriculumFacts
): CurriculumGeneAnnotation[] {
  const candidates = new Set(curriculumTrialCandidates(dynasty, facts));
  return genomeV2ActivePool(dynasty).map((geneId) => {
    const state = stateFor(geneId, facts);
    const selectable = state === 'visible_locked' && candidates.has(geneId);
    return {
      geneId,
      name: GENOME_V2_GENES[geneId].name,
      category: GENOME_V2_GENES[geneId].category,
      state,
      offerable: state !== 'visible_locked',
      nextStep: nextStepFor(state, facts, selectable),
      selectable,
    };
  });
}

export interface CurriculumUnlockBeat {
  headline: string;
  detail: string;
}

/**
 * REVEAL (§5): the settled fact, in one line that grants nothing.
 *
 * "You used it" is the proof the server actually holds — the learning event
 * resolved in authoritative play — and the consequence is the only thing that
 * changed: where the Gene may now appear.
 */
export function curriculumUnlockBeat(
  geneId: GenomeV2ActiveGeneId
): CurriculumUnlockBeat {
  const gene = GENOME_V2_GENES[geneId];
  return {
    headline: `${gene.name} joined your Power Pods`,
    detail: `You used it in a real run, so it is now dealt like any other power. Nothing else changed.`,
  };
}

export interface CurriculumInvitation {
  /** Layer 3's single recommended action. */
  label: string;
  description: string;
  href: string;
  /** The decline control beside it. */
  declineLabel: string;
}

/**
 * INVITATION (§5): **Show me**, with the consequence of accepting stated.
 *
 * The destination is the Workbench, which is where the rule and its cost are
 * kept (REFERENCE). Declining removes the invitation and nothing else — the
 * Gene is already in the player's Pods either way.
 */
export function curriculumInvitation(
  geneId: GenomeV2ActiveGeneId
): CurriculumInvitation {
  const gene = GENOME_V2_GENES[geneId];
  return {
    label: `Show me ${gene.name}`,
    description: `Read what it changes and what it commits before your next run.`,
    href: '/codex',
    declineLabel: CURRICULUM_DECLINE_LABEL,
  };
}

/**
 * The banner shown once on the Workbench for an open invitation.
 *
 * It names the Gene and the one place to look, because a hint that says
 * "something is new" and then makes the player hunt is worse than no hint.
 */
export function curriculumHintMessage(geneId: GenomeV2ActiveGeneId): string {
  const gene = GENOME_V2_GENES[geneId];
  return `${gene.name} is in your Power Pods now. Open it below to read the rule and its cost.`;
}

/**
 * The attention row's `artifact_ref`. Also the Codex deep link's token, so the
 * bell and the Results invitation point at the same Gene.
 */
export function curriculumArtifactRef(geneId: GenomeV2ActiveGeneId): string {
  return `gene:${geneId}`;
}

/** The Gene an attention row is about, or null when it is not a curriculum row. */
export function curriculumGeneFromArtifactRef(
  artifactRef: string | undefined
): GenomeV2ActiveGeneId | null {
  if (!artifactRef || !artifactRef.startsWith('gene:')) return null;
  const geneId = artifactRef.slice('gene:'.length);
  return isGenomeV2ActiveGeneId(geneId) ? geneId : null;
}

/** `source_type` for every curriculum attention row and progression moment. */
export const CURRICULUM_SOURCE_TYPE = 'curriculum';

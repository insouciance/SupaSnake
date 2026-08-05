/**
 * Results Layer 3's single recommended next action (Constitution §5, §12.2).
 *
 * The cap is "three Results layers, with exactly **one** recommended next
 * action". Before WP-1.06 the post-run screen offered a first-result Lab
 * panel, a Lab link, a Home link, a Menu button, a guest save-progress link
 * and a claim-your-name notification — six competing invitations, three of
 * them duplicated as global notifications.
 *
 * This module collapses all of that into one deterministic pick. It is a pure
 * fold so the "exactly one" law is unit-testable rather than eyeballed, and so
 * the ordering is a stated policy instead of render-order accident.
 *
 * Ordering policy (WP-1.06, extended by the ratified table in
 * `docs/game/PLAYER_EVOLUTION_ONBOARDING.md` §5 and §13 row 11):
 *   1. A guest who has DNA to lose is told how to keep it. Continuity first —
 *      it is the only recommendation whose absence is destructive.
 *   2. A player still wearing a generated name is offered the claim, but only
 *      after a banked run, because that is the moment §5 calls the ceremony.
 *   3. The eight-bank clan reveal — the rarer, larger event, so it takes a
 *      settlement it shares with a Gene unlock (§13 row 12).
 *   4. A curriculum reveal — the run's actual news — above the standing Lab
 *      invitation, per §13 row 11.
 *   5. A player's first completed run meets the Lab.
 *   6. The canonical impact receipt may recommend one relevant destination.
 *   7. New Codex discoveries provide a rolling-deploy fallback.
 *   8. Everything else routes to the Chronicle, which is where §5 sends every
 *      section Results no longer carries.
 *
 * ONE LESSON PER RESULTS is structural, not enforced: this function returns
 * exactly one action, and the settlement that feeds it can promote at most one
 * Gene per run (server contract §4.2). Both halves are asserted in the tests.
 *
 * REPLAY and SETUP are NOT next actions: they are the run loop's own controls
 * (§5's ≤2 taps from Results to the next run) and live outside Layer 3.
 * Nothing here is ever commercial (Rule 7).
 */

import type {
  ProgressionDestination,
  RunImpactAction,
} from '@/shared/progression/runImpact';
import { progressionArtifactHref } from '@/shared/progression/destinations';

export type ResultsNextActionId =
  | 'save-progress'
  | 'claim-handle'
  | 'clan-reveal'
  | 'curriculum-reveal'
  | 'visit-lab'
  | 'run-impact'
  | 'open-codex'
  | 'chronicle';

/**
 * The ratified fold order (PEO §5 "Results priority" and §13 row 11),
 * expressed as data so the policy is readable and re-orderable in one place
 * rather than inferred from the shape of an if-chain.
 *
 * `clan-reveal` is filled by WP-E. It sits below `claim-handle` — account
 * safety outranks every lesson (§5) — and above `curriculum-reveal`, which is
 * §13 row 12's collision rule expressed as position rather than as a special
 * case: the clan reveal is the rarer and larger event, so it takes the
 * settlement and the Gene defers to the next one (boundary 5, one major lesson
 * per Results).
 */
export const RESULTS_NEXT_ACTION_PRIORITY: readonly ResultsNextActionId[] = [
  'save-progress',
  'claim-handle',
  'clan-reveal',
  'curriculum-reveal',
  'visit-lab',
  'run-impact',
  'open-codex',
  'chronicle',
];

export interface ResultsNextAction {
  id: ResultsNextActionId;
  label: string;
  description: string;
  /** Navigation target, or `null` when the action opens an in-page modal. */
  href: string | null;
  /**
   * The server attention row this invitation is bound to.
   *
   * Present only on an invitation that may be declined. The id is what a
   * **Not now** transitions server-side; there is no browser copy of it,
   * because boundary 9 puts the curriculum ledger on the server and
   * `verify:constitution`'s `local-progress` gate fails the build outright on
   * any `localStorage` use in this feature.
   */
  attentionId?: string;
  /** The decline control's label, when the invitation carries one. */
  declineLabel?: string;
}

export interface ResultsNextActionContext {
  /** The server account is anonymous and has no user-controlled recovery path. */
  isAnonymous: boolean;
  /** The run banked at the portal (a crash is not the claim ceremony). */
  extracted: boolean;
  /** The player's handle is still server-generated. */
  handleIsGenerated: boolean;
  /** This settled run was the account's first completed run. */
  isFirstCompletedRun: boolean;
  /** Number of Codex entries this run discovered. */
  codexDiscoveries: number;
  /** Free Play run — rewardless practice (§7.4). */
  practice: boolean;
  /** Server-selected destination from the immutable run-impact receipt. */
  impactAction?: RunImpactAction | null;
  /**
   * An OPEN curriculum invitation held by the server: a Gene this account
   * unlocked whose attention row is still `unseen` or `seen`.
   *
   * The client reads it from `/api/progression/attention`, never from its own
   * memory of the settlement, so a **Not now** on one device is respected on
   * every other one and a reload cannot resurrect a declined invitation.
   */
  curriculumReveal?: {
    geneId: string;
    label: string;
    description: string;
    href: string;
    declineLabel: string;
    attentionId: string;
  } | null;
  /**
   * An OPEN eight-bank clan reveal held by the server (WP-E, PEO §6).
   *
   * Read from `/api/progression/attention` exactly as the curriculum
   * invitation is, so a **Not now** on one device is respected on every other
   * one. Its presence is also what defers a same-settlement Gene reveal:
   * §13 row 12 gives this the settlement, and the Gene's own row stays open
   * for the next one, so deferring costs the player nothing.
   */
  clanReveal?: {
    label: string;
    description: string;
    href: string;
    declineLabel: string;
    attentionId: string;
  } | null;
  /**
   * The clan reveal owns this settlement.
   *
   * Set by WP-D as the deferral switch and kept because it is the honest name
   * for the condition: it is normally `Boolean(clanReveal)`, and the two are
   * separate only so the fold can be tested against a pending reveal it was
   * not given the copy for.
   */
  clanRevealPending?: boolean;
}

const IMPACT_DESTINATION: Record<ProgressionDestination, {
  href: string;
  label: string;
}> = {
  chronicle: { href: '/profile', label: 'Chronicle' },
  mastery: { href: '/profile#mastery', label: 'Mastery' },
  records: { href: '/profile#records', label: 'Records' },
  codex: { href: '/codex', label: 'Genome Research' },
  signal: { href: '/#signal', label: "Today's Challenge" },
  clan: { href: '/clan', label: 'Clan' },
  lab: { href: '/lab', label: 'Lab' },
  lineage: { href: '/lab#lineage', label: 'Bloodline' },
};

const CHRONICLE: ResultsNextAction = {
  id: 'chronicle',
  label: 'Open your Chronicle',
  description: 'Every run, record and discovery this account has made.',
  href: '/profile',
};

/**
 * The one action Layer 3 recommends. Always returns exactly one.
 */
export function chooseNextAction(
  context: ResultsNextActionContext
): ResultsNextAction {
  if (context.isAnonymous && !context.practice) {
    return {
      id: 'save-progress',
      label: 'Protect this account',
      description: 'Add an email so you can recover this server account on any device.',
      href: null,
    };
  }
  if (context.handleIsGenerated && context.extracted && !context.practice) {
    return {
      id: 'claim-handle',
      label: 'Claim your player name',
      description: 'That run deserves a name on it.',
      href: null,
    };
  }
  // The eight-bank clan reveal (owner ruling 2): the single recommended
  // action becomes a POINTER to `/clan`, where the founding flow already
  // lives. Not `/leaderboard` — the Compete nav item points there, and a
  // first clan reveal that opened a leaderboard would teach the wrong thing
  // (§6 step 2). Practice pays nothing and therefore reveals nothing.
  if (context.clanReveal && !context.practice) {
    return {
      id: 'clan-reveal',
      label: context.clanReveal.label,
      description: context.clanReveal.description,
      href: context.clanReveal.href,
      attentionId: context.clanReveal.attentionId,
      declineLabel: context.clanReveal.declineLabel,
    };
  }
  // The run's actual news outranks the standing Lab invitation (§13 row 11),
  // and defers whole to the clan reveal when both land at once (row 12).
  // Deferring costs the player nothing: the attention row stays open, so the
  // next settlement offers the identical invitation.
  if (context.curriculumReveal && !context.clanRevealPending && !context.practice) {
    return {
      id: 'curriculum-reveal',
      label: context.curriculumReveal.label,
      description: context.curriculumReveal.description,
      href: context.curriculumReveal.href,
      attentionId: context.curriculumReveal.attentionId,
      declineLabel: context.curriculumReveal.declineLabel,
    };
  }
  if (context.isFirstCompletedRun) {
    return {
      id: 'visit-lab',
      label: 'Visit the Lab',
      description: 'Breed, equip and discover the snakes you run with.',
      href: '/lab',
    };
  }
  if (context.impactAction) {
    const destination = IMPACT_DESTINATION[context.impactAction.destination];
    return {
      id: 'run-impact',
      label: context.impactAction.headline,
      description: `Continue in ${destination.label}.`,
      href: progressionArtifactHref(
        context.impactAction.destination,
        context.impactAction.artifactRef
      ),
    };
  }
  if (context.codexDiscoveries > 0) {
    return {
      id: 'open-codex',
      label: 'Study your discoveries',
      description: 'This run added new pieces to Genome Research.',
      href: '/codex',
    };
  }
  return CHRONICLE;
}

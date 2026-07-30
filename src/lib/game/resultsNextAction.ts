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
 * Ordering policy (local decision, WP-1.06):
 *   1. A guest who has DNA to lose is told how to keep it. Continuity first —
 *      it is the only recommendation whose absence is destructive.
 *   2. A player still wearing a generated name is offered the claim, but only
 *      after a banked run, because that is the moment §5 calls the ceremony.
 *   3. A player's first completed run meets the Lab.
 *   4. The canonical impact receipt may recommend one relevant destination.
 *   5. New Codex discoveries provide a rolling-deploy fallback.
 *   6. Everything else routes to the Chronicle, which is where §5 sends every
 *      section Results no longer carries.
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
  | 'visit-lab'
  | 'run-impact'
  | 'open-codex'
  | 'chronicle';

export interface ResultsNextAction {
  id: ResultsNextActionId;
  label: string;
  description: string;
  /** Navigation target, or `null` when the action opens an in-page modal. */
  href: string | null;
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
}

const IMPACT_DESTINATION: Record<ProgressionDestination, {
  href: string;
  label: string;
}> = {
  chronicle: { href: '/profile', label: 'Chronicle' },
  mastery: { href: '/lab#mastery', label: 'Mastery' },
  records: { href: '/profile#records', label: 'Records' },
  codex: { href: '/codex', label: 'Codex' },
  signal: { href: '/#signal', label: 'World Signal' },
  clan: { href: '/clan', label: 'Clan' },
  lab: { href: '/lab', label: 'Lab' },
  lineage: { href: '/lab#lineage', label: 'Lineage' },
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
      label: 'Open the Codex',
      description: 'This run added entries you have not read yet.',
      href: '/codex',
    };
  }
  return CHRONICLE;
}

/**
 * The lead ladder (Constitution §11.7) — public identity as the conversion
 * mechanism, as a data model.
 *
 * §11.7 in one sentence: "visitor → player (instant, anonymous) → named
 * (handle claimed) → reachable (optional email, the Dispatch) → belonging
 * (clan) → advocate (Broodmarks, shares) → patron. Every rung voluntary,
 * every reason real, every transition instrumented."
 *
 * WHAT THIS MODULE IS AND IS NOT
 *
 *   It is the rung order, the honest reading of which rung someone is on,
 *   and the copy for the one prompt this ladder is allowed to make. It is
 *   NOT a second identity system: claiming is `POST /api/player/handle`,
 *   which calls migration 022's `claim_handle`, and the surface reuses the
 *   shipped `HandleClaimModal` verbatim. The provisional name a leaderboard
 *   shows an unclaimed player is `generatedHandleFor()` — migration 022's
 *   own `player_identity_view` fallback — so there is exactly one derivation
 *   of "what an unnamed player is called" in the codebase.
 *
 * THE HONESTY RULE THAT SHAPED `currentRung`
 *
 *   A surface rarely knows the whole player. The leaderboard knows whether
 *   your row is a claimed name; it does not know whether you have an email
 *   or a clan. So every field of `LadderState` is a TRISTATE — true, false,
 *   or unknown — and the walk STOPS at the first field that is not `true`.
 *   Unknown never advances a rung and never asserts a rung is unreached.
 *   The alternative (defaulting unknown to false) would have the leaderboard
 *   tell a clan founder to go find a clan, which is exactly the kind of
 *   nagging §11.4 forbids.
 *
 * RULE 7, AND WHY THE LAST RUNG IS NOT RENDERED
 *
 *   `patron` is a real rung — the funnel has to be able to measure it. But
 *   the ladder SURFACE stops at `advocate`: a rendered rung labelled
 *   "patron" on a leaderboard is a commercial surface on a screen someone
 *   came to for a score, and Rule 7 does not care that it was drawn as a
 *   diagram. `RENDERED_RUNGS` is the shorter list, and `PROMPTS` covers
 *   fewer rungs still — only the three transitions this surface may invite.
 *
 * RULES 5 AND 6
 *
 *   Nothing here reads a date, a streak, or a last-seen time. A rung, once
 *   reached, is a fact about what a player owns, and there is no input on
 *   which it could decay. `leadLadder.test.ts` asserts that property rather
 *   than trusting this paragraph.
 */

import { FunnelStages, type FunnelStage } from '@/lib/analytics/funnel';
import { generatedHandleFor } from '@/lib/identity/handle';

export const LadderRungs = {
  /** Arrived. Has not moved a snake yet. */
  VISITOR: 'visitor',
  /** Playing, anonymously. §11.7: "Anonymous play is never gated." */
  PLAYER: 'player',
  /** Handle claimed. The lead event. */
  NAMED: 'named',
  /** Optional email attached — the Dispatch. */
  REACHABLE: 'reachable',
  /** In a clan (§9). */
  BELONGING: 'belonging',
  /** Sharing: Broodmarks, challenge links, artifacts. */
  ADVOCATE: 'advocate',
  /** §10. Measured, never rendered by this surface. */
  PATRON: 'patron',
} as const;

export type LadderRung = (typeof LadderRungs)[keyof typeof LadderRungs];

/** The ladder, in order. Index is the rung's height. */
export const LADDER_ORDER: readonly LadderRung[] = [
  LadderRungs.VISITOR,
  LadderRungs.PLAYER,
  LadderRungs.NAMED,
  LadderRungs.REACHABLE,
  LadderRungs.BELONGING,
  LadderRungs.ADVOCATE,
  LadderRungs.PATRON,
] as const;

/**
 * The rungs a player-facing ladder is allowed to draw (Rule 7 — see the
 * header). `patron` is deliberately absent.
 */
export const RENDERED_RUNGS: readonly LadderRung[] = LADDER_ORDER.filter(
  (rung) => rung !== LadderRungs.PATRON
);

export interface LadderRungInfo {
  id: LadderRung;
  /** What you ARE at this rung, in two words. */
  label: string;
  /** What the rung means, in one plain sentence. */
  meaning: string;
  /**
   * The §11.5 stage this rung reports into. The ladder does NOT get its own
   * event family: it adds a `ladder_rung` dimension to the eight stages that
   * already exist.
   */
  stage: FunnelStage;
}

export const LADDER_RUNGS: Readonly<Record<LadderRung, LadderRungInfo>> = {
  [LadderRungs.VISITOR]: {
    id: LadderRungs.VISITOR,
    label: 'Visitor',
    meaning: 'You are here. Nothing is asked of you.',
    stage: FunnelStages.REACH,
  },
  [LadderRungs.PLAYER]: {
    id: LadderRungs.PLAYER,
    label: 'Player',
    meaning:
      'You are running boards anonymously, and you can stay this way forever.',
    stage: FunnelStages.ARRIVE,
  },
  [LadderRungs.NAMED]: {
    id: LadderRungs.NAMED,
    label: 'Named',
    meaning:
      'Your handle is yours. It signs your runs, your clan, and everything you share.',
    stage: FunnelStages.IDENTIFY,
  },
  [LadderRungs.REACHABLE]: {
    id: LadderRungs.REACHABLE,
    label: 'Reachable',
    meaning:
      'An address you chose to give, used for the weekly settlement and nothing else.',
    // §11.5 measures "Activation → identity; email attach rate" on the same
    // stage: being findable is the second half of being identified.
    stage: FunnelStages.IDENTIFY,
  },
  [LadderRungs.BELONGING]: {
    id: LadderRungs.BELONGING,
    label: 'Belonging',
    meaning: 'You hunt the week with a clan, and the clan never grades you.',
    stage: FunnelStages.BELONG,
  },
  [LadderRungs.ADVOCATE]: {
    id: LadderRungs.ADVOCATE,
    label: 'Advocate',
    meaning:
      'You hand the game to someone else — a challenge link, a run, a broodmate.',
    stage: FunnelStages.ADVOCATE,
  },
  [LadderRungs.PATRON]: {
    id: LadderRungs.PATRON,
    label: 'Patron',
    meaning: 'Recorded for the funnel review. This surface never draws it.',
    stage: FunnelStages.PATRONIZE,
  },
};

/**
 * What a surface knows about a player. Every field is a tristate:
 * `true` (confirmed), `false` (confirmed absent), `undefined`/`null`
 * (this surface cannot see it). See the header for why that matters.
 */
export interface LadderState {
  /** Has a player row and has run a board. */
  hasPlayed?: boolean | null;
  /** Holds a claimed handle — not the generated `handler-NNNN` fallback. */
  hasHandle?: boolean | null;
  /** Has an address they chose to give. */
  isReachable?: boolean | null;
  /** Is in a clan. */
  hasClan?: boolean | null;
  /** Has shared or invited. */
  hasAdvocated?: boolean | null;
  /** §10. Never prompted by the ladder surface. */
  isPatron?: boolean | null;
}

/** The state field that confirms each rung above `visitor`. */
const RUNG_FIELD: Record<Exclude<LadderRung, 'visitor'>, keyof LadderState> = {
  [LadderRungs.PLAYER]: 'hasPlayed',
  [LadderRungs.NAMED]: 'hasHandle',
  [LadderRungs.REACHABLE]: 'isReachable',
  [LadderRungs.BELONGING]: 'hasClan',
  [LadderRungs.ADVOCATE]: 'hasAdvocated',
  [LadderRungs.PATRON]: 'isPatron',
};

/**
 * The highest rung this surface can CONFIRM. Stops at the first field that
 * is not exactly `true` — false and unknown both stop the walk, so a rung is
 * only ever claimed on evidence.
 */
export function currentRung(state: LadderState): LadderRung {
  let reached: LadderRung = LadderRungs.VISITOR;
  for (const rung of LADDER_ORDER) {
    if (rung === LadderRungs.VISITOR) continue;
    const field = RUNG_FIELD[rung as Exclude<LadderRung, 'visitor'>];
    if (state[field] !== true) break;
    reached = rung;
  }
  return reached;
}

/** The rung above `rung`, or null at the top. */
export function nextRung(rung: LadderRung): LadderRung | null {
  const index = LADDER_ORDER.indexOf(rung);
  return LADDER_ORDER[index + 1] ?? null;
}

/** The §11.5 stage a rung reports into. */
export function stageOfRung(rung: LadderRung): FunnelStage {
  return LADDER_RUNGS[rung].stage;
}

export interface LadderPrompt {
  /** The rung the prompt invites you to. */
  rung: LadderRung;
  /** The button's words. */
  action: string;
  /** Why anyone would, stated as a real reason and never as a loss. */
  reason: string;
  /** Where the action goes, or null when the surface handles it inline. */
  href: string | null;
}

/**
 * The only three invitations this surface may make.
 *
 * There is no prompt for `advocate` (sharing is offered where an artifact
 * exists, not on a board) and none for `patron` (Rule 7). Every reason is
 * phrased as something gained: §11.7's "Guests lose nothing by staying
 * guests except being seen" is the argument, and an argument is not a nag.
 */
export const LADDER_PROMPTS: Readonly<Partial<Record<LadderRung, LadderPrompt>>> =
  {
    [LadderRungs.NAMED]: {
      rung: LadderRungs.NAMED,
      action: 'Claim your name',
      reason:
        'A name puts you on the board as yourself, enters you into Ascension, and signs what you share. It is free, it is yours to keep, and nothing you have already earned changes when you take it.',
      href: null,
    },
    [LadderRungs.REACHABLE]: {
      rung: LadderRungs.REACHABLE,
      action: 'Settings',
      reason:
        'The weekly settlement can come to you instead of you coming to it. One address, one message a week, and you can turn it off in the same place you turned it on.',
      href: '/settings',
    },
    [LadderRungs.BELONGING]: {
      rung: LadderRungs.BELONGING,
      action: 'Find a clan',
      reason:
        'Clans hunt the week together and split what they find by participation. No thresholds, no bars to clear, nobody grading you.',
      href: '/clan',
    },
  };

/** The invitation for a player at `rung`, if this surface may make one. */
export function promptFor(rung: LadderRung): LadderPrompt | null {
  const next = nextRung(rung);
  if (!next) return null;
  return LADDER_PROMPTS[next] ?? null;
}

/**
 * §11.7's provisional-entry line: "Unclaimed Specimen #7f3a — is this you?
 * Claim your handle."
 *
 * The Constitution's example spells the provisional name as a hex fragment;
 * the shipped one is `handler-NNNN` from migration 022's identity view. The
 * shipped name wins, because it is the name the player is ALREADY shown on
 * every board — inventing a second one for the prompt would ask "is this
 * you?" about a string the player has never seen.
 */
export function provisionalCallout(displayHandle: string): string {
  return `Unclaimed specimen ${displayHandle} — is this you?`;
}

/** The provisional name for a player id, straight from the shipped mirror. */
export function provisionalNameFor(playerId: string): string {
  return generatedHandleFor(playerId);
}

/**
 * Every player-visible string this module publishes, for the Rule 7 sweep.
 * A handle is identity, not a purchase (Rule 4 / §10.4), and the ladder sits
 * on a screen someone opened to read a board — so its copy is held to the
 * same commercial-vocabulary lint as the contract page and the Dispatch.
 */
export function ladderPlainText(): string {
  return [
    ...RENDERED_RUNGS.flatMap((rung) => [
      LADDER_RUNGS[rung].label,
      LADDER_RUNGS[rung].meaning,
    ]),
    ...Object.values(LADDER_PROMPTS).map(
      (prompt) => `${prompt.action}\n${prompt.reason}`
    ),
    provisionalCallout('handler-0000'),
  ].join('\n');
}

'use client';

/**
 * Results — three layers (Constitution §5, cap §12.2).
 *
 * The screen this replaces carried up to fourteen sections, six toasts and
 * three notifications; §5 calls it "the single worst surface in the product".
 * The ruling is exact, so this component is exact:
 *
 *   Layer 1  outcome — what happened, personal-best status, the share
 *            artifact, and the Daily Take collect on the day's first run.
 *            The share prompt is L1 because the artifact is product (§11.3).
 *   Layer 2  the two numbers — Score, and Yield with its Depth contribution
 *            during Serpent weeks (§6).
 *   Layer 3  ONE collapsed progression digest, with exactly ONE recommended
 *            next action. Everything else routes to the Chronicle.
 *
 * Rule 7: zero commercial surfaces. Nothing here links to the shop, prices
 * anything, or mentions a product. REPLAY and SETUP sit outside the layers as
 * the run loop's own controls — §5's ≤2 taps from Results to the next run.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  IconArrowRight,
  IconDna,
  IconFlame,
  IconGift,
  IconMedal,
  IconPlay,
  IconReset,
} from '@/components/ui/icons';
import type { DailyTakeSlot } from '@/lib/game/dailyTake';
import type { ResultsNextAction } from '@/lib/game/resultsNextAction';

/** How the run ended, for the Layer 1 headline. */
export type RunResultsOutcome = 'extracted' | 'crashed';

/** Take collect UI state. `unavailable` is a no-op, never an error (WP-1.04). */
export type TakeCollectState =
  | 'idle'
  | 'collecting'
  | 'collected'
  | 'unavailable'
  | 'error';

export interface RunResultsSerpent {
  /** A Serpent week is running (WP-1.01; false whenever the flag is off). */
  live: boolean;
  /** The player's weekly Depth, in segments. */
  weekDepth: number;
  /** Weekly Depth minus their best week — §7.3's headline comparison. */
  deltaVsBestWeek: number;
  /** This run's Yield is one of the week's counted best-three. */
  runCounts: boolean;
}

export interface RunResultsDigest {
  mastery: {
    dynasty: string;
    xpGained: number;
    level: number;
    leveledUp: boolean;
    unlocks: { level: number; kind: string; label: string }[];
  } | null;
  codex: { key: string; label: string }[];
  streakDays: number | null;
  genes: string[];
}

export interface RunResultsProps {
  outcome: RunResultsOutcome;
  /** Free Play: a rewardless practice run (§7.4). */
  practice: boolean;
  personalBest: boolean;
  score: number;
  /** DNA actually credited. `null` when the settlement never answered. */
  dnaCredited: number | null;
  /** Full-strength, charge-independent Yield (§6.2). */
  yieldDna: number | null;
  serpent: RunResultsSerpent | null;
  take: DailyTakeSlot | null;
  takeState: TakeCollectState;
  onCollectTake: () => void;
  digest: RunResultsDigest;
  nextAction: ResultsNextAction;
  /** Invoked for a next action with no href (it opens a modal). */
  onNextAction: () => void;
  onReplay: () => void;
  onSetup: () => void;
  replayPending: boolean;
  replayDisabled: boolean;
  /** The share artifact (Genome Card). Layer 1. */
  shareArtifact?: ReactNode;
  /** The Analyst's run insight. Folded into the Layer 3 digest. */
  analyst?: ReactNode;
  /** The player's own identity card. Folded into the Layer 3 digest. */
  playerCard?: ReactNode;
}

function headline(outcome: RunResultsOutcome, practice: boolean) {
  if (practice) {
    return {
      testId: 'gameover-practice',
      title: 'Practice Run',
      tone: 'text-[#22d3ee]',
      detail:
        outcome === 'extracted'
          ? 'Extracted — practice, no rewards'
          : 'Crashed — practice, no rewards',
    };
  }
  if (outcome === 'extracted') {
    return {
      testId: 'gameover-extracted',
      title: 'Extracted',
      tone: 'text-rarity-uncommon',
      detail: 'Banked at the portal',
    };
  }
  return {
    testId: 'gameover-crashed',
    title: 'Game Over',
    tone: 'text-strike-red',
    detail: 'Crashed — the run salvaged what it could',
  };
}

function takeMessage(state: TakeCollectState, take: DailyTakeSlot): string | null {
  switch (state) {
    case 'collecting':
      return 'Collecting…';
    case 'collected':
      return 'Collected. See you tomorrow.';
    case 'unavailable':
      // WP-1.04 has not shipped the mechanism yet. Absence is never
      // destructive (Rule 5), so this states the fact and stops.
      return 'Your Take settles with the day.';
    case 'error':
      return 'Could not collect right now — it will keep.';
    default:
      return take.collected ? 'Already collected today.' : null;
  }
}

export function RunResults({
  outcome,
  practice,
  personalBest,
  score,
  dnaCredited,
  yieldDna,
  serpent,
  take,
  takeState,
  onCollectTake,
  digest,
  nextAction,
  onNextAction,
  onReplay,
  onSetup,
  replayPending,
  replayDisabled,
  shareArtifact,
  analyst,
  playerCard,
}: RunResultsProps) {
  const head = headline(outcome, practice);
  const hasDigest =
    digest.mastery !== null ||
    digest.codex.length > 0 ||
    digest.streakDays !== null ||
    digest.genes.length > 0 ||
    Boolean(analyst) ||
    Boolean(playerCard);

  return (
    <div className="space-y-6" data-testid="run-results">
      {/* ------------------------------------------------------------- */}
      {/* Layer 1 — outcome, personal best, share artifact, the Take     */}
      {/* ------------------------------------------------------------- */}
      <section data-testid="results-layer-1" aria-label="Outcome" className="space-y-4">
        <div className="space-y-1">
          <h2
            className={`heading-display text-4xl text-glow ${head.tone}`}
            data-testid={head.testId}
          >
            {head.title}
          </h2>
          <p className="font-body text-sm uppercase tracking-wide text-beige/60">
            {head.detail}
          </p>
        </div>

        {personalBest && (
          <p
            className="inline-flex items-center justify-center gap-2 rounded-arcade border border-venom-orange/60 bg-venom-orange/10 px-4 py-2 font-body text-sm font-bold text-venom-orange"
            data-testid="results-personal-best"
          >
            <IconMedal size={18} />
            Personal best
          </p>
        )}

        {take && (
          <div
            className="panel-glow [--glow:#facc15] mx-auto max-w-lg space-y-2 px-5 py-4 text-left"
            data-testid="results-take"
          >
            <p className="label-arcade text-[#facc15]">Daily Take</p>
            <p className="font-body text-sm text-beige/85">
              The day&apos;s first run pays{' '}
              <span className="font-bold text-bone-white">{take.amount} DNA</span>
              {take.streakDays > 0 && (
                <>
                  {' '}
                  · day {take.streakDays} streak
                  {take.multiplier > 1 ? ` ×${take.multiplier}` : ''}
                </>
              )}
              .
            </p>
            <button
              type="button"
              onClick={onCollectTake}
              disabled={
                take.collected ||
                takeState === 'collecting' ||
                takeState === 'collected' ||
                takeState === 'unavailable'
              }
              data-testid="results-take-collect"
              className="btn-neutral inline-flex min-h-[44px] items-center gap-2 px-5 py-2"
            >
              <IconGift size={18} />
              Collect
            </button>
            {takeMessage(takeState, take) && (
              <p
                className="font-body text-xs text-beige/70"
                data-testid="results-take-status"
              >
                {takeMessage(takeState, take)}
              </p>
            )}
          </div>
        )}

        {shareArtifact}
      </section>

      {/* ------------------------------------------------------------- */}
      {/* Layer 2 — the two numbers (§6)                                 */}
      {/* ------------------------------------------------------------- */}
      <section
        data-testid="results-layer-2"
        aria-label="The two numbers"
        className="space-y-2 font-body"
      >
        <p className="text-2xl text-bone-white" data-testid="results-score">
          Score: <span className="font-bold text-venom-orange">{score}</span>
        </p>
        <p
          className="flex items-center justify-center gap-2 text-2xl text-bone-white"
          data-testid="results-yield"
        >
          <IconDna size={22} className="text-venom-orange" />
          Yield:{' '}
          <span className="font-bold text-venom-orange text-glow-orange">
            {yieldDna ?? dnaCredited ?? 0}
          </span>
        </p>
        {!practice && dnaCredited !== null && yieldDna !== null && dnaCredited !== yieldDna && (
          <p className="text-sm text-beige/70" data-testid="results-credited">
            Credited this run: {dnaCredited} DNA
          </p>
        )}
        {practice && (
          <p className="text-sm text-beige/70" data-testid="gameover-hypothetical">
            Practice pays nothing — this is what the run was worth.
          </p>
        )}
        {serpent?.live && (
          <p className="text-lg text-beige" data-testid="results-depth">
            Depth this week:{' '}
            <span className="font-bold text-[#7df9ff]">
              {serpent.weekDepth.toLocaleString()}
            </span>{' '}
            segments
            {serpent.deltaVsBestWeek !== 0 && (
              <span className="text-beige/70">
                {' '}
                ({serpent.deltaVsBestWeek > 0 ? '+' : ''}
                {serpent.deltaVsBestWeek.toLocaleString()} vs your best week)
              </span>
            )}
            {serpent.runCounts && (
              <span className="block text-sm text-beige/70">
                This run&apos;s Yield counts toward the week.
              </span>
            )}
          </p>
        )}
      </section>

      {/* ------------------------------------------------------------- */}
      {/* Layer 3 — one collapsed digest, exactly one next action        */}
      {/* ------------------------------------------------------------- */}
      <section
        data-testid="results-layer-3"
        aria-label="Progression"
        className="space-y-4"
      >
        {hasDigest && (
          <details className="panel p-3 text-left" data-testid="results-digest">
            <summary className="label-arcade cursor-pointer text-cosmic">
              What this run moved
            </summary>
            <div className="space-y-3 pt-3">
              {digest.mastery && (
                <div data-testid="gameover-mastery" className="space-y-1">
                  <p className="font-body text-sm text-beige">
                    <span className="font-bold text-[#7df9ff]">
                      +{digest.mastery.xpGained.toLocaleString()} Mastery XP
                    </span>{' '}
                    <span className="text-beige/70">
                      {digest.mastery.dynasty} M{digest.mastery.level}
                    </span>
                  </p>
                  {digest.mastery.leveledUp && (
                    <div data-testid="mastery-levelup" className="space-y-1">
                      <p className="font-body text-sm font-bold text-[#facc15]">
                        Mastery M{digest.mastery.level} — {digest.mastery.dynasty}
                      </p>
                      {digest.mastery.unlocks.map((unlock) => (
                        <p
                          key={unlock.level}
                          className="font-body text-xs text-bone-white"
                        >
                          {unlock.kind === 'mutation'
                            ? `New gene in your pool: ${unlock.label}`
                            : `Unlocked: ${unlock.label}`}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {digest.codex.length > 0 && (
                <div data-testid="codex-discoveries" className="space-y-1">
                  <p className="label-arcade text-cosmic">New Codex discoveries</p>
                  <div className="flex flex-wrap gap-2">
                    {digest.codex.map((entry) => (
                      <span
                        key={entry.key}
                        className="rounded-arcade border border-cosmic/50 bg-cosmic/10 px-2 py-1 font-body text-xs text-bone-white"
                      >
                        {entry.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {digest.genes.length > 0 && (
                <div data-testid="gameover-mutations" className="flex flex-wrap gap-2">
                  {digest.genes.map((gene) => (
                    <span
                      key={gene}
                      className="inline-flex items-center rounded-arcade border border-[#a855f7]/60 bg-[#a855f7]/10 px-2.5 py-1 font-body text-xs text-[#c4b5fd]"
                    >
                      {gene}
                    </span>
                  ))}
                </div>
              )}

              {digest.streakDays !== null && (
                <p className="flex items-center gap-1.5 font-body text-sm text-beige">
                  <IconFlame size={16} className="text-venom-orange" />
                  Day{' '}
                  <span className="font-bold text-venom-orange">
                    {digest.streakDays}
                  </span>{' '}
                  streak
                </p>
              )}

              {playerCard}
              {analyst}
            </div>
          </details>
        )}

        {nextAction.href ? (
          <Link
            href={nextAction.href}
            data-testid="results-next-action"
            data-next-action={nextAction.id}
            className="panel-glow [--glow:#22d3ee] mx-auto flex min-h-[44px] max-w-lg items-center justify-between gap-3 px-5 py-4 text-left"
          >
            <span>
              <span className="block heading-display text-lg text-[#7df9ff]">
                {nextAction.label}
              </span>
              <span className="block font-body text-sm text-beige/75">
                {nextAction.description}
              </span>
            </span>
            <IconArrowRight size={20} className="shrink-0 text-[#7df9ff]" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onNextAction}
            data-testid="results-next-action"
            data-next-action={nextAction.id}
            className="panel-glow [--glow:#22d3ee] mx-auto flex min-h-[44px] w-full max-w-lg items-center justify-between gap-3 px-5 py-4 text-left"
          >
            <span>
              <span className="block heading-display text-lg text-[#7df9ff]">
                {nextAction.label}
              </span>
              <span className="block font-body text-sm text-beige/75">
                {nextAction.description}
              </span>
            </span>
            <IconArrowRight size={20} className="shrink-0 text-[#7df9ff]" />
          </button>
        )}
      </section>

      {/* The run loop's own controls — §5: REPLAY re-enters with the same
          configuration (≤2 taps), SETUP reopens the setup page. */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={onReplay}
          disabled={replayDisabled}
          data-testid="results-replay"
          className={`btn-go inline-flex min-h-[44px] items-center gap-2 px-8 py-4 text-xl ${
            replayDisabled ? 'cursor-wait' : 'animate-glow-pulse shadow-venom-orange/50'
          }`}
        >
          <IconPlay size={20} />
          {replayPending ? 'Starting…' : 'Replay'}
        </button>
        <button
          type="button"
          onClick={onSetup}
          data-testid="results-setup"
          className="btn-neutral inline-flex min-h-[44px] items-center gap-2 px-6 py-3"
        >
          <IconReset size={18} />
          Setup
        </button>
      </div>
    </div>
  );
}

export default RunResults;

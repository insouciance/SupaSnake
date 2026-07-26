'use client';

/**
 * The Run Setup page (Constitution §5, owner ruling 25 July 2026).
 *
 * "Launch opens one consolidated setup surface — dynasty and snake, mode
 * context, aim system, control scheme — with the primary START action always
 * pre-configured from the player's last choices. First-time players see it
 * fully preset: START is the only emphasized action, zero required
 * configuration. Everything adjustable, nothing demanded."
 *
 * So: one summary line of what is already chosen, one emphasised START, and
 * every control folded into a single collapsed "Adjust this run" disclosure.
 * The law it serves is open → LAUNCH → START → board, **≤3 taps**, of which
 * this page is exactly one.
 *
 * The board, the cockpit HUD, the control schemes and the decision overlays
 * are declared correct as built and are not touched here.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconPlay, IconSnake } from '@/components/ui/icons';

export interface RunSetupSnake {
  name: string;
  generation: number;
  dynasty: string;
}

export interface RunSetupPanelProps {
  snake: RunSetupSnake | null;
  /** True once the collection resolved and there is nothing to run with. */
  noSnakeAvailable: boolean;
  /** One sentence on what this dynasty's ruleset does. */
  rulesetExplainer: string;
  /** Dynasty mastery level, when known. */
  masteryLevel: number | null;
  /** Human label for the pre-selected mode ("Earning run", "Free Play", …). */
  modeLabel: string;
  /** Human label for the pre-selected aim system. */
  aimLabel: string;
  /** Label of the primary action, e.g. "Start run". */
  startLabel: string;
  /**
   * The dare, when this run was opened from a challenge link (§11.3). One
   * line, above START, so the visitor knows what they are playing before
   * they play it. Display only — it reaches no payout and no leaderboard.
   */
  challengeNote?: string | null;
  /**
   * Test id of the primary action. Mode-dependent (`earn-start`,
   * `anomaly-start`, `free-play-start`) so the shipped e2e journeys address
   * the same button under either side of the flag.
   */
  startTestId: string;
  isStarting: boolean;
  onStart: () => void;
  startError: string | null;
  /**
   * What the equipped snake brings to this run (WP-2.07a). Always visible,
   * OUTSIDE the disclosure: a trait that removes a whole system from the run
   * is not an adjustable setting, it is something the player has to know
   * before pressing START. Carries no `btn-go`.
   */
  heirloom?: ReactNode;
  /** The adjustable controls, all inside the one collapsed disclosure. */
  modeToggle?: ReactNode;
  anomalyPanel?: ReactNode;
  aimSelector?: ReactNode;
  controlScheme?: ReactNode;
  buildSeed?: ReactNode;
}

export function RunSetupPanel({
  snake,
  noSnakeAvailable,
  rulesetExplainer,
  masteryLevel,
  modeLabel,
  aimLabel,
  startLabel,
  challengeNote,
  startTestId,
  isStarting,
  onStart,
  startError,
  heirloom,
  modeToggle,
  anomalyPanel,
  aimSelector,
  controlScheme,
  buildSeed,
}: RunSetupPanelProps) {
  const hasAdjustables =
    Boolean(modeToggle) ||
    Boolean(anomalyPanel) ||
    Boolean(aimSelector) ||
    Boolean(controlScheme) ||
    Boolean(buildSeed);

  return (
    <div className="space-y-6" data-testid="run-setup">
      <h2 className="heading-display animate-breathe text-4xl text-venom-orange text-glow-orange">
        Ready to Play
      </h2>

      {snake ? (
        <div className="space-y-2">
          <div className="panel inline-flex items-center gap-3 px-4 py-3 font-body">
            <IconSnake size={20} className="text-venom-orange" />
            <p>
              <span className="heading-display text-lg text-bone-white">
                {snake.name}
              </span>
              <span className="text-beige/70"> · Gen {snake.generation}</span>
              <span className="text-beige/70"> · {snake.dynasty}</span>
              <Link
                href="/lab"
                className="ml-3 text-venom-orange underline transition-colors hover:text-venom-orange-light"
              >
                Change in Lab
              </Link>
            </p>
          </div>
          <p className="font-body text-sm text-beige/80" data-testid="ruleset-explainer">
            {rulesetExplainer}
          </p>
          {/* The whole configuration in one line: nothing needs a decision. */}
          <p className="font-body text-sm text-beige/70" data-testid="run-setup-summary">
            {modeLabel} · {aimLabel}
            {masteryLevel !== null && (
              <span data-testid="mastery-chip"> · Mastery M{masteryLevel}</span>
            )}
          </p>
          <p className="font-body text-xs text-beige/50">
            Exit portal banks +25% — crashing salvages 60%
          </p>
        </div>
      ) : noSnakeAvailable ? (
        <p className="font-body text-beige">
          We couldn&apos;t prepare your snake. Return Home and Retry.
        </p>
      ) : (
        <p className="font-body text-beige/70">Loading your snake...</p>
      )}

      {snake && heirloom}

      {challengeNote && (
        <p
          className="panel inline-flex px-4 py-2 font-body text-sm text-cosmic"
          data-testid="challenge-note"
        >
          {challengeNote}
        </p>
      )}

      {startError && (
        <div className="animate-fade-up rounded-arcade border border-strike-red/70 bg-strike-red/15 px-4 py-2">
          <p className="font-body text-strike-red">{startError}</p>
        </div>
      )}

      {noSnakeAvailable ? (
        <Link
          href="/"
          className="btn-go inline-flex min-h-[44px] items-center gap-2 px-8 py-3 text-lg"
        >
          Return Home to Retry
        </Link>
      ) : (
        <button
          type="button"
          onClick={onStart}
          disabled={isStarting || !snake}
          data-testid={startTestId}
          className={`btn-go inline-flex min-h-[44px] items-center gap-2 px-8 py-4 text-xl ${
            isStarting || !snake
              ? 'cursor-wait'
              : 'animate-glow-pulse shadow-venom-orange/50'
          }`}
        >
          <IconPlay size={22} />
          {isStarting ? 'Starting...' : startLabel}
        </button>
      )}

      {/* Everything adjustable, nothing demanded: one disclosure, closed. */}
      {!noSnakeAvailable && hasAdjustables && (
        <details className="panel p-3 text-left" data-testid="run-setup-adjust">
          <summary className="label-arcade cursor-pointer text-cosmic">
            Adjust this run
          </summary>
          <div className="space-y-4 pt-3">
            {modeToggle}
            {anomalyPanel}
            {aimSelector}
            {controlScheme}
            {buildSeed}
          </div>
        </details>
      )}
    </div>
  );
}

export default RunSetupPanel;

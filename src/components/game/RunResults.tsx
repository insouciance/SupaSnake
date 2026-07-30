'use client';

/**
 * Results has exactly three constitutional layers:
 * 1. outcome, personal best, share, Daily Take
 * 2. Score and Yield/Depth
 * 3. one collapsed server-authored impact digest and one next action
 *
 * Replay and Setup remain outside the layers and immediately available. No
 * commercial surface, transient build inventory, identity card, or async
 * Analyst request competes with the run's recognition moment.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  IconArrowRight,
  IconDna,
  IconGift,
  IconMedal,
  IconPlay,
  IconReset,
} from '@/components/ui/icons';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { trackEvent } from '@/lib/analytics/posthog';
import type { DailyTakeSlot } from '@/lib/game/dailyTake';
import type { ResultsNextAction } from '@/lib/game/resultsNextAction';
import {
  groupRunImpacts,
  impactSummary,
  type RunImpact,
  type RunImpactEnvelope,
  type RunImpactGroup,
} from '@/lib/game/runImpactClient';
import {
  formatYieldMultiplier,
  type AscendanceYieldBreakdown,
} from '@/shared/game/ascendance';
import { CAREER_SPINE_V1_ENABLED } from '@/lib/features/careerSpine';

export type RunResultsOutcome = 'extracted' | 'crashed';
export type TakeCollectState =
  | 'idle'
  | 'collecting'
  | 'collected'
  | 'unavailable'
  | 'error';

export interface RunResultsClanBattle {
  eligible?: boolean;
  reason?: string;
  enteredTopFive?: boolean;
  replacedSessionId?: string | null;
  scoreDelta?: number;
  clanTotal?: number;
  fifthBest?: number;
  /** Retained for API compatibility; the full five belongs on the Clan page. */
  topFive?: Array<{
    sessionId: string;
    score: number;
    rank: number;
    energyCommitted: number;
    generation: number;
  }>;
}

export interface RunResultsProps {
  outcome: RunResultsOutcome;
  practice: boolean;
  score: number;
  dnaCredited: number | null;
  yieldDna: number | null;
  yieldBreakdown: AscendanceYieldBreakdown | null;
  energyCommitted: number;
  commitmentMultiplierBps: number;
  clanBattle: RunResultsClanBattle | null;
  take: DailyTakeSlot | null;
  takeState: TakeCollectState;
  onCollectTake: () => void;
  impact: RunImpactEnvelope | null;
  nextAction: ResultsNextAction;
  onNextAction: () => void;
  onReplay: () => void;
  onSetup: () => void;
  replayPending: boolean;
  replayDisabled: boolean;
  replayEnergy: number;
  shareArtifact?: ReactNode;
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
      return 'Your Take settles with the day.';
    case 'error':
      return 'Could not collect right now — it will keep.';
    default:
      return take.collected ? 'Already collected today.' : null;
  }
}

function impactTone(group: RunImpactGroup): string {
  if (group.significance === 'historic') return 'border-[#facc15]/70 bg-[#facc15]/10';
  if (group.significance === 'milestone') return 'border-cosmic/70 bg-cosmic/10';
  return 'border-scale-blue-light/40 bg-scale-blue/10';
}

function ImpactProgress({ impact, animateAfter }: {
  impact: RunImpact;
  animateAfter: boolean;
}) {
  if (impact.before === undefined || impact.after === undefined) return null;
  const metadataTarget = impact.metadata?.target;
  const max =
    typeof metadataTarget === 'number' && Number.isFinite(metadataTarget)
      ? Math.max(metadataTarget, impact.after, 1)
      : Math.max(impact.after, impact.before, 1);
  const width = Math.max(
    0,
    Math.min(100, ((animateAfter ? impact.after : impact.before) / max) * 100)
  );
  return (
    <div className="mt-2 space-y-1">
      <div
        role="progressbar"
        aria-label={`${impact.headline} progress`}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={impact.after}
        className="h-1.5 overflow-hidden rounded-full bg-void-deep/80"
      >
        <div
          className="h-full rounded-full bg-cosmic transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="font-mono text-[11px] text-beige/60">
        {impact.before.toLocaleString()} → {impact.after.toLocaleString()}
      </p>
    </div>
  );
}

function ImpactReview({ envelope }: { envelope: RunImpactEnvelope }) {
  const groups = useMemo(() => groupRunImpacts(envelope), [envelope]);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [animateAfter, setAnimateAfter] = useState(false);
  const current = groups[index];

  useEffect(() => {
    if (!current) return;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setAnimateAfter(true);
      return;
    }
    setAnimateAfter(false);
    if (typeof window.requestAnimationFrame !== 'function') {
      setAnimateAfter(true);
      return;
    }
    const frame = window.requestAnimationFrame(() => setAnimateAfter(true));
    return () => window.cancelAnimationFrame(frame);
  }, [current]);

  if (groups.length === 0) {
    return (
      <ul className="space-y-2" data-testid="impact-routine-list">
        {envelope.impacts.map((impact) => (
          <li key={impact.key} className="font-body text-sm text-beige">
            {impact.headline}
            {impact.detail ? <span className="text-beige/65"> — {impact.detail}</span> : null}
          </li>
        ))}
      </ul>
    );
  }

  if (finished || !current) {
    return (
      <p className="font-body text-sm text-beige" role="status">
        Recognition reviewed. Everything shown was secured when the run settled.
      </p>
    );
  }

  const complete = () => {
    setFinished(true);
    trackEvent(AnalyticsEvents.RUN_IMPACT_REVIEW_COMPLETED, {
      session_id: envelope.sessionId,
      beat_count: groups.length,
      category: 'engagement',
    });
  };

  return (
    <div className="space-y-3" data-testid="impact-review">
      <p className="font-body text-xs uppercase tracking-wide text-beige/60">
        {index + 1} of {groups.length}
      </p>
      <div
        key={current.id}
        className={`rounded-arcade border p-3 animate-pop-in motion-reduce:animate-none ${impactTone(current)}`}
        aria-live="polite"
        data-testid={`impact-beat-${current.id}`}
      >
        <p className="label-arcade text-cosmic">{current.label}</p>
        <ul className="mt-2 space-y-3">
          {current.impacts.map((impact) => (
            <li key={impact.key}>
              <p className="font-body text-sm font-bold text-bone-white">
                {impact.headline}
              </p>
              {impact.detail ? (
                <p className="font-body text-xs text-beige/70">{impact.detail}</p>
              ) : null}
              <ImpactProgress impact={impact} animateAfter={animateAfter} />
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {groups.length > 1 && (
          <button
            type="button"
            className="btn-neutral min-h-[44px] px-4 py-2 text-xs"
            onClick={() => {
              setFinished(true);
              trackEvent(AnalyticsEvents.RUN_IMPACT_REVIEW_SKIPPED, {
                session_id: envelope.sessionId,
                stopped_at: index,
                beat_count: groups.length,
                category: 'engagement',
              });
            }}
            data-testid="impact-review-skip"
          >
            Skip review
          </button>
        )}
        <button
          type="button"
          className="btn-neutral min-h-[44px] px-4 py-2 text-xs"
          onClick={() => {
            if (index + 1 >= groups.length) {
              complete();
            } else {
              setIndex((value) => value + 1);
              trackEvent(AnalyticsEvents.RUN_IMPACT_REVIEW_ADVANCED, {
                session_id: envelope.sessionId,
                beat_index: index + 1,
                beat_count: groups.length,
                category: 'engagement',
              });
            }
          }}
          data-testid="impact-review-next"
        >
          {index + 1 >= groups.length ? 'Done' : 'Next'}
        </button>
      </div>
    </div>
  );
}

export function RunResults({
  outcome,
  practice,
  score,
  dnaCredited,
  yieldDna,
  yieldBreakdown,
  energyCommitted,
  commitmentMultiplierBps,
  clanBattle,
  take,
  takeState,
  onCollectTake,
  impact,
  nextAction,
  onNextAction,
  onReplay,
  onSetup,
  replayPending,
  replayDisabled,
  replayEnergy,
  shareArtifact,
}: RunResultsProps) {
  const [impactReviewStarted, setImpactReviewStarted] = useState(false);
  const head = headline(outcome, practice);
  const receipt = impact?.receipt;
  const settledScore = receipt?.score ?? score;
  const settledYield = receipt?.yieldDna ?? yieldDna ?? dnaCredited ?? 0;
  const credited = receipt?.dnaCredited ?? dnaCredited;
  const committed = receipt?.energyCommitted ?? energyCommitted;
  const multiplier = receipt?.commitmentMultiplierBps ?? commitmentMultiplierBps;
  const personalBest = receipt?.personalBest.improved === true;

  return (
    <div className="space-y-6" data-testid="run-results">
      <section data-testid="results-layer-1" aria-label="Outcome" className="space-y-4">
        <div className="space-y-1">
          <h2 className={`heading-display text-4xl text-glow ${head.tone}`} data-testid={head.testId}>
            {head.title}
          </h2>
          <p className="font-body text-sm uppercase tracking-wide text-beige/60">
            {head.detail}
          </p>
        </div>

        {personalBest && (
          <p className="inline-flex items-center justify-center gap-2 rounded-arcade border border-venom-orange/60 bg-venom-orange/10 px-4 py-2 font-body text-sm font-bold text-venom-orange" data-testid="results-personal-best">
            <IconMedal size={18} /> Personal best
          </p>
        )}

        {take && (
          <div className="panel-glow [--glow:#facc15] mx-auto max-w-lg space-y-2 px-5 py-4 text-left" data-testid="results-take">
            <p className="label-arcade text-[#facc15]">Daily Take</p>
            <p className="font-body text-sm text-beige/85">
              The day&apos;s first run pays <span className="font-bold text-bone-white">{take.amount} DNA</span>
              {take.streakDays > 0 ? ` · day ${take.streakDays} streak${take.multiplier > 1 ? ` ×${take.multiplier}` : ''}` : ''}.
            </p>
            <button type="button" onClick={onCollectTake} disabled={take.collected || takeState === 'collecting' || takeState === 'collected' || takeState === 'unavailable'} data-testid="results-take-collect" className="btn-neutral inline-flex min-h-[44px] items-center gap-2 px-5 py-2">
              <IconGift size={18} /> Collect
            </button>
            {takeMessage(takeState, take) && <p className="font-body text-xs text-beige/70" data-testid="results-take-status">{takeMessage(takeState, take)}</p>}
          </div>
        )}
        {shareArtifact}
      </section>

      <section data-testid="results-layer-2" aria-label="The two numbers" className="space-y-2 font-body">
        <p className="text-2xl text-bone-white" data-testid="results-score">
          Score: <span className="font-bold text-venom-orange">{settledScore.toLocaleString()}</span>
        </p>
        <p className="flex items-center justify-center gap-2 text-2xl text-bone-white" data-testid="results-yield">
          <IconDna size={22} className="text-venom-orange" /> Yield:{' '}
          <span className="font-bold text-venom-orange text-glow-orange">{settledYield.toLocaleString()}</span>
        </p>

        {!practice && credited !== null && (
          <p className="text-sm text-beige/70" data-testid="results-energy">
            {committed > 0 ? `${committed} Energy committed` : multiplier < 10_000 ? 'Lean run' : 'Energy-exempt run'} · {credited.toLocaleString()} DNA credited
          </p>
        )}
        {practice && <p className="text-sm text-beige/70" data-testid="gameover-hypothetical">Practice pays nothing — this is what the run was worth.</p>}

        {(yieldBreakdown || (!practice && credited !== null)) && (
          <details className="mx-auto max-w-sm rounded-arcade border border-scale-blue-light/25 bg-void-deep/40 px-4 py-2 text-left" data-testid="results-receipt-details">
            <summary className="cursor-pointer text-xs text-beige/65">How Yield was settled</summary>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-5 gap-y-1 text-sm" data-testid={yieldBreakdown ? 'results-yield-breakdown' : undefined}>
              {yieldBreakdown && <>
                <span className="text-beige/70">Base run Yield</span><span className="text-right font-mono text-bone-white">{yieldBreakdown.baseYield.toLocaleString()}</span>
                <span className="text-beige/70">Gen {yieldBreakdown.generation} Yield ×{formatYieldMultiplier(yieldBreakdown.multiplier)}</span><span className="text-right font-mono text-venom-orange">+{yieldBreakdown.bonusYield.toLocaleString()}</span>
              </>}
              {!practice && credited !== null && <>
                <span className="text-beige/70">Harvest multiplier</span><span className="text-right font-mono text-bone-white">×{(multiplier / 10_000).toFixed(multiplier < 10_000 ? 2 : 1)}</span>
                <span className="font-bold text-beige">Credited</span><span className="text-right font-mono font-bold text-bone-white">{credited.toLocaleString()} DNA</span>
              </>}
            </div>
          </details>
        )}

        {clanBattle?.eligible && (
          <div className="panel-glow [--glow:#7df9ff] mx-auto max-w-lg space-y-2 px-4 py-3 text-left" data-testid="results-clan-battle">
            <p className="label-arcade text-[#7df9ff]">Clan Energy Battle</p>
            <p className="font-body text-sm text-bone-white">
              {clanBattle.enteredTopFive
                ? `Entered your five${(clanBattle.scoreDelta ?? 0) > 0 ? ` · +${(clanBattle.scoreDelta ?? 0).toLocaleString()} Clan Depth` : ''}.`
                : `Did not beat your fifth-best result${(clanBattle.fifthBest ?? 0) > 0 ? ` of ${(clanBattle.fifthBest ?? 0).toLocaleString()} Yield` : ''}.`}
            </p>
            {clanBattle.replacedSessionId ? <p className="font-body text-xs text-beige/65">Replaced a weaker result.</p> : null}
          </div>
        )}
        {!clanBattle?.eligible && clanBattle?.reason === 'validation_or_timing' && outcome === 'crashed' && (
          <p className="mx-auto max-w-lg font-body text-sm text-strike-red" data-testid="results-clan-battle-lost">The crash salvaged personal DNA, but the potential clan result was not banked.</p>
        )}
      </section>

      <section data-testid="results-layer-3" aria-label="Progression" className="space-y-4">
        <details
          className="panel p-3 text-left"
          data-testid="results-digest"
          onToggle={(event) => {
            const open = (event.currentTarget as HTMLDetailsElement).open;
            if (CAREER_SPINE_V1_ENABLED && open && impact) {
              trackEvent(AnalyticsEvents.RUN_IMPACT_REVIEW_OPENED, {
                session_id: impact.sessionId,
                impact_count: impact.impacts.length,
                featured_count: impact.featuredImpactKeys.length,
                category: 'engagement',
              });
            }
          }}
        >
          <summary
            className="label-arcade cursor-pointer text-cosmic"
            onClick={() => setImpactReviewStarted(true)}
          >
            What this run moved
          </summary>
          <div className="space-y-3 pt-3">
            <p className="font-body text-sm text-beige/80" data-testid="impact-summary">
              {CAREER_SPINE_V1_ENABLED
                ? impact
                  ? impactSummary(impact)
                  : practice
                    ? 'Practice advances no persistent progress.'
                    : 'Run impact is pending server recovery.'
                : practice
                  ? 'Practice advances no persistent progress.'
                  : 'Persistent progress was secured by the server.'}
            </p>
            {CAREER_SPINE_V1_ENABLED && impact && impactReviewStarted ? (
              <ImpactReview envelope={impact} />
            ) : null}
            {CAREER_SPINE_V1_ENABLED && !impact ? (
              <p className="font-body text-xs text-beige/60">
                {practice
                  ? 'Only the live practice session existed; closing it leaves no earned state behind.'
                  : 'Rewards remain server-authoritative; no progress is reconstructed on this device.'}
              </p>
            ) : null}
          </div>
        </details>

        {nextAction.href ? (
          <Link href={nextAction.href} data-testid="results-next-action" data-next-action={nextAction.id} className="panel-glow [--glow:#22d3ee] mx-auto flex min-h-[44px] max-w-lg items-center justify-between gap-3 px-5 py-4 text-left">
            <span><span className="block heading-display text-lg text-[#7df9ff]">{nextAction.label}</span><span className="block font-body text-sm text-beige/75">{nextAction.description}</span></span>
            <IconArrowRight size={20} className="shrink-0 text-[#7df9ff]" />
          </Link>
        ) : (
          <button type="button" onClick={onNextAction} data-testid="results-next-action" data-next-action={nextAction.id} className="panel-glow [--glow:#22d3ee] mx-auto flex min-h-[44px] w-full max-w-lg items-center justify-between gap-3 px-5 py-4 text-left">
            <span><span className="block heading-display text-lg text-[#7df9ff]">{nextAction.label}</span><span className="block font-body text-sm text-beige/75">{nextAction.description}</span></span>
            <IconArrowRight size={20} className="shrink-0 text-[#7df9ff]" />
          </button>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <button type="button" onClick={onReplay} disabled={replayDisabled} data-testid="results-replay" className={`btn-go inline-flex min-h-[44px] items-center gap-2 px-8 py-4 text-xl ${replayDisabled ? 'cursor-wait' : 'animate-glow-pulse shadow-venom-orange/50'}`}>
          <IconPlay size={20} /> {replayPending ? 'Starting…' : replayEnergy > 0 ? `Replay · ${replayEnergy} Energy` : 'Replay · Lean'}
        </button>
        <button type="button" onClick={onSetup} data-testid="results-setup" className="btn-neutral inline-flex min-h-[44px] items-center gap-2 px-6 py-3">
          <IconReset size={18} /> Setup
        </button>
      </div>
    </div>
  );
}

export default RunResults;

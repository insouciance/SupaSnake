'use client';

/**
 * Results has exactly three constitutional layers:
 * 1. outcome, personal best, share, Daily Take
 * 2. Score and Yield/Depth
 * 3. one server-authored, player-collected victory lap and one next action
 *
 * Replay and Setup remain outside the layers and immediately available. No
 * commercial surface, transient build inventory, identity card, or async
 * Analyst request competes with the run's recognition moment.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  IconArrowRight,
  IconCheck,
  IconDna,
  IconGift,
  IconFlask,
  IconLock,
  IconMedal,
  IconPlay,
  IconReset,
  IconShield,
  IconTrophy,
  IconUser,
} from '@/components/ui/icons';
import {
  DnaGlyph,
  ShieldGlyph,
  StrainGlyph,
} from '@/components/game/cockpit/CockpitGlyphs';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { trackEvent } from '@/lib/analytics/posthog';
import type { DailyTakeSlot } from '@/lib/game/dailyTake';
import type { ResultsNextAction } from '@/lib/game/resultsNextAction';
import {
  impactSummary,
  type RunImpact,
  type RunImpactEnvelope,
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
  thresholdBefore?: number;
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
  settlementPending: boolean;
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

function motionIsReduced(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

function ImpactProgress({ impact, collected }: {
  impact: RunImpact;
  collected: boolean;
}) {
  const hasProgress = impact.before !== undefined && impact.after !== undefined;
  const before = impact.before ?? 0;
  const after = impact.after ?? before;
  // Deterministic for SSR/hydration. Reduced-motion clients switch to the
  // final value in the effect below without animating the transition.
  const [displayedValue, setDisplayedValue] = useState(before);
  useEffect(() => {
    if (!collected) {
      setDisplayedValue(before);
      return;
    }
    const reduced = motionIsReduced();
    if (reduced) {
      setDisplayedValue(after);
      return;
    }
    setDisplayedValue(before);
    if (typeof window.requestAnimationFrame !== 'function') {
      setDisplayedValue(after);
      return;
    }
    const frame = window.requestAnimationFrame(() => setDisplayedValue(after));
    return () => window.cancelAnimationFrame(frame);
  }, [after, before, collected]);
  if (!hasProgress) return null;
  const metadataTarget = impact.metadata?.target;
  const max =
    typeof metadataTarget === 'number' && Number.isFinite(metadataTarget)
      ? Math.max(metadataTarget, after, 1)
      : Math.max(after, before, 1);
  const width = Math.max(0, Math.min(100, (displayedValue / max) * 100));
  return (
    <div className="mt-2 space-y-1">
      <div
        role="progressbar"
        aria-label={`${impact.headline} progress`}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={displayedValue}
        className="h-1.5 overflow-hidden rounded-full bg-void-deep/80"
      >
        <div
          className="h-full rounded-full bg-cosmic transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="font-mono text-[11px] text-beige/60">
        {collected
          ? `${before.toLocaleString()} → ${after.toLocaleString()}`
          : `${before.toLocaleString()} · ready to advance`}
      </p>
    </div>
  );
}

type ClaimBeatKind = 'dna' | 'career' | 'clan';

interface ClaimBeat {
  id: ClaimBeatKind;
  eyebrow: string;
  headline: string;
  detail: string;
  collectLabel: string;
  payoff: string;
  impacts: RunImpact[];
  tone: string;
  orb: string;
  action: string;
}

interface ResultDestinationHighlight {
  id: 'you' | 'lab' | 'compete';
  label: string;
  headline: string;
  count: number;
  tone: string;
  Icon: typeof IconUser;
}

const DYNASTY_STRAIN = {
  CYBER: 'VOLT',
  PRIMAL: 'FERAL',
  COSMIC: 'FLUX',
} as const;

const SIGNIFICANCE_RANK: Record<RunImpact['significance'], number> = {
  routine: 0,
  notable: 1,
  milestone: 2,
  historic: 3,
};

function formatCommitmentMultiplier(bps: number): string {
  const multiplier = Math.max(0, bps) / 10_000;
  return multiplier.toFixed(multiplier < 1 ? 2 : 1);
}

function claimSource(envelope: RunImpactEnvelope): RunImpact[] {
  const byKey = new Map(envelope.impacts.map((impact) => [impact.key, impact]));
  // The server orders featured keys by significance. Reassert that invariant
  // at the rendering boundary as well, so an older recovered envelope cannot
  // pair a weaker headline with a stronger reward's action language.
  const selected = envelope.featuredImpactKeys
    .map((key, index) => ({ impact: byKey.get(key), index }))
    .filter(
      (entry): entry is { impact: RunImpact; index: number } => Boolean(entry.impact)
    )
    .sort(
      (a, b) =>
        SIGNIFICANCE_RANK[b.impact.significance] -
          SIGNIFICANCE_RANK[a.impact.significance] || a.index - b.index
    )
    .map(({ impact }) => impact);
  const clan = envelope.impacts.filter(
    (impact) => impact.pillar === 'clan' && impact.significance !== 'routine'
  );
  const merged = new Map<string, RunImpact>();
  for (const impact of [...selected, ...clan]) merged.set(impact.key, impact);
  if (merged.size > 0) return Array.from(merged.values());

  // Routine movement is visible in the secured summary below, but never asks
  // for a second ceremonial tap. Claiming is reserved for a real prize,
  // milestone, discovery, or social achievement.
  return [];
}

function buildClaimBeats(envelope: RunImpactEnvelope): ClaimBeat[] {
  const beats: ClaimBeat[] = [];
  const credited = envelope.receipt.dnaCredited;
  if (credited > 0) {
    const committedUnits = envelope.receipt.energyCommitted;
    beats.push({
      id: 'dna',
      eyebrow: envelope.outcome === 'crashed' ? 'Salvage capsule' : 'Harvest capsule',
      headline: `+${credited.toLocaleString()} DNA`,
      detail:
        committedUnits > 0
          ? `${committedUnits} Energy committed · ×${formatCommitmentMultiplier(envelope.receipt.commitmentMultiplierBps)} harvest. Your balance is already secured.`
          : 'The server has already secured this harvest in your balance.',
      collectLabel: envelope.outcome === 'crashed' ? 'Collect salvage' : 'Collect DNA',
      payoff: `${credited.toLocaleString()} DNA secured in your vault`,
      impacts: [],
      tone: 'border-venom-orange/70 bg-venom-orange/10 text-venom-orange',
      orb: 'border-venom-orange/80 bg-venom-orange/15 text-venom-orange shadow-[0_0_40px_rgba(250,204,21,0.3)]',
      action: 'border-venom-orange bg-venom-orange text-void-deep hover:brightness-110',
    });
  }

  const source = claimSource(envelope);
  const career = source.filter((impact) => impact.pillar !== 'clan');
  const clan = source.filter((impact) => impact.pillar === 'clan');

  if (career.length > 0) {
    const first = career[0];
    const primaryIsMastery = first.kind === 'mastery_level';
    const primaryIsDiscovery =
      first.kind === 'codex_discovery' || first.kind === 'codex_milestone';
    beats.push({
      id: 'career',
      eyebrow: primaryIsMastery
        ? 'Mastery promotion'
        : primaryIsDiscovery
          ? 'Genome discovery'
          : 'Progress secured',
      headline: first.headline,
      detail:
        career.length > 1
          ? `${career.length} connected advances arrived from this run.`
          : first.detail ?? 'Added to your permanent career record.',
      collectLabel: primaryIsMastery
        ? 'Accept mastery'
        : primaryIsDiscovery
          ? 'Reveal discovery'
          : 'Accept progress',
      payoff: `${first.headline} added to your career`,
      impacts: career,
      tone: 'border-cosmic/70 bg-cosmic/10 text-cosmic-glow',
      orb: 'border-cosmic/80 bg-cosmic/15 text-cosmic-glow shadow-[0_0_40px_rgba(168,85,247,0.32)]',
      action: 'border-cosmic bg-cosmic text-bone-white hover:brightness-110',
    });
  }

  if (clan.length > 0) {
    const first = clan[0];
    const trophy = clan.some((impact) => impact.kind === 'clan_top_five');
    beats.push({
      id: 'clan',
      eyebrow: trophy ? 'Clan performance trophy' : 'Clan contribution',
      headline: first.headline,
      detail: first.detail ?? 'Your contribution is now visible to your clan.',
      collectLabel: trophy ? 'Raise trophy' : 'Accept contribution',
      payoff: `${first.headline} is now visible to your clan`,
      impacts: clan,
      tone: 'border-cyber/70 bg-cyber/10 text-cyber',
      orb: 'border-cyber/80 bg-cyber/15 text-cyber shadow-[0_0_44px_rgba(34,211,238,0.34)]',
      action: 'border-cyber bg-cyber text-void-deep hover:brightness-110',
    });
  }

  return beats;
}

function BeatRune({ kind, dynasty, compact = false }: {
  kind: ClaimBeatKind;
  dynasty: RunImpactEnvelope['dynasty'];
  compact?: boolean;
}) {
  return (
    <span className={`block ${compact ? 'h-6 w-6' : 'h-12 w-12'}`} aria-hidden="true">
      {kind === 'dna' ? (
        <DnaGlyph />
      ) : kind === 'career' ? (
        <StrainGlyph id={DYNASTY_STRAIN[dynasty]} />
      ) : (
        <ShieldGlyph />
      )}
    </span>
  );
}

function ActiveClaimBeat({
  beat,
  dynasty,
  onCollect,
}: {
  beat: ClaimBeat;
  dynasty: RunImpactEnvelope['dynasty'];
  onCollect: () => void;
}) {
  return (
    <article
      className={`relative overflow-hidden rounded-arcade border p-4 sm:p-6 ${beat.tone} animate-pop-in motion-reduce:animate-none`}
      data-testid={`impact-beat-${beat.id}`}
      data-state="ready"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_5%,rgba(255,255,255,0.12),transparent_31%),linear-gradient(115deg,transparent_35%,rgba(255,255,255,0.055)_50%,transparent_65%)]" />
      <div className="relative grid items-center gap-5 text-center sm:grid-cols-[8rem_1fr] sm:text-left">
        <div className="relative mx-auto flex h-28 w-28 items-center justify-center" data-testid={`impact-rune-${beat.id}`}>
          <span className={`absolute inset-1 rotate-45 rounded-[1.4rem] border ${beat.orb}`} />
          <span className="absolute inset-4 -rotate-6 rounded-full border border-current/45 bg-void-deep/85" />
          <span className="relative drop-shadow-[0_0_10px_currentColor]">
            <BeatRune kind={beat.id} dynasty={dynasty} />
          </span>
        </div>
        <div className="min-w-0">
          <p className="label-arcade text-current/85">{beat.eyebrow}</p>
          <h3 className="mt-1 font-display text-2xl text-bone-white sm:text-3xl">{beat.headline}</h3>
          <p className="mt-2 font-body text-sm leading-relaxed text-beige/75">{beat.detail}</p>
          {beat.impacts.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {beat.impacts.map((impact) => (
                <li key={impact.key}>
                  {impact.headline !== beat.headline ? (
                    <p className="font-body text-sm font-bold text-bone-white">{impact.headline}</p>
                  ) : null}
                  {impact.detail && impact.detail !== beat.detail ? (
                    <p className="font-body text-xs text-beige/70">{impact.detail}</p>
                  ) : null}
                  <ImpactProgress impact={impact} collected={false} />
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={onCollect}
            className={`mt-5 inline-flex min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-arcade border px-6 py-3 font-display text-sm uppercase tracking-wide transition-[transform,filter] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bone-white motion-reduce:transform-none sm:w-auto ${beat.action}`}
            data-testid={`impact-collect-${beat.id}`}
          >
            <IconGift size={19} /> {beat.collectLabel}
          </button>
        </div>
      </div>
    </article>
  );
}

function CollectedClaimBeat({ beat, dynasty }: {
  beat: ClaimBeat;
  dynasty: RunImpactEnvelope['dynasty'];
}) {
  return (
    <article
      className={`rounded-arcade border p-3 ${beat.tone}`}
      data-testid={`impact-beat-${beat.id}`}
      data-state="collected"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-arcade border border-current/40 bg-void-deep/65 p-2">
          <BeatRune kind={beat.id} dynasty={dynasty} compact />
        </span>
        <div className="min-w-0 flex-1">
          <p className="label-arcade text-current/80">Collected</p>
          <p className="font-display text-base text-bone-white">{beat.headline}</p>
          {beat.impacts.map((impact) => (
            <ImpactProgress key={impact.key} impact={impact} collected />
          ))}
        </div>
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rarity-uncommon/60 bg-rarity-uncommon/15 text-rarity-uncommon">
          <IconCheck size={17} />
        </span>
      </div>
    </article>
  );
}

function destinationSurface(impact: RunImpact): Omit<ResultDestinationHighlight, 'headline' | 'count'> | null {
  switch (impact.destination) {
    case 'chronicle':
    case 'mastery':
    case 'records':
      return {
        id: 'you',
        label: 'You',
        Icon: IconUser,
        tone: 'border-venom-orange/55 text-venom-orange shadow-[0_0_22px_rgba(250,204,21,0.18)]',
      };
    case 'lineage':
    case 'codex':
    case 'lab':
      return {
        id: 'lab',
        label: 'Lab',
        Icon: IconFlask,
        tone: 'border-cosmic/55 text-cosmic-glow shadow-[0_0_22px_rgba(168,85,247,0.2)]',
      };
    case 'clan':
      return {
        id: 'compete',
        label: 'Compete',
        Icon: IconShield,
        tone: 'border-cyber/55 text-cyber shadow-[0_0_22px_rgba(34,211,238,0.2)]',
      };
    default:
      return null;
  }
}

function destinationHighlights(envelope: RunImpactEnvelope): ResultDestinationHighlight[] {
  const items = new Map<ResultDestinationHighlight['id'], ResultDestinationHighlight>();
  const durable = envelope.impacts
    .filter(
      (impact) =>
        SIGNIFICANCE_RANK[impact.significance] >= SIGNIFICANCE_RANK.milestone &&
        typeof impact.artifactRef === 'string' &&
        impact.artifactRef.length > 0
    )
    .sort(
      (a, b) => SIGNIFICANCE_RANK[b.significance] - SIGNIFICANCE_RANK[a.significance]
    );
  for (const impact of durable) {
    const surface = destinationSurface(impact);
    if (!surface) continue;
    const current = items.get(surface.id);
    if (current) {
      current.count += 1;
    } else {
      items.set(surface.id, { ...surface, headline: impact.headline, count: 1 });
    }
  }
  return Array.from(items.values());
}

function DestinationHighlights({ items }: { items: readonly ResultDestinationHighlight[] }) {
  if (items.length === 0) return null;
  return (
    <section
      className="animate-pop-in space-y-3 rounded-arcade border border-scale-blue-light/30 bg-void-deep/60 p-4 text-left motion-reduce:animate-none"
      aria-label="Unseen progress destinations"
      data-testid="results-destination-attention"
    >
      <div>
        <p className="label-arcade text-rarity-legendary">Your world changed</p>
        <p className="mt-1 font-body text-xs leading-relaxed text-beige/65">
          These lights stay on until the exact progress is visible in its home.
        </p>
      </div>
      <div className={`grid gap-2 ${items.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'}`}>
        {items.map((item) => {
          const Icon = item.Icon;
          return (
            <div
              key={item.id}
              className={`relative rounded-arcade border bg-black/20 p-3 ${item.tone}`}
              data-testid={`results-attention-${item.id}`}
            >
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-current shadow-[0_0_12px_currentColor]" aria-label="Unseen change" />
              <div className="flex items-center gap-2">
                <Icon size={18} />
                <span className="whitespace-nowrap font-display text-sm uppercase text-bone-white">{item.label}</span>
              </div>
              <p className="mt-2 font-body text-xs text-beige/70">
                {item.headline}{item.count > 1 ? ` · +${item.count - 1} more` : ''}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The run has already settled; these taps are ceremony, never authority.
 * Closing Results cannot revoke value, and replay never waits for collection.
 */
function ImpactVictoryLap({ envelope }: { envelope: RunImpactEnvelope }) {
  const beats = useMemo(() => buildClaimBeats(envelope), [envelope]);
  const attention = useMemo(() => destinationHighlights(envelope), [envelope]);
  const routine = useMemo(
    () => envelope.impacts.filter((impact) => impact.significance === 'routine'),
    [envelope]
  );
  const routineSummary = useMemo(() => {
    const headlines = Array.from(new Set(routine.map((impact) => impact.headline)));
    if (headlines.length === 0) return null;
    if (headlines.length === 1) return headlines[0];
    return `${headlines[0]} · ${headlines.length - 1} other progress ${
      headlines.length === 2 ? 'update' : 'updates'
    } secured`;
  }, [routine]);
  const [collectedCount, setCollectedCount] = useState(0);
  const [lastPayoff, setLastPayoff] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const finished = collectedCount >= beats.length;
  const current = finished ? null : beats[collectedCount];

  if (beats.length === 0) {
    return (
      <div className="space-y-2" data-testid="impact-routine-list">
        <p className="label-arcade text-cosmic">Run progress secured</p>
        <ul className="space-y-2">
        {envelope.impacts.map((impact) => (
          <li key={impact.key} className="font-body text-sm text-beige">
            {impact.headline}
            {impact.detail ? <span className="text-beige/65"> — {impact.detail}</span> : null}
          </li>
        ))}
        </ul>
      </div>
    );
  }

  const collect = () => {
    if (!current) return;
    const nextCount = Math.min(collectedCount + 1, beats.length);
    setLastPayoff(current.payoff);
    setCollectedCount(nextCount);
    trackEvent(AnalyticsEvents.RUN_IMPACT_REVIEW_ADVANCED, {
      session_id: envelope.sessionId,
      beat_id: current.id,
      beat_index: collectedCount,
      beat_count: beats.length,
      interaction: 'collect',
      automatic: false,
      category: 'engagement',
    });
    if (nextCount === beats.length) {
      trackEvent(AnalyticsEvents.RUN_IMPACT_REVIEW_COMPLETED, {
        session_id: envelope.sessionId,
        beat_count: beats.length,
        automatic: false,
        category: 'engagement',
      });
    }
  };

  const collectRemaining = () => {
    if (finished) return;
    const remaining = beats.length - collectedCount;
    setLastPayoff(
      remaining === 1
        ? beats[collectedCount].payoff
        : `${remaining} secured prizes collected`
    );
    setCollectedCount(beats.length);
    trackEvent(AnalyticsEvents.RUN_IMPACT_REVIEW_SKIPPED, {
      session_id: envelope.sessionId,
      beat_index: collectedCount,
      beat_count: beats.length,
      remaining_count: remaining,
      interaction: 'collect_remaining',
      automatic: false,
      category: 'engagement',
    });
    trackEvent(AnalyticsEvents.RUN_IMPACT_REVIEW_COMPLETED, {
      session_id: envelope.sessionId,
      beat_count: beats.length,
      automatic: false,
      category: 'engagement',
    });
  };

  return (
    <div className="space-y-3" data-testid="impact-victory-lap" aria-label="Run rewards and progress collection">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-arcade text-rarity-uncommon">Victory lap</p>
          <p className="mt-1 flex items-start gap-1.5 font-body text-xs leading-relaxed text-beige/70">
            <IconLock size={14} className="mt-0.5 shrink-0 text-rarity-uncommon" />
            <span>Everything is already yours. Each tap reveals and celebrates it.</span>
          </p>
        </div>
        <p className={`shrink-0 whitespace-nowrap font-mono text-[11px] uppercase ${reducedMotion ? 'text-rarity-uncommon' : 'text-beige/60'}`} aria-live="polite">
          {reducedMotion || finished ? 'Lap complete' : `${collectedCount + 1} of ${beats.length}`}
        </p>
      </div>
      <div className="flex gap-1" aria-hidden="true">
        {beats.map((beat, index) => (
          <span
            key={beat.id}
            className={`h-1.5 flex-1 rounded-full transition-colors motion-reduce:transition-none ${reducedMotion || index < collectedCount ? 'bg-rarity-uncommon' : index === collectedCount ? 'bg-cosmic shadow-[0_0_8px_#a855f7]' : 'bg-scale-blue-light/25'}`}
          />
        ))}
      </div>

      {routineSummary ? (
        <div
          className="rounded-arcade border border-scale-blue-light/25 bg-void-deep/45 px-3 py-2 text-left"
          data-testid="impact-routine-summary"
        >
          <p className="label-arcade text-beige/55">Also secured automatically</p>
          <p className="mt-1 font-body text-xs text-beige/70">
            {routineSummary}
          </p>
        </div>
      ) : null}

      {!reducedMotion ? <div>
      {lastPayoff ? (
        <div
          key={lastPayoff}
          className="flex items-center gap-2 rounded-arcade border border-rarity-uncommon/45 bg-rarity-uncommon/10 px-3 py-2 text-rarity-uncommon animate-pop-in motion-reduce:animate-none"
          role="status"
          aria-live="polite"
          data-testid="impact-collection-payoff"
        >
          <IconCheck size={18} className="shrink-0" />
          <span className="font-body text-xs font-bold">{lastPayoff}</span>
        </div>
      ) : null}

      {current ? (
        <div aria-live="polite">
          <ActiveClaimBeat beat={current} dynasty={envelope.dynasty} onCollect={collect} />
        </div>
      ) : (
        <div className="space-y-3" role="status" data-testid="impact-victory-complete">
          <div className="rounded-arcade border border-rarity-uncommon/45 bg-rarity-uncommon/10 p-4 text-center">
            <IconTrophy size={34} className="mx-auto text-rarity-legendary drop-shadow-[0_0_12px_currentColor]" />
            <p className="mt-2 heading-display text-xl text-bone-white">Victory lap complete</p>
            <p className="mt-1 font-body text-xs text-beige/65">Your prizes are collected. Their story continues in your world.</p>
          </div>
          <DestinationHighlights items={attention} />
        </div>
      )}

      {collectedCount > 0 ? (
        <div className="space-y-2" aria-label="Collected prizes">
          {beats.slice(0, collectedCount).map((beat) => (
            <CollectedClaimBeat key={beat.id} beat={beat} dynasty={envelope.dynasty} />
          ))}
        </div>
      ) : null}
      {!finished && beats.length - collectedCount > 1 ? (
        <button
          type="button"
          onClick={collectRemaining}
          className="min-h-[44px] w-full rounded-full px-4 font-body text-xs font-bold text-beige/65 transition-colors hover:bg-scale-blue/25 hover:text-bone-white sm:w-auto"
          data-testid="impact-collect-remaining"
        >
          Collect all remaining prizes
        </button>
      ) : null}
      </div> : null}

      {reducedMotion ? <div className="space-y-2" data-testid="impact-reduced-summary">
        {beats.map((beat) => (
          <CollectedClaimBeat key={beat.id} beat={beat} dynasty={envelope.dynasty} />
        ))}
        <DestinationHighlights items={attention} />
      </div> : null}
    </div>
  );
}

function serverNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function CrashConsequences({
  credited,
  clanBattle,
}: {
  credited: number | null;
  clanBattle: RunResultsClanBattle | null;
}) {
  const salvage = serverNumber(credited);
  // This reason is returned only after the contribution recorder found an
  // attached clan battle but rejected the completed run. It proves that no
  // clan contribution was banked; it does not prove a hypothetical score.
  const noClanContribution =
    clanBattle?.eligible === false && clanBattle.reason === 'validation_or_timing';
  const threshold =
    serverNumber(clanBattle?.thresholdBefore) ?? serverNumber(clanBattle?.fifthBest);

  if (salvage === null && !noClanContribution && threshold === null) return null;

  return (
    <section
      className="mx-auto grid max-w-lg gap-2 rounded-arcade border border-scale-blue-light/35 bg-scale-blue/10 p-3 text-left sm:grid-cols-2"
      aria-label="Exact crash consequences"
      data-testid="results-crash-consequences"
    >
      {salvage !== null ? (
        <div>
          <p className="label-arcade text-venom-orange">Personal</p>
          <p className="mt-1 font-display text-sm text-bone-white">
            {salvage.toLocaleString()} DNA salvaged
          </p>
        </div>
      ) : null}
      {noClanContribution ? (
        <div className="border-t border-scale-blue-light/20 pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
          <p className="label-arcade text-cyber">Clan</p>
          <p className="mt-1 font-display text-sm text-bone-white">
            No clan contribution banked
          </p>
        </div>
      ) : null}
      {threshold !== null && threshold > 0 ? (
        <div className="border-t border-scale-blue-light/20 pt-2 sm:col-span-2">
          <p className="label-arcade text-cosmic-glow">Your fifth-best threshold</p>
          <p className="mt-1 font-display text-sm text-bone-white">
            {threshold.toLocaleString()} Clan Depth
          </p>
        </div>
      ) : null}
    </section>
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
  settlementPending,
  nextAction,
  onNextAction,
  onReplay,
  onSetup,
  replayPending,
  replayDisabled,
  replayEnergy,
  shareArtifact,
}: RunResultsProps) {
  const head = headline(outcome, practice);
  const receipt = impact?.receipt;
  const settledScore = receipt?.score ?? score;
  const settledYield = receipt?.yieldDna ?? yieldDna ?? dnaCredited ?? 0;
  const credited = receipt?.dnaCredited ?? dnaCredited;
  const committed = receipt?.energyCommitted ?? energyCommitted;
  const multiplier = receipt?.commitmentMultiplierBps ?? commitmentMultiplierBps;
  const personalBest = receipt?.personalBest.improved === true;
  const clanThresholdBefore = serverNumber(clanBattle?.thresholdBefore);
  const clanFifthBest = serverNumber(clanBattle?.fifthBest);
  const clanDelta = serverNumber(clanBattle?.scoreDelta);
  const scoreNeeded = clanThresholdBefore !== null && clanThresholdBefore > 0
    ? clanThresholdBefore + 1
    : null;
  const shortBy =
    scoreNeeded !== null && !clanBattle?.enteredTopFive
      ? Math.max(0, scoreNeeded - settledYield)
      : null;

  useEffect(() => {
    if (!CAREER_SPINE_V1_ENABLED || !impact) return;
    trackEvent(AnalyticsEvents.RUN_IMPACT_REVIEW_OPENED, {
      session_id: impact.sessionId,
      impact_count: impact.impacts.length,
      featured_count: impact.featuredImpactKeys.length,
      automatic: false,
      category: 'engagement',
    });
  }, [impact]);

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

        {settlementPending && !practice ? (
          <div
            className="panel-glow [--glow:#22d3ee] mx-auto max-w-lg px-5 py-4 text-left"
            data-testid="results-settlement-pending"
            role="status"
          >
            <p className="label-arcade text-[#7df9ff]">Run secured</p>
            <p className="mt-1 font-body text-sm text-beige/85">
              Finalizing DNA, records, and Career progress on the server. You can safely leave this screen.
            </p>
          </div>
        ) : null}

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
          <span className="font-bold text-venom-orange text-glow-orange">
            {settlementPending ? 'Finalizing…' : settledYield.toLocaleString()}
          </span>
        </p>

        {!practice && settlementPending ? (
          <p className="text-sm text-beige/70" data-testid="results-energy">
            {committed > 0 ? `${committed} Energy committed` : 'Lean run'} · reward secured
          </p>
        ) : !practice && credited !== null ? (
          <p className="text-sm text-beige/70" data-testid="results-energy">
            {committed > 0 ? `${committed} Energy committed` : multiplier < 10_000 ? 'Lean run' : 'Energy-exempt run'} · {credited.toLocaleString()} DNA credited
          </p>
        ) : null}
        {practice && <p className="text-sm text-beige/70" data-testid="gameover-hypothetical">Practice pays nothing — this is what the run was worth.</p>}

        {!settlementPending && (yieldBreakdown || (!practice && credited !== null)) && (
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

        {!settlementPending && clanBattle?.eligible && (
          <div className="panel-glow [--glow:#7df9ff] mx-auto max-w-lg space-y-2 px-4 py-3 text-left" data-testid="results-clan-battle">
            <p className="label-arcade text-[#7df9ff]">Clan Energy Battle</p>
            <p className="font-body text-sm text-bone-white">
              {clanBattle.enteredTopFive
                ? `Entered your five${clanDelta !== null && clanDelta > 0 ? ` · +${clanDelta.toLocaleString()} Clan Depth` : ''}.`
                : 'Valid battle result · outside your five.'}
            </p>
            {clanBattle.replacedSessionId ? <p className="font-body text-xs text-beige/65">Replaced a weaker result.</p> : null}
            {clanBattle.enteredTopFive && clanFifthBest !== null && clanFifthBest > 0 ? (
              <p className="font-body text-xs text-beige/65">
                Your fifth-best now stands at {clanFifthBest.toLocaleString()} Clan Depth.
              </p>
            ) : null}
            {!clanBattle.enteredTopFive && scoreNeeded !== null ? (
              <p className="font-body text-xs text-beige/65" data-testid="results-clan-gap">
                Needed {scoreNeeded.toLocaleString()} · this run delivered {settledYield.toLocaleString()}
                {shortBy !== null && shortBy > 0 ? ` · ${shortBy.toLocaleString()} short` : ''}.
              </p>
            ) : null}
          </div>
        )}
        {!settlementPending && outcome === 'crashed' && !practice ? (
          <CrashConsequences credited={credited} clanBattle={clanBattle} />
        ) : null}
      </section>

      <section data-testid="results-layer-3" aria-label="Progression" className="space-y-4">
        <div
          className="panel-glow [--glow:#22d3ee] mx-auto max-w-lg p-4 text-left"
          data-testid="results-digest"
        >
          <div className="space-y-3">
            <p className="font-body text-sm text-beige/80" data-testid="impact-summary">
              {CAREER_SPINE_V1_ENABLED
                ? settlementPending
                  ? 'Run secured — Career impact is finalizing.'
                  : impact
                  ? impactSummary(impact)
                  : practice
                    ? 'Practice advances no persistent progress.'
                    : 'Run impact is pending server recovery.'
                : practice
                  ? 'Practice advances no persistent progress.'
                  : 'Persistent progress was secured by the server.'}
            </p>
            {CAREER_SPINE_V1_ENABLED && impact ? (
              <ImpactVictoryLap key={impact.sessionId} envelope={impact} />
            ) : null}
            {CAREER_SPINE_V1_ENABLED && !impact ? (
              <p className="font-body text-xs text-beige/60">
                {settlementPending
                  ? 'The server accepted and froze this result. Settlement will complete exactly once even if you close the game.'
                  : practice
                  ? 'Only the live practice session existed; closing it leaves no earned state behind.'
                  : 'Keep this tab online while settlement retries. The run becomes earned progress when the server accepts and validates its result; this device never stores a progress copy.'}
              </p>
            ) : null}
          </div>
        </div>

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

      <p className="mx-auto max-w-lg text-center font-body text-xs leading-relaxed text-beige/55">
        {practice
          ? 'Replay or return to Setup at any time. Practice creates no persistent reward.'
          : impact || settlementPending
            ? 'Replay or return to Setup at any time. Leaving never forfeits a secured prize.'
            : 'Settlement recovery is still in progress; this screen never invents an unverified prize.'}
      </p>
      <div className="sticky bottom-0 z-20 -mx-2 grid grid-cols-2 gap-2 border-t border-scale-blue-light/25 bg-void-deep/90 px-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-2 backdrop-blur-md sm:mx-0 sm:flex sm:items-center sm:justify-center sm:rounded-full sm:border sm:px-3 sm:pb-3 sm:pt-3" data-testid="results-action-dock">
        <button type="button" onClick={onReplay} disabled={replayDisabled} data-testid="results-replay" className={`btn-go inline-flex min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap px-8 py-4 text-xl sm:w-auto ${replayDisabled ? 'cursor-wait' : 'animate-glow-pulse shadow-venom-orange/50'}`}>
          <IconPlay size={20} /> {replayPending ? 'Starting…' : replayEnergy > 0 ? `Replay · ${replayEnergy} Energy` : 'Replay · Lean'}
        </button>
        <button type="button" onClick={onSetup} data-testid="results-setup" className="btn-neutral inline-flex min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap px-6 py-3 sm:w-auto">
          <IconReset size={18} /> Setup
        </button>
      </div>
    </div>
  );
}

export default RunResults;

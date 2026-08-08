'use client';

/**
 * RESULTS — restructured (owner ruling 2026-08-05, reconfirmed 2026-08-07).
 *
 * THE ORDER IS RULED: Score → Victory Lap → payout facts → actions. What the
 * player did, then the applause, then the arithmetic, then the way out.
 *
 * WHAT WAS CUT, and it was cut for the same reason Setup was cut to three
 * elements: the Daily Take collect tray (a daily that has nothing to do with
 * this run — it moves to a floating Home element, ruling D2), the Legacy Gen-N
 * tray with its next-generation projections (a forecast about generations the
 * player is not in, on the screen that reports the run they just finished),
 * and the "Share / Download Genome Card" button with the duplicate receipt
 * attached to it. The genome barcode stays.
 *
 * THE NUMBERS RECONCILE, which is the part that had actually broken. Results
 * used to state a big "Payout" of `yieldDna` — the run's full-strength worth —
 * and then, elsewhere and smaller, a Victory Lap beat reading "+N DNA" of
 * `dnaCredited`, which is `yieldDna × the harvest factor`. On a lean run that
 * factor is 0.25, so the two headline numbers on one screen differed by 4×
 * with nothing on screen connecting them. Both were correct and the screen was
 * still lying, because a player reading for three seconds takes the biggest
 * number as what they got.
 *
 * So there is now ONE money field. It shows what was banked. It shows the
 * multiplication ONLY when the multiplication did something — at ×1.0 the
 * worth and the banked amount are the same number and stating it twice is the
 * noise this restructure exists to remove. The Victory Lap's DNA beat reads
 * `dnaCredited`, and so does this field, so the two now agree by construction.
 *
 * Score is not in that field and never derives from it (Rule 2): it is the
 * skill number, it sits alone with the outcome, and no arithmetic on this
 * screen connects it to money.
 *
 * ONE TRAY, ONE OUTLINE. The overlay wrapper in `app/game/page.tsx` is the
 * tray. Nothing in this file draws a frame, a second radius or a glow; regions
 * separate by fill step and by GAP.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  IconArrowRight,
  IconCheck,
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
import type { ResultsNextAction } from '@/lib/game/resultsNextAction';
import {
  impactSummary,
  type RunImpact,
  type RunImpactEnvelope,
} from '@/lib/game/runImpactClient';
import { CAREER_SPINE_V1_ENABLED } from '@/lib/features/careerSpine';
import { formatAmount } from '@/shared/format/amount';
import {
  GenomeYieldRecap,
  type GenomeYieldRecapModel,
} from '@/components/game/genome/GenomeYieldRecap';

export type RunResultsOutcome = 'extracted' | 'crashed';

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
  energyCommitted: number;
  commitmentMultiplierBps: number;
  clanBattle: RunResultsClanBattle | null;
  impact: RunImpactEnvelope | null;
  settlementPending: boolean;
  nextAction: ResultsNextAction;
  onNextAction: () => void;
  /**
   * **Not now** for an invitation that carries an attention id (WP-D). The
   * transition is made server-side by the handler; this component never
   * records a dismissal of its own.
   */
  onDeclineNextAction?: () => void;
  onReplay: () => void;
  onSetup: () => void;
  replayPending: boolean;
  replayDisabled: boolean;
  replayEnergy: number;
  /** The genome barcode. The card's download left with ruling D3's batch. */
  shareArtifact?: ReactNode;
  /** Exact v2 settlement projection; omitted for legacy/unavailable receipts. */
  genomeRecap?: GenomeYieldRecapModel | null;
  /** Opaque, authenticated handoff to the settled run's Research reading. */
  studyGenomeHref?: string | null;
  /** Exact local collision fact; display/debug only, never settlement input. */
  collisionDetail?: string | null;
}

function headline(outcome: RunResultsOutcome, practice: boolean) {
  if (practice) {
    return {
      testId: 'gameover-practice',
      title: 'Practice Run',
      tone: 'text-beige',
      detail: outcome === 'extracted' ? 'Extracted — no rewards' : 'Crashed — no rewards',
    };
  }
  if (outcome === 'extracted') {
    return {
      testId: 'gameover-extracted',
      title: 'Extracted',
      tone: 'text-venom-orange',
      detail: 'Banked at the portal',
    };
  }
  return {
    testId: 'gameover-crashed',
    title: 'Game Over',
    tone: 'text-strike-red',
    detail: "Crashed — this is what's left",
  };
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

/**
 * A progress bar is a claim about a distance. It is drawn ONLY when the server
 * supplied the distance.
 *
 * It used to fall back to `max(after, before, 1)`, which makes the bar's
 * maximum equal to its own value — so every uncapped impact rendered a bar
 * that was exactly 100% full the moment it was collected, whatever had
 * actually happened. That is a graphic that always says "complete", which is
 * the same defect as a number that does not add up, drawn instead of written.
 */
function ImpactProgress({ impact, collected }: {
  impact: RunImpact;
  collected: boolean;
}) {
  const metadataTarget = impact.metadata?.target;
  const target =
    typeof metadataTarget === 'number' && Number.isFinite(metadataTarget) && metadataTarget > 0
      ? metadataTarget
      : null;
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
    if (motionIsReduced()) {
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

  const movement = collected
    ? `${formatAmount(before)} → ${formatAmount(after)}`
    : `${formatAmount(before)} · ready to advance`;

  if (target === null) {
    // No distance, no bar — the movement is still stated exactly.
    return (
      <p className="mt-1.5 font-mono text-[11px] text-beige/60" data-testid="impact-movement">
        {movement}
      </p>
    );
  }

  const max = Math.max(target, after, 1);
  const width = Math.max(0, Math.min(100, (displayedValue / max) * 100));
  return (
    <div className="mt-2 space-y-1">
      <div
        role="progressbar"
        aria-label={`${impact.headline} progress`}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={displayedValue}
        className="h-2 overflow-hidden rounded-[var(--radius-chip)] border-[length:var(--ink-w-1)] border-ink bg-[color:var(--fill-deck-0)]"
      >
        <div
          className="h-full bg-venom-orange transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="font-mono text-[11px] text-beige/60" data-testid="impact-movement">
        {movement} · of {formatAmount(max)}
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
  /** The beat's authored FILL. Accent is never spent as a keyline. */
  fill: string;
  action: string;
}

interface ResultDestinationHighlight {
  id: 'you' | 'lab' | 'compete';
  label: string;
  headline: string;
  count: number;
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
    beats.push({
      id: 'dna',
      eyebrow: envelope.outcome === 'crashed' ? "What's left" : 'Banked',
      // The SAME number the payout field states. These two used to be
      // `dnaCredited` and `yieldDna` respectively and could differ by 4×.
      headline: `+${formatAmount(credited)} DNA`,
      detail: 'Already secured in your balance.',
      collectLabel: envelope.outcome === 'crashed' ? 'Take what is left' : 'Take the DNA',
      payoff: `${formatAmount(credited)} DNA secured in your vault`,
      impacts: [],
      fill: 'var(--venom-orange)',
      action: 'btn-neutral',
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
          ? 'Power discovery'
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
      fill: '#4b2f80',
      action: 'btn-neutral',
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
      fill: '#0f5f74',
      action: 'btn-neutral',
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
    <span className={`block ${compact ? 'h-5 w-5' : 'h-10 w-10'}`} aria-hidden="true">
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

/**
 * The beat is a drawn card: one authored fill, an ink contour on its own
 * silhouette, one hard displaced block. The rune sits on a paper chip so the
 * glyph reads as ink rather than as a lit object — the retired treatment was a
 * rotated ring inside a ring inside a 40px coloured blur.
 */
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
      className="rounded-[var(--radius-card)] border-[length:var(--ink-w-2)] border-ink p-3 text-left shadow-[var(--ink-drop-void-2)] animate-pop-in motion-reduce:animate-none sm:p-4"
      style={{ backgroundColor: beat.fill }}
      data-testid={`impact-beat-${beat.id}`}
      data-state="ready"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-card)] border-[length:var(--ink-w-2)] border-ink bg-[#fffdf8] p-2 text-ink"
          data-testid={`impact-rune-${beat.id}`}
        >
          <BeatRune kind={beat.id} dynasty={dynasty} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="label-arcade text-[10px] text-bone-white/75">{beat.eyebrow}</p>
          <h3 className="heading-display mt-0.5 text-xl text-bone-white sm:text-2xl">
            {beat.headline}
          </h3>
          <p className="mt-1 font-body text-xs leading-snug text-bone-white/80">
            {beat.detail}
          </p>
          {beat.impacts.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {beat.impacts.map((impact) => (
                <li key={impact.key}>
                  {impact.headline !== beat.headline ? (
                    <p className="font-body text-sm font-bold text-bone-white">{impact.headline}</p>
                  ) : null}
                  {impact.detail && impact.detail !== beat.detail ? (
                    <p className="font-body text-xs text-bone-white/70">{impact.detail}</p>
                  ) : null}
                  <ImpactProgress impact={impact} collected={false} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onCollect}
        className={`${beat.action} mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap px-6 py-3 text-sm`}
        data-testid={`impact-collect-${beat.id}`}
      >
        <IconGift size={18} /> {beat.collectLabel}
      </button>
    </article>
  );
}

function CollectedClaimBeat({ beat, dynasty }: {
  beat: ClaimBeat;
  dynasty: RunImpactEnvelope['dynasty'];
}) {
  return (
    <article
      className="flex items-center gap-2.5 rounded-[var(--radius-card)] border-[length:var(--ink-w-2)] border-ink px-2.5 py-2 text-left shadow-[var(--ink-drop-void-1)]"
      style={{ backgroundColor: beat.fill }}
      data-testid={`impact-beat-${beat.id}`}
      data-state="collected"
    >
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-chip)] border-[length:var(--ink-w-1)] border-ink bg-[#fffdf8] p-1.5 text-ink">
        <BeatRune kind={beat.id} dynasty={dynasty} compact />
      </span>
      <div className="min-w-0 flex-1">
        <p className="heading-display truncate text-sm text-bone-white">{beat.headline}</p>
        {beat.impacts.map((impact) => (
          <ImpactProgress key={impact.key} impact={impact} collected />
        ))}
      </div>
      <span className="shrink-0 text-rarity-uncommon">
        <IconCheck size={17} />
      </span>
    </article>
  );
}

function destinationSurface(impact: RunImpact): Omit<ResultDestinationHighlight, 'headline' | 'count'> | null {
  switch (impact.destination) {
    case 'chronicle':
    case 'mastery':
    case 'records':
      return { id: 'you', label: 'You', Icon: IconUser };
    case 'lineage':
    case 'codex':
    case 'lab':
      return { id: 'lab', label: 'Lab', Icon: IconFlask };
    case 'clan':
      return { id: 'compete', label: 'Compete', Icon: IconShield };
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
      className="animate-pop-in text-left motion-reduce:animate-none"
      aria-label="Unseen progress destinations"
      data-testid="results-destination-attention"
    >
      <p className="label-arcade text-[10px] text-beige/55">Your world changed</p>
      <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        {items.map((item) => {
          const Icon = item.Icon;
          return (
            <div
              key={item.id}
              className="rounded-[var(--radius-chip)] bg-[color:var(--fill-deck-2)] px-2.5 py-2"
              data-testid={`results-attention-${item.id}`}
            >
              <div className="flex items-center gap-1.5 text-venom-orange">
                <Icon size={15} />
                <span className="heading-display whitespace-nowrap text-xs text-bone-white">
                  {item.label}
                </span>
              </div>
              <p className="mt-1 font-body text-[11px] leading-snug text-beige/70">
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
  // A crashed run still earns things, and a crashed run can still set a
  // personal best — `personal_best` is the LOWEST claimable tier, so it fires
  // often. Calling that a victory lap is the sequence promising something the
  // run did not deliver. The beats are identical; only the framing changes.
  const crashed = envelope.outcome === 'crashed';
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
      <div data-testid="impact-routine-list">
        <p className="label-arcade text-[10px] text-beige/55">Run progress secured</p>
        <ul className="mt-1 space-y-1">
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
    <div className="flex flex-col gap-2.5 text-left" data-testid="impact-victory-lap" aria-label="Run rewards and progress collection">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-arcade text-[10px] text-venom-orange">
            {crashed ? 'What you kept' : 'Victory lap'}
          </p>
          <p className="mt-0.5 flex items-start gap-1.5 font-body text-[11px] leading-snug text-beige/70">
            <IconLock size={13} className="mt-0.5 shrink-0 text-venom-orange" />
            <span>Already yours. Each tap reveals it.</span>
          </p>
        </div>
        <p className="shrink-0 whitespace-nowrap font-mono text-[11px] uppercase text-beige/60" aria-live="polite">
          {reducedMotion || finished ? (crashed ? 'All collected' : 'Lap complete') : `${collectedCount + 1} of ${beats.length}`}
        </p>
      </div>

      <div className="flex gap-1" aria-hidden="true">
        {beats.map((beat, index) => (
          <span
            key={beat.id}
            className={`h-2 flex-1 rounded-[var(--radius-chip)] border-[length:var(--ink-w-1)] border-ink transition-colors motion-reduce:transition-none ${
              reducedMotion || index < collectedCount
                ? 'bg-venom-orange'
                : 'bg-[color:var(--fill-deck-0)]'
            }`}
          />
        ))}
      </div>

      {routineSummary ? (
        <div
          className="rounded-[var(--radius-chip)] bg-[color:var(--fill-deck-0)] px-2.5 py-2"
          data-testid="impact-routine-summary"
        >
          <p className="label-arcade text-[10px] text-beige/50">Also secured</p>
          <p className="mt-0.5 font-body text-[11px] leading-snug text-beige/70">
            {routineSummary}
          </p>
        </div>
      ) : null}

      {!reducedMotion ? (
        <div className="flex flex-col gap-2.5">
          {lastPayoff ? (
            <div
              key={lastPayoff}
              className="flex items-center gap-2 rounded-[var(--radius-chip)] bg-[color:var(--fill-deck-2)] px-2.5 py-2 text-rarity-uncommon animate-pop-in motion-reduce:animate-none"
              role="status"
              aria-live="polite"
              data-testid="impact-collection-payoff"
            >
              <IconCheck size={16} className="shrink-0" />
              <span className="font-body text-[11px] font-bold">{lastPayoff}</span>
            </div>
          ) : null}

          {current ? (
            <div aria-live="polite">
              <ActiveClaimBeat beat={current} dynasty={envelope.dynasty} onCollect={collect} />
            </div>
          ) : (
            <div className="flex flex-col gap-2.5" role="status" data-testid="impact-victory-complete">
              <div className="rounded-[var(--radius-card)] border-[length:var(--ink-w-2)] border-ink bg-[color:var(--fill-deck-2)] p-3 text-center shadow-[var(--ink-drop-void-2)]">
                <IconTrophy size={30} className="mx-auto text-venom-orange" />
                <p className="heading-display mt-1 text-lg text-bone-white">
                  {crashed ? 'That is what you kept' : 'Victory lap complete'}
                </p>
                <p className="mt-0.5 font-body text-[11px] text-beige/65">
                  {crashed
                    ? 'The run ended early. What you kept stays yours.'
                    : 'Your prizes are collected.'}
                </p>
              </div>
              <DestinationHighlights items={attention} />
            </div>
          )}

          {collectedCount > 0 ? (
            <div className="flex flex-col gap-1.5" aria-label="Collected prizes">
              {beats.slice(0, collectedCount).map((beat) => (
                <CollectedClaimBeat key={beat.id} beat={beat} dynasty={envelope.dynasty} />
              ))}
            </div>
          ) : null}

          {!finished && beats.length - collectedCount > 1 ? (
            <button
              type="button"
              onClick={collectRemaining}
              className="min-h-[44px] w-full px-4 font-body text-xs font-bold text-beige/65 underline decoration-dotted underline-offset-4 transition-colors hover:text-bone-white sm:w-auto"
              data-testid="impact-collect-remaining"
            >
              Take everything left
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5" data-testid="impact-reduced-summary">
          {beats.map((beat) => (
            <CollectedClaimBeat key={beat.id} beat={beat} dynasty={envelope.dynasty} />
          ))}
          <DestinationHighlights items={attention} />
        </div>
      )}
    </div>
  );
}

function serverNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

/** ≤3 words, everywhere Depth appears (ruling). §6.2: Depth is in segments. */
const DEPTH_GLOSS = 'Segments driven';

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
    <div
      className="grid gap-2 rounded-[var(--radius-chip)] bg-[color:var(--fill-deck-0)] p-2.5 text-left sm:grid-cols-2"
      aria-label="Exact crash consequences"
      data-testid="results-crash-consequences"
    >
      {salvage !== null ? (
        <div>
          <p className="label-arcade text-[10px] text-beige/50">Kept</p>
          <p className="heading-display mt-0.5 text-sm text-bone-white">
            {formatAmount(salvage)} DNA
          </p>
        </div>
      ) : null}
      {noClanContribution ? (
        <div>
          <p className="label-arcade text-[10px] text-beige/50">Clan</p>
          <p className="heading-display mt-0.5 text-sm text-bone-white">
            Nothing banked
          </p>
        </div>
      ) : null}
      {threshold !== null && threshold > 0 ? (
        <div className="sm:col-span-2">
          <p className="label-arcade text-[10px] text-beige/50">
            Your fifth-best · {DEPTH_GLOSS}
          </p>
          <p className="heading-display mt-0.5 text-sm text-bone-white">
            {formatAmount(threshold)} Depth
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * THE ONE MONEY FIELD.
 *
 * `yieldDna` is the run's full-strength worth and `dnaCredited` is what that
 * worth actually paid after the harvest factor (§6.2: "the DNA a run actually
 * pays is Yield × the charge factor"). At ×1.0 they are the same number and
 * only one is shown. When they differ — a lean run pays ×0.25 — the factor is
 * shown BETWEEN them, so the only equation the layout implies is the one that
 * is true.
 */
function PayoutField({
  practice,
  settlementPending,
  worth,
  credited,
  committed,
  multiplierBps,
}: {
  practice: boolean;
  settlementPending: boolean;
  worth: number;
  credited: number | null;
  committed: number;
  multiplierBps: number;
}) {
  if (settlementPending) {
    return (
      <div data-testid="results-yield">
        <p className="label-arcade text-[10px] text-beige/55">DNA banked</p>
        <p className="heading-display text-3xl text-venom-orange">Finalizing…</p>
      </div>
    );
  }

  if (practice) {
    return (
      <div data-testid="results-yield">
        <p className="label-arcade text-[10px] text-beige/55">Practice — nothing banked</p>
        <p className="heading-display text-3xl text-beige/80">
          <span data-testid="results-dna-banked">{formatAmount(worth)}</span>
          <span className="ml-2 font-body text-sm text-beige/60">was the worth</span>
        </p>
      </div>
    );
  }

  const banked = credited ?? worth;
  const factorApplied = credited !== null && multiplierBps !== 10_000 && worth !== banked;

  if (!factorApplied) {
    return (
      <div data-testid="results-yield">
        <p className="label-arcade text-[10px] text-beige/55">DNA banked</p>
        <p className="heading-display text-3xl text-venom-orange">
          +<span data-testid="results-dna-banked">{formatAmount(banked)}</span>
        </p>
      </div>
    );
  }

  const factor = multiplierBps / 10_000;
  return (
    <div data-testid="results-yield">
      <p className="label-arcade text-[10px] text-beige/55">DNA banked</p>
      <p className="heading-display text-3xl text-venom-orange">
        +<span data-testid="results-dna-banked">{formatAmount(banked)}</span>
      </p>
      {/* The equation, stated once and stated true. */}
      <p
        className="mt-0.5 font-mono text-[11px] text-beige/60"
        data-testid="results-payout-chain"
      >
        <span data-testid="results-payout-worth">{formatAmount(worth)}</span> worth ×
        {factor.toFixed(factor < 1 ? 2 : 1)}{' '}
        {committed > 0 ? `${committed} Energy` : 'lean harvest'}
      </p>
    </div>
  );
}

export function RunResults({
  outcome,
  practice,
  score,
  dnaCredited,
  yieldDna,
  energyCommitted,
  commitmentMultiplierBps,
  clanBattle,
  impact,
  settlementPending,
  nextAction,
  onNextAction,
  onDeclineNextAction,
  onReplay,
  onSetup,
  replayPending,
  replayDisabled,
  replayEnergy,
  shareArtifact,
  genomeRecap = null,
  studyGenomeHref = null,
  collisionDetail = null,
}: RunResultsProps) {
  const awaitingCanonicalImpact = !practice && settlementPending && !impact;
  const head = awaitingCanonicalImpact
    ? {
        testId: 'gameover-finalizing',
        title: 'Run Secured',
        tone: 'text-venom-orange-light',
        detail: 'Outcome finalizing on the server',
      }
    : headline(outcome, practice);
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
  const clanTotal = serverNumber(clanBattle?.clanTotal);
  /**
   * ENTERED an empty slot, or REPLACED a weaker result (PEO §6 step 5).
   */
  const clanReplaced = Boolean(clanBattle?.replacedSessionId);
  /**
   * The clan threshold and this run's contribution are BOTH Depth, which §6.2
   * defines as accumulated Yield — the migration fills the contribution column
   * from `game_sessions.yield_dna`. So this comparison is unit-consistent, and
   * it is deliberately compared against the run's WORTH rather than against
   * the DNA it banked: "Depth, Mastery, and every record read the full number".
   */
  const depthNeeded = clanThresholdBefore !== null && clanThresholdBefore > 0
    ? clanThresholdBefore + 1
    : null;
  const shortBy =
    depthNeeded !== null && !clanBattle?.enteredTopFive
      ? Math.max(0, depthNeeded - settledYield)
      : null;

  /**
   * REPLAY ROUTING (ruling D3). With Energy in stock, REPLAY re-enters the run
   * with the same configuration, capped at 1 Energy by §5. With NO Energy, it
   * used to silently downgrade the run to a ×0.25 lean harvest — a stake the
   * player never chose, decided by a button labelled with the word "again".
   *
   * So an empty stock routes to Setup instead, where the Energy Reactor
   * arrives preset to this run's commitment and 0 rods is FREE play stated as
   * itself. The player still reaches a board in two taps from Results (§5's
   * "≤2 taps from Results to the next run"), and the lean run is now a thing
   * they chose rather than a thing that happened to them.
   */
  const replayRoutesToSetup = replayEnergy <= 0;

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

  /*
    THE ORDER, AND THE ONE PLACE IT BENDS.

    Ruled information order: Score → Victory Lap → payout facts. Actions come
    after it on a screen with room for all of it.

    On a phone there is no such room — the Victory Lap alone measures ~640px at
    320×568 — so the actions would sit below two full screens of reading, and
    an earlier ratified round already established that a player must never
    scroll to act. The reconciliation is that ACTIONS ARE NOT INFORMATION: they
    move to second position on mobile and the ruled reading order (Score, then
    the lap, then the facts) is completely intact around them.

    Done with flex `order`, so the DOM order is one order — the mobile one,
    which is also the order a keyboard should meet these controls in, primary
    action early.
  */
  return (
    <div className="flex flex-col gap-5 text-center" data-testid="run-results">
      {/* ---------- 1 · OUTCOME AND SCORE ---------- */}
      <section
        data-testid="results-layer-1"
        aria-label="Outcome"
        className="order-1 flex flex-col gap-3"
      >
        <div>
          <h2 className={`heading-display heading-ink text-4xl ${head.tone}`} data-testid={head.testId}>
            {head.title}
          </h2>
          <p className="font-body text-sm uppercase tracking-wide text-beige/60">
            {head.detail}
          </p>
          {!awaitingCanonicalImpact && outcome === 'crashed' && collisionDetail ? (
            <p
              className="font-mono text-sm text-beige/75"
              data-testid="results-collision-diagnostic"
            >
              {collisionDetail}
            </p>
          ) : null}
        </div>

        {/*
          SCORE STANDS ALONE. It is the skill number and it is build-blind by
          law (Rule 2) — no gene, trait or anomaly reaches it, and nothing on
          this screen multiplies it into money. Putting it in its own field,
          above and apart from the payout, is what stops the eye trying.
        */}
        <div className="mx-auto">
          <p className="label-arcade text-[10px] text-beige/55">Score · how well you flew</p>
          <p className="heading-display text-5xl text-bone-white" data-testid="results-score">
            {awaitingCanonicalImpact ? 'Finalizing…' : formatAmount(settledScore)}
          </p>
        </div>

        {!awaitingCanonicalImpact && personalBest && (
          <p
            className="mx-auto inline-flex items-center justify-center gap-2 rounded-[var(--radius-chip)] border-[length:var(--ink-w-2)] border-ink bg-venom-orange px-3 py-1.5 font-display text-sm uppercase text-ink shadow-[var(--ink-drop-1)]"
            data-testid="results-personal-best"
          >
            <IconMedal size={17} /> Personal best
          </p>
        )}

        {settlementPending && !practice ? (
          <div
            className="mx-auto max-w-lg rounded-[var(--radius-chip)] bg-[color:var(--fill-deck-0)] px-4 py-3 text-left"
            data-testid="results-settlement-pending"
            role="status"
          >
            <p className="label-arcade text-[10px] text-venom-orange">Run secured</p>
            <p className="mt-0.5 font-body text-sm text-beige/85">
              Finalizing DNA, records, and Career progress. You can safely leave this screen.
            </p>
          </div>
        ) : null}
      </section>

      {/* ---------- ACTIONS · second on a phone, last on a desktop ---------- */}
      <div className="order-2 flex flex-col gap-1.5 sm:order-4">
        <div
          className="mx-auto grid w-full max-w-lg grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-center"
          data-testid="results-action-dock"
          data-action-surface="integrated"
        >
          {/* REPLAY IS THE LABEL (ruling D3). The cost is stated once, below. */}
          <button
            type="button"
            onClick={replayRoutesToSetup ? onSetup : onReplay}
            disabled={replayDisabled && !replayRoutesToSetup}
            data-testid="results-replay"
            data-routes-to={replayRoutesToSetup ? 'setup' : 'run'}
            className={`btn-go inline-flex min-h-[52px] w-full items-center justify-center gap-2 whitespace-nowrap px-8 py-3 text-xl sm:w-auto ${
              replayDisabled && !replayRoutesToSetup ? 'cursor-wait' : ''
            }`}
          >
            <IconPlay size={20} /> {replayPending ? 'Starting…' : 'REPLAY'}
          </button>
          <button
            type="button"
            onClick={onSetup}
            data-testid="results-setup"
            className="btn-neutral inline-flex min-h-[52px] w-full items-center justify-center gap-2 whitespace-nowrap px-6 py-3 sm:w-auto"
          >
            <IconReset size={18} /> SETUP
          </button>
        </div>
        <p
          className="mx-auto max-w-lg font-body text-[11px] leading-snug text-beige/55"
          data-testid="results-replay-cost"
        >
          {replayRoutesToSetup
            ? 'No Energy left — REPLAY opens Setup with your stake ready, so a free run is one you chose.'
            : 'REPLAY runs it again on 1 Energy. SETUP reopens the page with your last stake ready.'}
        </p>
      </div>

      {/* ---------- 2 · THE VICTORY LAP ---------- */}
      <section
        data-testid="results-layer-3"
        aria-label="Progression"
        className="order-3 flex flex-col gap-3 sm:order-2"
      >
        <div className="mx-auto w-full max-w-lg rounded-[var(--radius-card)] bg-[color:var(--fill-deck-0)] p-3 text-left sm:p-4">
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
            <div className="mt-3">
              <ImpactVictoryLap key={impact.sessionId} envelope={impact} />
            </div>
          ) : null}
          {CAREER_SPINE_V1_ENABLED && !impact ? (
            <p className="mt-2 font-body text-xs text-beige/60">
              {settlementPending
                ? 'The server accepted and froze this result. Settlement will complete exactly once even if you close the game.'
                : practice
                ? 'Only the live practice session existed; closing it leaves no earned state behind.'
                : 'Keep this tab online while settlement retries. The run becomes earned progress when the server accepts and validates its result; this device never stores a progress copy.'}
            </p>
          ) : null}
        </div>

        {nextAction.href ? (
          <Link
            href={nextAction.href}
            onClick={onNextAction}
            data-testid="results-next-action"
            data-next-action={nextAction.id}
            className="mx-auto flex min-h-[44px] w-full max-w-lg items-center justify-between gap-3 rounded-[var(--radius-card)] border-[length:var(--ink-w-2)] border-ink bg-[color:var(--fill-deck-2)] px-4 py-3 text-left shadow-[var(--ink-drop-void-2)]"
          >
            <span className="min-w-0">
              <span className="heading-display block text-base text-venom-orange">{nextAction.label}</span>
              <span className="block font-body text-xs text-beige/75">{nextAction.description}</span>
            </span>
            <IconArrowRight size={19} className="shrink-0 text-venom-orange" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onNextAction}
            data-testid="results-next-action"
            data-next-action={nextAction.id}
            className="mx-auto flex min-h-[44px] w-full max-w-lg items-center justify-between gap-3 rounded-[var(--radius-card)] border-[length:var(--ink-w-2)] border-ink bg-[color:var(--fill-deck-2)] px-4 py-3 text-left shadow-[var(--ink-drop-void-2)]"
          >
            <span className="min-w-0">
              <span className="heading-display block text-base text-venom-orange">{nextAction.label}</span>
              <span className="block font-body text-xs text-beige/75">{nextAction.description}</span>
            </span>
            <IconArrowRight size={19} className="shrink-0 text-venom-orange" />
          </button>
        )}

        {/*
          The decline half of §5's INVITATION, rendered only for an invitation
          the server can actually close, so Layer 3 still offers exactly one
          RECOMMENDED action (§12.2) with a way to say no beside it.
        */}
        {nextAction.attentionId && onDeclineNextAction ? (
          <button
            type="button"
            onClick={onDeclineNextAction}
            data-testid="results-next-action-decline"
            data-next-action-decline={nextAction.id}
            className="mx-auto flex min-h-[44px] items-center justify-center px-5 font-body text-sm text-beige/60 transition-colors hover:text-bone-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-venom-orange"
          >
            {nextAction.declineLabel ?? 'Not now'}
          </button>
        ) : null}
      </section>

      {/* ---------- 3 · PAYOUT FACTS ---------- */}
      <section
        data-testid="results-layer-2"
        aria-label="Payout facts"
        className="order-4 flex flex-col gap-3 sm:order-3"
      >
        <div className="mx-auto">
          <PayoutField
            practice={practice}
            settlementPending={settlementPending}
            worth={settledYield}
            credited={practice ? 0 : credited}
            committed={committed}
            multiplierBps={multiplier}
          />
        </div>

        {!settlementPending && shareArtifact ? (
          <div className="mx-auto w-full max-w-lg">{shareArtifact}</div>
        ) : null}

        {!settlementPending && genomeRecap ? <GenomeYieldRecap model={genomeRecap} /> : null}
        {!settlementPending && genomeRecap && studyGenomeHref ? (
          <Link
            href={studyGenomeHref}
            className="mx-auto flex min-h-[44px] max-w-sm items-center justify-center gap-2 font-body text-sm text-beige/70 underline decoration-dotted underline-offset-4 transition-colors hover:text-bone-white"
            data-testid="results-study-genome"
          >
            <IconFlask size={15} /> Study these powers <IconArrowRight size={14} />
          </Link>
        ) : null}

        {!settlementPending && clanBattle?.eligible && (
          <div
            className="mx-auto w-full max-w-lg rounded-[var(--radius-card)] bg-[color:var(--fill-deck-0)] px-3 py-2.5 text-left"
            data-testid="results-clan-battle"
          >
            <p className="label-arcade text-[10px] text-beige/55">
              Clan battle · {DEPTH_GLOSS}
            </p>
            <p className="mt-1 font-body text-sm text-bone-white" data-testid="results-clan-placement">
              {clanBattle.enteredTopFive
                ? `${clanReplaced ? 'Replaced your weakest counted result' : 'Entered your five'}${clanDelta !== null && clanDelta > 0 ? ` · +${formatAmount(clanDelta)} Depth` : ''}.`
                : 'Valid battle result · outside your five.'}
            </p>
            {clanBattle.enteredTopFive && clanTotal !== null && clanTotal > 0 ? (
              <p className="mt-0.5 font-body text-[11px] text-beige/65" data-testid="results-clan-total">
                Your clan stands at {formatAmount(clanTotal)} Depth
                {clanDelta !== null && clanDelta > 0
                  ? `, ${formatAmount(clanDelta)} of it from this run`
                  : ''}
                .
              </p>
            ) : null}
            {clanBattle.enteredTopFive && clanFifthBest !== null && clanFifthBest > 0 ? (
              <p className="mt-0.5 font-body text-[11px] text-beige/65">
                Your fifth-best stands at {formatAmount(clanFifthBest)} Depth.
              </p>
            ) : null}
            {!clanBattle.enteredTopFive && depthNeeded !== null ? (
              <p className="mt-0.5 font-body text-[11px] text-beige/65" data-testid="results-clan-gap">
                Needed {formatAmount(depthNeeded)} · this run was worth {formatAmount(settledYield)}
                {shortBy !== null && shortBy > 0 ? ` · ${formatAmount(shortBy)} short` : ''}.
              </p>
            ) : null}
          </div>
        )}

        {!settlementPending && outcome === 'crashed' && !practice ? (
          <div className="mx-auto w-full max-w-lg">
            <CrashConsequences credited={credited} clanBattle={clanBattle} />
          </div>
        ) : null}

        <p className="mx-auto max-w-lg font-body text-[11px] leading-snug text-beige/55">
          {practice
            ? 'Practice creates no persistent reward.'
            : impact || settlementPending
              ? 'Leaving never forfeits a secured prize.'
              : 'Settlement recovery is still in progress; this screen never invents an unverified prize.'}
        </p>
      </section>
    </div>
  );
}

export default RunResults;

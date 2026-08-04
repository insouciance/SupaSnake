'use client';

/**
 * The private, quiet front page of a career. All facts arrive from the
 * server-owned career projection; this component never derives progress from
 * browser state and never persists a pursuit locally.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconArrowRight,
  IconChart,
  IconEgg,
  IconMedal,
  IconShield,
} from '@/components/ui/icons';
import type { CareerPulse as CareerPulseContract } from '@/shared/progression/career';
import type {
  ProgressionDestination,
  ProgressionMoment,
  ProgressionPillar,
} from '@/shared/progression/runImpact';
import { useRecognitionSeen } from '@/components/ui/useRecognitionSeen';
import { progressionArtifactHref } from '@/shared/progression/destinations';
import { CAREER_SPINE_V1_ENABLED } from '@/lib/features/careerSpine';
import { formatAmount } from '@/shared/format/amount';

export type CareerPulseData = CareerPulseContract;

interface CareerPulseResponse {
  careerPulse?: CareerPulseData | null;
}

interface CareerPulseProps {
  accessToken: string;
}

const PILLAR_LABELS: Record<ProgressionPillar, string> = {
  mastery: 'Mastery',
  lineage: 'Lineage',
  discovery: 'Discovery',
  clan: 'Clan',
  calendar: 'World',
};

const DESTINATION_HREF: Record<ProgressionDestination, string> = {
  chronicle: '/profile',
  mastery: '/profile#mastery',
  records: '/profile#records',
  codex: '/codex',
  signal: '/#signal',
  clan: '/clan',
  lab: '/lab',
  lineage: '/lab#lineage',
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function progressPercent(current: number, target: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(100, (current / target) * 100));
}

function MasterySummary({ pulse }: { pulse: CareerPulseData }) {
  const strongest = [...pulse.mastery].sort(
    (a, b) => b.level - a.level || b.xp - a.xp
  )[0];
  return (
    <div
      id="mastery"
      className="scroll-mt-24 rounded-arcade border border-venom-orange/25 bg-void/45 p-3"
    >
      <div className="flex items-center gap-2 text-venom-orange">
        <IconChart size={16} />
        <p className="label-arcade">Mastery</p>
      </div>
      <p className="mt-2 font-display text-lg text-bone-white">
        {strongest && (strongest.xp > 0 || strongest.level > 0)
          ? `Peak · ${strongest.dynasty} M${strongest.level}`
          : 'First extraction ahead'}
      </p>
      <ul className="mt-2 grid grid-cols-3 gap-1.5" aria-label="Dynasty Mastery">
        {pulse.mastery.map((entry) => (
          <li
            key={entry.dynasty}
            id={`mastery-${entry.dynasty}`}
            data-testid={`mastery-summary-${entry.dynasty.toLowerCase()}`}
            aria-label={`${entry.dynasty} Mastery M${entry.level}`}
            className="scroll-mt-24 rounded-md border border-scale-blue-light/25 bg-void-deep/55 px-1.5 py-1 text-center"
          >
            <span className="block truncate font-body text-[9px] uppercase tracking-wide text-beige/55">
              {entry.dynasty}
            </span>
            <span className="block font-mono text-xs text-bone-white">M{entry.level}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LineageSummary({ pulse }: { pulse: CareerPulseData }) {
  return (
    <div className="rounded-arcade border border-scale-blue-light/30 bg-void/45 p-3">
      <div className="flex items-center gap-2 text-[#7df9ff]">
        <IconEgg size={16} />
        <p className="label-arcade">Lineage</p>
      </div>
      <p className="mt-2 font-display text-lg text-bone-white">
        {pulse.lineage.highestGeneration > 0
          ? `Gen ${pulse.lineage.highestGeneration}`
          : 'First lineage ahead'}
      </p>
      <p className="mt-1 font-body text-xs text-beige/60">
        {pulse.lineage.activeSpecimens} active specimen
        {pulse.lineage.activeSpecimens === 1 ? '' : 's'} · {pulse.lineage.dossiers} dossier
        {pulse.lineage.dossiers === 1 ? '' : 's'}
      </p>
    </div>
  );
}

function DiscoverySummary({ pulse }: { pulse: CareerPulseData }) {
  return (
    <div className="rounded-arcade border border-cosmic/30 bg-void/45 p-3">
      <div className="flex items-center gap-2 text-cosmic">
        <IconMedal size={16} />
        <p className="label-arcade">Discovery</p>
      </div>
      <p className="mt-2 font-display text-lg text-bone-white">
        {pulse.discovery.entries > 0
          ? `${pulse.discovery.entries} Genome ${pulse.discovery.entries === 1 ? 'discovery' : 'discoveries'}`
          : 'First discovery ahead'}
      </p>
      <p className="mt-1 font-body text-xs text-beige/60">
        {pulse.records.tiered} tiered Record{pulse.records.tiered === 1 ? '' : 's'}
        {pulse.discovery.worldFirsts > 0
          ? ` · ${pulse.discovery.worldFirsts} world first${pulse.discovery.worldFirsts === 1 ? '' : 's'}`
          : ''}
      </p>
    </div>
  );
}

function LadderArchive({ pulse }: { pulse: CareerPulseData }) {
  if (pulse.ladder.maxBest <= 0) return null;
  return (
    <div
      className="rounded-arcade border border-scale-blue-light/25 bg-void/40 p-3"
      data-testid="career-ladder-archive"
    >
      <p className="label-arcade text-beige/55">Banked difficulty ladder</p>
      <div className="mt-2 flex flex-wrap gap-3">
        {(['CYBER', 'PRIMAL', 'COSMIC'] as const).map((dynasty) => {
          const best = pulse.ladder.bestByDynasty[dynasty];
          if (best <= 0) return null;
          return (
            <div key={dynasty} className="flex items-center gap-1.5">
              <span className="font-body text-xs text-beige/65">{dynasty}</span>
              {Array.from({ length: best }, (_, index) => index + 1).map((rung) => (
                <span
                  key={rung}
                  id={`career-artifact-ladder-${dynasty}-${rung}`}
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-cosmic/35 bg-cosmic/10 px-1 font-mono text-[10px] text-cosmic"
                  title={`${dynasty} ladder rung ${rung} banked`}
                >
                  {rung}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Pursuit({
  pulse,
  busy,
  onChange,
}: {
  pulse: CareerPulseData;
  busy: boolean;
  onChange: (candidateId: string | null) => void;
}) {
  const candidates = pulse.pursuitCandidates.slice(0, 6);
  const active = pulse.pinnedPursuit;
  return (
    <div className="rounded-arcade border border-scale-blue-light/30 bg-void-deep/55 p-4" data-testid="career-pursuit">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="label-arcade text-beige/55">Pinned pursuit</p>
          <p className="mt-1 font-body text-sm text-bone-white">
            {active?.headline ?? 'No pursuit pinned — your career remains open.'}
          </p>
        </div>
        <label className="font-body text-xs text-beige/65">
          <span className="sr-only">Choose a career pursuit</span>
          <select
            aria-label="Choose a career pursuit"
            value={active?.id ?? ''}
            disabled={busy}
            onChange={(event) => onChange(event.target.value || null)}
            className="min-h-[44px] max-w-full rounded-arcade border border-scale-blue-light/40 bg-void px-3 text-bone-white"
          >
            <option value="">No pinned pursuit</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.headline}
              </option>
            ))}
          </select>
        </label>
      </div>
      {active && (
        <>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-scale-blue-dark"
            role="progressbar"
            aria-label={active.headline}
            aria-valuemin={0}
            aria-valuemax={active.target}
            aria-valuenow={Math.min(active.current, active.target)}
          >
            <div
              className="h-full rounded-full bg-venom-orange"
              style={{ width: `${progressPercent(active.current, active.target)}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 font-mono text-xs text-beige/60">
            <span>{formatAmount(active.current)} / {formatAmount(active.target)}</span>
            <Link href={DESTINATION_HREF[active.destination]} className="inline-flex items-center gap-1 text-cosmic hover:text-bone-white">
              Open <IconArrowRight size={12} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function ClanPulse({ pulse }: { pulse: CareerPulseData }) {
  const battle = pulse.clan.activeBattle;
  const honorTotal =
    pulse.clan.honors.participant + pulse.clan.honors.victor + pulse.clan.honors.stalemate;
  if (!battle && honorTotal === 0) return null;

  return (
    <div className="rounded-arcade border border-cosmic/30 bg-cosmic/5 p-4" data-testid="career-clan-pulse">
      <div className="flex items-center gap-2 text-cosmic">
        <IconShield size={17} />
        <p className="label-arcade">Your clan witness</p>
      </div>
      {battle && (
        <div className="mt-2 space-y-1">
          <p className="font-body text-sm text-bone-white">
            {battle.ownTopFive.length < 5 || battle.fifthBest === null
              ? `${5 - battle.ownTopFive.length} open contribution slot${5 - battle.ownTopFive.length === 1 ? '' : 's'}`
              : `Beat ${formatAmount(battle.fifthBest)} Yield to improve your five`}
          </p>
          <p className="font-mono text-xs text-beige/60">
            Clan {formatAmount(battle.clanTotal)} · Rival {battle.opponentTotal === null ? 'pending' : formatAmount(battle.opponentTotal)}
          </p>
        </div>
      )}
      {honorTotal > 0 && (
        <div className="mt-2 space-y-2">
          <p className="font-body text-xs text-beige/65">
            {pulse.clan.honors.victor} victor · {honorTotal} completed battle honor
            {honorTotal === 1 ? '' : 's'}
          </p>
          {pulse.clan.honorHistory.length > 0 && (
            <ol
              className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto"
              aria-label="Clan battle honor archive"
            >
              {pulse.clan.honorHistory.map((honor) => (
                <li
                  key={honor.battleId}
                  id={`career-artifact-clan-battle-${honor.battleId}`}
                  className="rounded-full border border-cosmic/25 bg-void/45 px-2 py-0.5 font-body text-[10px] uppercase text-cosmic"
                  title={`Awarded ${formatDate(honor.awardedAt)}`}
                >
                  {honor.honor}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function RecentMoments({ moments }: { moments: ProgressionMoment[] }) {
  const visible = moments.slice(0, 4);
  if (visible.length === 0) return null;

  return (
    <div data-testid="career-moments">
      <p className="label-arcade text-beige/55">Recent moments</p>
      <ul className="mt-2 space-y-2">
        {visible.map((moment) => (
          <li
            key={moment.id}
            className="flex items-start justify-between gap-3 rounded-arcade border border-scale-blue-light/20 bg-void/40 px-3 py-2"
            data-significance={moment.significance}
          >
            <div className="min-w-0">
              <p className="font-body text-sm text-bone-white">{moment.headline}</p>
              <p className="font-body text-xs text-beige/55">
                {PILLAR_LABELS[moment.pillar]}{formatDate(moment.securedAt) ? ` · ${formatDate(moment.securedAt)}` : ''}
              </p>
            </div>
            {moment.artifactRef && moment.destination ? (
              <Link
                href={progressionArtifactHref(moment.destination, moment.artifactRef)}
                className="shrink-0 font-body text-xs text-cosmic hover:text-bone-white"
                aria-label={`Open verified artifact for ${moment.headline}`}
              >
                Verified
              </Link>
            ) : moment.destination ? (
              <Link
                href={DESTINATION_HREF[moment.destination]}
                className="shrink-0 text-beige/55 hover:text-bone-white"
                aria-label={`Open ${moment.headline}`}
              >
                <IconArrowRight size={14} />
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CareerPulseEnabled({ accessToken }: CareerPulseProps) {
  const [pulse, setPulse] = useState<CareerPulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/progression/career-pulse', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error(`career pulse ${response.status}`);
      const data = (await response.json()) as CareerPulseResponse;
      setPulse(data.careerPulse ?? null);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const candidatesById = useMemo(
    () => new Set(pulse?.pursuitCandidates.map((candidate) => candidate.id) ?? []),
    [pulse?.pursuitCandidates]
  );
  const renderedChronicleArtifacts = useMemo(
    () => {
      if (!pulse) return [];
      const refs: string[] = [];
      for (const dynasty of ['CYBER', 'PRIMAL', 'COSMIC'] as const) {
        for (let rung = 1; rung <= pulse.ladder.bestByDynasty[dynasty]; rung += 1) {
          refs.push(`ladder:${dynasty}:${rung}`);
        }
      }
      for (const honor of pulse.clan.honorHistory) {
        refs.push(`clan-battle:${honor.battleId}`);
      }
      return refs;
    },
    [pulse]
  );
  const renderedMasteryArtifacts = useMemo(
    () => pulse?.mastery.map((entry) => entry.dynasty) ?? [],
    [pulse]
  );

  useEffect(() => {
    if (renderedMasteryArtifacts.length === 0 || typeof window === 'undefined') return;
    const id = window.location.hash.slice(1);
    if (!id.startsWith('mastery-')) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView?.({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [renderedMasteryArtifacts]);

  useRecognitionSeen('chronicle', pulse !== null, accessToken, {
    artifactRefs: renderedChronicleArtifacts,
  });
  useRecognitionSeen('mastery', pulse !== null, accessToken, {
    artifactRefs: renderedMasteryArtifacts,
  });

  const changePursuit = useCallback(
    async (candidateId: string | null) => {
      // The server supplies and validates every target. This client refuses to
      // send an id that was not in the current authoritative projection.
      if (candidateId !== null && !candidatesById.has(candidateId)) return;
      setBusy(true);
      try {
        const response = await fetch('/api/progression/career-pulse', {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ candidateId }),
        });
        if (!response.ok) throw new Error(`career pursuit ${response.status}`);
        const data = (await response.json()) as CareerPulseResponse;
        if (data.careerPulse) setPulse(data.careerPulse);
        else await load();
        setError(false);
      } catch {
        setError(true);
      } finally {
        setBusy(false);
      }
    },
    [accessToken, candidatesById, load]
  );

  if (loading) {
    return (
      <section className="panel p-4" aria-label="Career pulse" data-testid="career-pulse-loading">
        <p className="font-body text-sm text-beige/55 animate-pulse">Reading your career…</p>
      </section>
    );
  }
  if (!pulse) {
    return error ? (
      <p className="font-body text-sm text-beige/55" role="status">
        Your career pulse is temporarily unavailable. Your progress remains secured.
      </p>
    ) : null;
  }

  return (
    <section className="panel-elevated space-y-4 p-4" aria-labelledby="career-pulse-title" data-testid="career-pulse">
      <div>
        <p className="label-arcade text-beige/55">Private career pulse</p>
        <h2 id="career-pulse-title" className="heading-display text-xl text-bone-white">
          What you are building
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <MasterySummary pulse={pulse} />
        <LineageSummary pulse={pulse} />
        <DiscoverySummary pulse={pulse} />
      </div>
      <LadderArchive pulse={pulse} />
      <Pursuit pulse={pulse} busy={busy} onChange={changePursuit} />
      <ClanPulse pulse={pulse} />
      <RecentMoments moments={pulse.recentMoments} />
      {error && (
        <p className="font-body text-xs text-strike-red" role="status">
          That change did not stick. The previous server state is still shown.
        </p>
      )}
    </section>
  );
}

export function CareerPulse(props: CareerPulseProps) {
  if (!CAREER_SPINE_V1_ENABLED) return null;
  return <CareerPulseEnabled {...props} />;
}

export default CareerPulse;

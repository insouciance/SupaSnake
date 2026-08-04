'use client';

import { useEffect, useState } from 'react';
import { useRecognitionSeen } from '@/components/ui/useRecognitionSeen';
import { formatAmount } from '@/shared/format/amount';

interface BattleView {
  live?: boolean;
  active?: boolean;
  eligible?: boolean;
  reason?: string | null;
  cycle?: { endsAt: string; intermissionEndsAt: string; phase: string };
  battle?: { endsAt: string; intermissionEndsAt: string; settledAt: string | null } | null;
  clan?: { name?: string; tag?: string } | null;
  team?: { score: number; outcome: string };
  honors?: { total: number; victories: number; stalemates: number; participations: number };
  opponent?: { clan?: { name?: string; tag?: string }; score: number; outcome: string } | null;
  rewardHistory?: Array<{
    id: string;
    artifactRef: string;
    type: 'battle' | 'glory';
    clan?: { name?: string; tag?: string } | null;
    cycleIndex: number;
    rewardKind?: string;
    outcome?: string;
    participationDna?: number;
    bonusDna?: number;
    amount: number;
    countedDepth: number;
    eligibleRunCount?: number;
    countedRunCount: number;
    seat?: number;
    awardedAt: string;
  }>;
  you?: {
    topFive: Array<{
      sessionId: string;
      score: number;
      energyCommitted: number;
      generation: number;
      rank: number;
    }>;
    fifthBest: number;
    scoreToImprove: number;
    contribution: number;
  };
}

interface EnergyBattlePanelProps {
  accessToken: string;
  compact?: boolean;
}

function countdownLabel(iso: string | undefined): string {
  if (!iso) return '';
  const ms = Math.max(0, new Date(iso).getTime() - Date.now());
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

function artifactDomId(artifactRef: string): string {
  return `clan-run-${artifactRef.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

function RewardHistory({
  rewards,
  compact,
}: {
  rewards: NonNullable<BattleView['rewardHistory']>;
  compact: boolean;
}) {
  const visible = rewards.slice(0, compact ? 2 : 6);
  if (visible.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="clan-reward-history">
      <div>
        <p className="label-arcade text-venom-orange">Secured battle rewards</p>
        <p className="font-body text-xs text-beige/60">
          Exact server receipts. These rewards are already in your DNA balance.
        </p>
      </div>
      <ol className="space-y-1.5">
        {visible.map((reward) => (
          <li
            key={`${reward.type}:${reward.id}`}
            id={artifactDomId(reward.artifactRef)}
            className="rounded-arcade border border-venom-orange/25 bg-venom-orange/5 px-3 py-2"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-sm uppercase text-bone-white">
                {reward.type === 'glory'
                  ? `Glory seat ${reward.seat ?? ''}`
                  : reward.rewardKind === 'victor'
                    ? 'Victory'
                    : reward.rewardKind === 'stalemate'
                      ? 'Stalemate'
                      : reward.outcome === 'bye'
                        ? 'Unmatched participation'
                        : 'Participation'}
              </p>
              <p className="shrink-0 font-mono font-bold text-venom-orange">
                +{formatAmount(reward.amount)} DNA
              </p>
            </div>
            <p className="mt-0.5 font-body text-xs text-beige/65">
              {reward.type === 'battle'
                ? `${reward.participationDna ?? 0} participation${(reward.bonusDna ?? 0) > 0 ? ` + ${reward.bonusDna} outcome bonus` : ''}`
                : `${formatAmount(reward.countedDepth)} eligible Depth`}
              {' · '}
              {reward.clan?.tag ? `[${reward.clan.tag}] ` : ''}
              {reward.clan?.name ?? `Cycle ${reward.cycleIndex}`}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function EnergyBattlePanel({ accessToken, compact = false }: EnergyBattlePanelProps) {
  const [view, setView] = useState<BattleView | null>(null);
  const [error, setError] = useState(false);
  const [, setClock] = useState(0);
  const topFive = view?.you?.topFive ?? [];
  const rewards = view?.rewardHistory ?? [];
  const visibleRewards = rewards.slice(0, compact ? 2 : 6);
  const isUndeployed = view?.live === false && view.reason === 'not_deployed';
  const rendersBattleSurface = view !== null && !error && !isUndeployed;
  const rendersTopFive = rendersBattleSurface && view.reason !== 'no_clan' && view.live !== false && !compact;
  useRecognitionSeen('clan', rendersBattleSurface, accessToken, {
    artifactRefs: [
      ...(rendersTopFive ? topFive.map((result) => result.sessionId) : []),
      ...visibleRewards.map((reward) => reward.artifactRef),
    ],
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/clan/energy-battle', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`battle ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setView(data as BattleView);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock((value) => value + 1), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  if (error) return <p className="font-body text-sm text-beige/60">Battle status is unavailable.</p>;
  if (!view) return <p className="font-body text-sm text-beige/60">Reading battle…</p>;
  if (view.reason === 'no_clan') {
    return (
      <section className="panel-elevated space-y-4 p-5 text-left">
        <p className="font-body text-sm text-beige/70">
          Join or found a clan to make Energy runs count socially.
        </p>
        <RewardHistory rewards={rewards} compact={compact} />
      </section>
    );
  }
  if (isUndeployed) return null;
  if (view.live === false) {
    const nextCycle = view.cycle?.intermissionEndsAt;
    return (
      <section
        className="panel-elevated space-y-3 p-4 text-left"
        data-testid="clan-energy-battle-intermission"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label-arcade text-cosmic">Clan Energy Battle</p>
            <h2 className="heading-display text-xl text-bone-white">Results secured</h2>
          </div>
          {nextCycle && (
            <p className="font-mono text-xs text-beige/65">
              Next cycle in {countdownLabel(nextCycle)}
            </p>
          )}
        </div>
        <p className="font-body text-sm text-beige/70">
          The battle is settling. Secured DNA receipts remain visible during intermission.
        </p>
        <RewardHistory rewards={rewards} compact={compact} />
      </section>
    );
  }

  const end = view.active
    ? view.battle?.endsAt ?? view.cycle?.endsAt
    : view.battle?.intermissionEndsAt ?? view.cycle?.intermissionEndsAt;

  return (
    <section className="panel-elevated space-y-4 p-5 text-left" data-testid="clan-energy-battle">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label-arcade text-cosmic">Clan Energy Battle</p>
          <h2 className="heading-display text-2xl text-bone-white">
            {view.active ? 'Three-day battle active' : 'Battle intermission'}
          </h2>
        </div>
        <p className="font-mono text-sm text-beige/70">
          {view.active ? 'Ends' : 'Next cycle'} in {countdownLabel(end)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 font-body">
        <div className="rounded-arcade border border-cosmic/40 bg-cosmic/10 p-3">
          <p className="text-xs uppercase text-beige/55">{view.clan?.tag ?? 'Your clan'}</p>
          <p className="font-mono text-xl font-bold text-bone-white">
            {formatAmount(view.team?.score ?? 0)}
          </p>
        </div>
        <div className="rounded-arcade border border-scale-blue-light/35 bg-void/50 p-3">
          <p className="text-xs uppercase text-beige/55">
            {view.opponent?.clan?.tag ?? 'Opponent forming'}
          </p>
          <p className="font-mono text-xl font-bold text-bone-white">
            {formatAmount(view.opponent?.score ?? 0)}
          </p>
        </div>
      </div>

      {(view.team?.outcome !== 'pending' || (view.honors?.total ?? 0) > 0) && (
        <div className="rounded-arcade border border-venom-orange/25 bg-venom-orange/5 px-3 py-2 font-body text-xs text-beige/75">
          {view.team?.outcome !== 'pending' && (
            <p className="font-bold text-bone-white">
              {view.team?.outcome === 'victor'
                ? 'Victory honor earned.'
                : view.team?.outcome === 'stalemate'
                  ? 'Stalemate honor earned.'
                  : view.team?.outcome === 'bye'
                    ? 'Participation honor earned; no rival formed.'
                    : 'Participation honor earned.'}
            </p>
          )}
          {(view.honors?.total ?? 0) > 0 && (
            <p>
              Battle record: {view.honors?.victories ?? 0} victor
              {(view.honors?.victories ?? 0) === 1 ? 'y' : 'ies'} · {view.honors?.total ?? 0}{' '}
              completed
            </p>
          )}
        </div>
      )}

      <RewardHistory rewards={rewards} compact={compact} />

      {!compact && (
        <div className="space-y-2">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="label-arcade text-venom-orange">Your strongest five</p>
              <p className="font-body text-xs text-beige/60">
                Clan score uses full-strength Yield—not the Energy harvest multiplier.
              </p>
            </div>
            <p className="font-body text-xs text-beige/70">
              {topFive.length >= 5
                ? `Beat ${formatAmount(view.you?.fifthBest ?? 0)} Yield`
                : `${5 - topFive.length} open slot${5 - topFive.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <ol className="space-y-1">
            {topFive.map((result) => (
              <li
                key={result.sessionId}
                id={`clan-run-${result.sessionId}`}
                className="flex items-center justify-between rounded-arcade bg-void/45 px-3 py-2 font-mono text-sm"
              >
                <span className="text-beige/65">
                  #{result.rank} · {result.energyCommitted}E · Gen {result.generation}
                </span>
                <span className="font-bold text-bone-white">{formatAmount(result.score)}</span>
              </li>
            ))}
            {topFive.length === 0 && (
              <li className="font-body text-sm text-beige/60">
                Start any Energy-funded normal run during the active window. No opt-in needed.
              </li>
            )}
          </ol>
        </div>
      )}

      {view.reason === 'cycle_locked_to_previous_clan' && (
        <p className="font-body text-xs text-strike-red">
          This cycle remains attached to your previous clan; your current clan can score next cycle.
        </p>
      )}
    </section>
  );
}

export default EnergyBattlePanel;

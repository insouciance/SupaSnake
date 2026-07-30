'use client';

import { useEffect, useState } from 'react';
import { useRecognitionSeen } from '@/components/ui/useRecognitionSeen';

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

export function EnergyBattlePanel({ accessToken, compact = false }: EnergyBattlePanelProps) {
  const [view, setView] = useState<BattleView | null>(null);
  const [error, setError] = useState(false);
  const [, setClock] = useState(0);
  const topFive = view?.you?.topFive ?? [];
  useRecognitionSeen('clan', view !== null && !error, accessToken, {
    artifactRefs: topFive.map((result) => result.sessionId),
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
    return <p className="font-body text-sm text-beige/70">Join or found a clan to make Energy runs count socially.</p>;
  }
  if (view.live === false) return null;

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
            {(view.team?.score ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-arcade border border-scale-blue-light/35 bg-void/50 p-3">
          <p className="text-xs uppercase text-beige/55">
            {view.opponent?.clan?.tag ?? 'Opponent forming'}
          </p>
          <p className="font-mono text-xl font-bold text-bone-white">
            {(view.opponent?.score ?? 0).toLocaleString()}
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
                ? `Beat ${(view.you?.fifthBest ?? 0).toLocaleString()} Yield`
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
                <span className="font-bold text-bone-white">{result.score.toLocaleString()}</span>
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

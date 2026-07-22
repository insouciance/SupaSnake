'use client';

/**
 * Weekly Anomaly board entry (Design v2 §7.2) - the compact pre-game
 * panel shown when the ANOMALY mode chip is selected: the week's modifier
 * (name + one-line effect), the rotation countdown, the player's best,
 * and the top 10. Data comes from GET /api/anomaly (fetched by the game
 * page); this component only renders it.
 */

import { useEffect, useState } from 'react';
import { IconTrophy } from '@/components/ui/icons';
import { StrainChip } from '@/components/traits/StrainChip';
import type { StrainId } from '@/shared/game/strains';

export interface AnomalyBoardView {
  live: boolean;
  anomaly: {
    id: string;
    name: string;
    effect: string;
    strainBias: StrainId;
    endsAt: string;
  };
  top: Array<{ rank: number; name: string; score: number }>;
  my: { best: number; rank: number; runs: number } | null;
}

/** d/h/m countdown to the weekly rotation boundary. */
export function formatWeekCountdown(endsAt: string, now: number = Date.now()): string {
  const ms = new Date(endsAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return 'rotating…';
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = minutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

interface AnomalyPanelProps {
  board: AnomalyBoardView;
}

export function AnomalyPanel({ board }: AnomalyPanelProps) {
  // Re-render the countdown once a minute while visible
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      data-testid="anomaly-panel"
      className="rounded-arcade border border-[#7df9ff]/50 bg-void/60 backdrop-blur-sm p-4 text-left space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-arcade text-[#7df9ff]">This Week&apos;s Anomaly</p>
          <p
            className="heading-display text-xl text-bone-white"
            data-testid="anomaly-name"
          >
            {board.anomaly.name}
          </p>
          <p className="text-beige/70 text-xs font-body">{board.anomaly.effect}</p>
          <div className="mt-2 flex items-center gap-2" data-testid="anomaly-strain-bias">
            <StrainChip strain={board.anomaly.strainBias} />
            <span className="text-beige/50 text-[11px] font-body">+100 offer gravity this week</span>
          </div>
        </div>
        <span
          className="shrink-0 px-2 py-1 rounded-arcade border border-scale-blue-light/50 text-beige/70 text-xs font-body"
          data-testid="anomaly-countdown"
          title="Time until the next anomaly rotates in"
        >
          {formatWeekCountdown(board.anomaly.endsAt, now)}
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm font-body" data-testid="anomaly-my-best">
        <IconTrophy size={15} className="text-venom-orange" />
        {board.my ? (
          <span className="text-beige">
            Your best{' '}
            <span className="font-bold text-venom-orange">{board.my.best}</span>
            {' '}· rank <span className="text-bone-white">#{board.my.rank}</span>
            {' '}· {board.my.runs} run{board.my.runs === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="text-beige/60">No runs on this board yet — set the pace</span>
        )}
      </div>

      {board.top.length > 0 && (
        <ol className="space-y-1 max-h-40 overflow-y-auto" data-testid="anomaly-top">
          {board.top.map((entry) => (
            <li
              key={entry.rank}
              className="flex items-center justify-between text-xs font-body text-beige"
            >
              <span>
                <span className="text-beige/50 mr-2">#{entry.rank}</span>
                {entry.name}
              </span>
              <span className="font-mono text-bone-white">{entry.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default AnomalyPanel;

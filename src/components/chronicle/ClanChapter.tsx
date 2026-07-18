'use client';

/**
 * Clan history (Player Identity v1 section 7.1 #6): current clan card,
 * the clan_rating_history sparkline (appended at settlement from I2),
 * and the clan's rivalry records - rivalries render only when data
 * exists (section 7.2).
 */

import React from 'react';
import { IconShield } from '@/components/ui/icons';
import type { ClanSection } from '@/lib/chronicle/types';

const SPARK_WIDTH = 280;
const SPARK_HEIGHT = 48;

function RatingSparkline({
  history,
}: {
  history: ClanSection['ratingHistory'];
}): React.ReactElement | null {
  if (history.length === 0) return null;
  const ratings = history.map((point) => point.ratingAfter);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const span = Math.max(1, max - min);
  const xFor = (index: number) =>
    history.length === 1
      ? SPARK_WIDTH / 2
      : (index / (history.length - 1)) * (SPARK_WIDTH - 8) + 4;
  const yFor = (rating: number) =>
    SPARK_HEIGHT - 6 - ((rating - min) / span) * (SPARK_HEIGHT - 12);
  const path = history
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${xFor(index)},${yFor(point.ratingAfter)}`
    )
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      className="w-full max-w-[280px]"
      role="img"
      aria-label="Clan rating history"
      data-testid="clan-rating-sparkline"
    >
      <path
        d={path}
        fill="none"
        stroke="#7df9ff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {history.map((point, index) => (
        <circle
          key={point.weekStart}
          cx={xFor(index)}
          cy={yFor(point.ratingAfter)}
          r="2.5"
          fill={point.delta >= 0 ? '#4ade80' : '#f87171'}
        >
          <title>
            {`Week ${point.weekStart}: ${point.ratingAfter} (${point.delta >= 0 ? '+' : ''}${point.delta})`}
          </title>
        </circle>
      ))}
    </svg>
  );
}

export function ClanChapter({
  clan,
}: {
  clan: ClanSection;
}): React.ReactElement {
  return (
    <div className="panel p-4 space-y-3" data-testid="clan-chapter">
      <div className="flex items-center gap-2">
        <IconShield size={18} className="text-[#7df9ff]" />
        <h3 className="heading-display text-base text-bone-white">
          {clan.name}
        </h3>
        <span className="font-body text-xs text-[#7df9ff] tracking-wider">
          [{clan.tag}]
        </span>
        <span className="font-body text-xs text-beige/60 ml-auto">
          Rating <span className="text-venom-orange font-bold">{clan.rating}</span>
        </span>
      </div>

      {clan.ratingHistory.length > 0 ? (
        <RatingSparkline history={clan.ratingHistory} />
      ) : (
        <p
          className="font-body text-xs text-beige/50"
          data-testid="clan-history-empty"
        >
          The first settled duel starts the rating graph.
        </p>
      )}

      {clan.rivalries.length > 0 && (
        <div className="space-y-1" data-testid="clan-rivalries">
          <p className="font-body text-xs text-beige/50 uppercase tracking-wider">
            Rivalries
          </p>
          {clan.rivalries.map((rivalry) => (
            <p
              key={`${rivalry.opponentName}-${rivalry.opponentTag}`}
              className="font-body text-sm text-beige/80"
            >
              vs {rivalry.opponentName}
              {rivalry.opponentTag ? ` [${rivalry.opponentTag}]` : ''}{' '}
              <span className="text-[#4ade80]">{rivalry.wins}W</span>
              {' — '}
              <span className="text-[#f87171]">{rivalry.losses}L</span>
              {rivalry.ties > 0 && (
                <span className="text-beige/50"> — {rivalry.ties}T</span>
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default ClanChapter;

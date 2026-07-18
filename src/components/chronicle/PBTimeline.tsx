'use client';

/**
 * PB timeline (Player Identity v1 section 7.1 #2): weekly MAX(score)
 * per dynasty since account creation - the "you are improving" graph -
 * annotated with record-tier and mastery moments. Empty state per
 * section 7.2: a single forward-looking prompt, never an empty chart.
 */

import React from 'react';
import { dynastyThemes } from '@/hooks/useDynastyTheme';
import type { PbTimelineData } from '@/lib/chronicle/types';

const CHART_WIDTH = 640;
const CHART_HEIGHT = 160;
const PADDING = { top: 12, right: 12, bottom: 22, left: 40 };

const RARITY_TEXT: Record<string, string> = {
  common: 'text-beige/80',
  uncommon: 'text-rarity-uncommon',
  rare: 'text-rarity-rare',
  epic: 'text-rarity-epic',
  legendary: 'text-rarity-legendary',
};

export function PBTimeline({
  data,
}: {
  data: PbTimelineData;
}): React.ReactElement {
  if (data.points.length === 0) {
    return (
      <p
        className="font-body text-sm text-beige/60"
        data-testid="pb-timeline-empty"
      >
        Your first banked run starts your timeline.
      </p>
    );
  }

  const weeks = Array.from(
    new Set(data.points.map((point) => point.weekStart))
  ).sort();
  const dynasties = Array.from(
    new Set(data.points.map((point) => point.dynasty))
  ).sort();
  const maxScore = Math.max(...data.points.map((point) => point.bestScore), 1);

  const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const xFor = (week: string) =>
    PADDING.left +
    (weeks.length === 1
      ? innerWidth / 2
      : (weeks.indexOf(week) / (weeks.length - 1)) * innerWidth);
  const yFor = (score: number) =>
    PADDING.top + innerHeight - (score / maxScore) * innerHeight;

  return (
    <div className="space-y-3" data-testid="pb-timeline">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full min-w-[320px]"
          role="img"
          aria-label="Weekly personal best scores per dynasty"
        >
          {/* Axis baseline + max marker */}
          <line
            x1={PADDING.left}
            y1={PADDING.top + innerHeight}
            x2={PADDING.left + innerWidth}
            y2={PADDING.top + innerHeight}
            stroke="rgba(125,249,255,0.25)"
            strokeWidth="1"
          />
          <text
            x={PADDING.left - 6}
            y={PADDING.top + 8}
            textAnchor="end"
            fontSize="10"
            fill="rgba(232,226,208,0.6)"
          >
            {maxScore.toLocaleString()}
          </text>
          <text
            x={PADDING.left - 6}
            y={PADDING.top + innerHeight}
            textAnchor="end"
            fontSize="10"
            fill="rgba(232,226,208,0.4)"
          >
            0
          </text>

          {/* Week labels: first + last */}
          <text
            x={xFor(weeks[0])}
            y={CHART_HEIGHT - 6}
            textAnchor="start"
            fontSize="10"
            fill="rgba(232,226,208,0.5)"
          >
            {weeks[0]}
          </text>
          {weeks.length > 1 && (
            <text
              x={xFor(weeks[weeks.length - 1])}
              y={CHART_HEIGHT - 6}
              textAnchor="end"
              fontSize="10"
              fill="rgba(232,226,208,0.5)"
            >
              {weeks[weeks.length - 1]}
            </text>
          )}

          {/* One PB line per dynasty */}
          {dynasties.map((dynasty) => {
            const theme = dynastyThemes[dynasty] ?? dynastyThemes.CYBER;
            const dynastyPoints = data.points
              .filter((point) => point.dynasty === dynasty)
              .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
            const path = dynastyPoints
              .map(
                (point, index) =>
                  `${index === 0 ? 'M' : 'L'}${xFor(point.weekStart)},${yFor(point.bestScore)}`
              )
              .join(' ');
            return (
              <g key={dynasty} data-testid={`pb-line-${dynasty}`}>
                <path
                  d={path}
                  fill="none"
                  stroke={theme.glow}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {dynastyPoints.map((point) => (
                  <circle
                    key={`${dynasty}-${point.weekStart}`}
                    cx={xFor(point.weekStart)}
                    cy={yFor(point.bestScore)}
                    r="3"
                    fill={theme.glow}
                  >
                    <title>
                      {`${dynasty} — week ${point.weekStart}: ${point.bestScore.toLocaleString()} (${point.runs} runs)`}
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {dynasties.map((dynasty) => {
          const theme = dynastyThemes[dynasty] ?? dynastyThemes.CYBER;
          return (
            <span
              key={dynasty}
              className="font-body text-xs text-beige/80 inline-flex items-center gap-1.5"
            >
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ background: theme.glow }}
              />
              {dynasty}
            </span>
          );
        })}
      </div>

      {/* Moment annotations (record tiers, mastery rungs) */}
      {data.annotations.length > 0 && (
        <div className="space-y-1" data-testid="pb-annotations">
          {data.annotations.slice(-8).map((annotation) => (
            <p
              key={`${annotation.cosmeticId}-${annotation.weekStart}`}
              className="font-body text-xs text-beige/60"
            >
              <span className="text-beige/40">{annotation.weekStart}</span>{' '}
              <span
                className={RARITY_TEXT[annotation.rarity] ?? 'text-beige/80'}
              >
                {annotation.label}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default PBTimeline;

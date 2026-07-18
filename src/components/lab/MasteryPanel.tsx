'use client';

/**
 * MasteryPanel - the Lab's per-dynasty mastery track (Design v2 §7.1).
 * Shows the active dynasty's level, an XP bar to the next level, and the
 * M1-M10 unlock track: mutation unlocks at M3/M6/M9 (named), cosmetic
 * tiers elsewhere. Dynasty-themed via the shared glow tokens.
 *
 * State is server-read (/api/mastery, pre-019 = level 0 everywhere); XP
 * is only ever granted by the game-session end action.
 */

import React from 'react';
import type { DynastyTheme } from '@/hooks/useDynastyTheme';
import { MUTATIONS } from '@/shared/game/mutations';
import {
  MASTERY_MUTATIONS,
  type MasteryMutationLevel,
} from '@/shared/game/mastery';
import type { DynastyName } from '@/shared/game/rulesets';
import { IconCheck, IconDna, IconLock } from '@/components/ui/icons';

export interface MasteryTrackRung {
  level: number;
  kind: string;
  label: string;
  unlocked: boolean;
}

export interface DynastyMasteryState {
  dynasty: string;
  xp: number;
  level: number;
  intoLevel: number;
  /** XP still needed for the next level; null at M10. */
  toNext: number | null;
  track: MasteryTrackRung[];
}

export interface MasteryPanelProps {
  mastery: DynastyMasteryState;
  dynastyTheme: DynastyTheme;
}

function hexToRgba(hex: string, opacity: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function MasteryPanel({
  mastery,
  dynastyTheme,
}: MasteryPanelProps): React.ReactElement {
  const glow = dynastyTheme.glow;
  const { level, intoLevel, toNext } = mastery;
  const levelSpan = toNext === null ? 1 : intoLevel + toNext;
  const fillWidth =
    toNext === null ? 100 : Math.min(100, (intoLevel / levelSpan) * 100);

  return (
    <div className="panel p-4 space-y-3" data-testid="mastery-panel">
      {/* Header: dynasty + level */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="label-arcade whitespace-nowrap">
          {mastery.dynasty} Mastery
        </span>
        <span
          className="heading-display text-lg"
          style={{ color: glow, textShadow: `0 0 8px ${hexToRgba(glow, 0.6)}` }}
          data-testid="mastery-level"
        >
          M{level}
        </span>
      </div>

      {/* XP bar to next level */}
      <div className="space-y-1">
        <div
          className="relative h-2 w-full rounded-arcade overflow-hidden border border-scale-blue-light/50 bg-void-deep/80"
          role="progressbar"
          aria-valuenow={intoLevel}
          aria-valuemin={0}
          aria-valuemax={levelSpan}
          aria-label={
            toNext === null
              ? 'Mastery track complete'
              : `Mastery level ${level}: ${intoLevel} of ${levelSpan} XP toward level ${level + 1}`
          }
        >
          <div
            className="absolute top-0 left-0 h-full rounded-arcade transition-all duration-300 ease-out"
            style={{
              width: `${fillWidth}%`,
              background: `linear-gradient(90deg, ${hexToRgba(glow, 0.65)} 0%, ${glow} 100%)`,
              boxShadow: fillWidth > 0 ? `0 0 10px ${hexToRgba(glow, 0.7)}` : 'none',
            }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] font-body text-beige/60">
          <span className="inline-flex items-center gap-1">
            <IconDna size={11} />
            banked XP feeds mastery — extractions only
          </span>
          <span data-testid="mastery-to-next">
            {toNext === null
              ? 'Track complete — Sovereign'
              : `${intoLevel.toLocaleString()} / ${levelSpan.toLocaleString()} XP to M${level + 1}`}
          </span>
        </div>
      </div>

      {/* M1-M10 unlock track */}
      <ol className="grid grid-cols-2 sm:grid-cols-5 gap-1.5" data-testid="mastery-track">
        {mastery.track.map((rung) => {
          const isMutation = rung.kind === 'mutation';
          const mutationId = isMutation
            ? MASTERY_MUTATIONS[mastery.dynasty as DynastyName]?.[
                rung.level as MasteryMutationLevel
              ]
            : undefined;
          const tooltip =
            isMutation && mutationId
              ? `${MUTATIONS[mutationId].effect}. Cost: ${MUTATIONS[mutationId].cost}`
              : rung.label;
          return (
            <li
              key={rung.level}
              title={tooltip}
              data-testid={`mastery-rung-${rung.level}`}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-arcade border text-[11px] font-body leading-tight ${
                rung.unlocked
                  ? 'bg-void/60'
                  : 'border-scale-blue-light/40 bg-void-deep/60 text-beige/50'
              }`}
              style={
                rung.unlocked
                  ? {
                      borderColor: hexToRgba(glow, 0.6),
                      color: glow,
                      boxShadow: `0 0 6px ${hexToRgba(glow, 0.25)}`,
                    }
                  : undefined
              }
            >
              {rung.unlocked ? (
                <IconCheck size={11} className="shrink-0" />
              ) : (
                <IconLock size={11} className="shrink-0" />
              )}
              <span className="font-bold shrink-0">M{rung.level}</span>
              <span
                className={`truncate ${
                  isMutation && !rung.unlocked ? 'text-[#c4b5fd]' : ''
                }`}
              >
                {rung.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default MasteryPanel;

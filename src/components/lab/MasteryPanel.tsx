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
import { LabDynastyRune } from '@/components/lab/LabDynastyRune';

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
    <div
      className="overflow-hidden rounded-[20px] border border-scale-blue-light/35 bg-void-deep/55 p-3 shadow-panel sm:p-4"
      data-testid="mastery-panel"
      style={{ background: `radial-gradient(circle at 92% 0%, ${hexToRgba(glow, 0.13)}, rgba(6,9,13,.78) 42%)` }}
    >
      {/* Header: dynasty + level */}
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="h-7 w-7 shrink-0" style={{ color: glow }}>
            <LabDynastyRune dynastyName={mastery.dynasty} className="h-full w-full" />
          </span>
          <span className="truncate font-display text-xs uppercase tracking-[0.08em] text-bone-white">
            {mastery.dynasty} Mastery
          </span>
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
      <div className="mt-3 space-y-1">
        <div
          className="relative h-1.5 w-full overflow-hidden rounded-full bg-scale-blue-light/35"
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
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${fillWidth}%`,
              background: `linear-gradient(90deg, ${hexToRgba(glow, 0.65)} 0%, ${glow} 100%)`,
              boxShadow: fillWidth > 0 ? `0 0 10px ${hexToRgba(glow, 0.7)}` : 'none',
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-2 font-body text-[10px] text-beige/60 sm:text-[11px]">
          <span className="hidden items-center gap-1 sm:inline-flex">
            <IconDna size={11} />
            Banked XP
          </span>
          <span data-testid="mastery-to-next">
            {toNext === null
              ? 'Track complete — Sovereign'
              : `${intoLevel.toLocaleString()} / ${levelSpan.toLocaleString()} XP to M${level + 1}`}
          </span>
        </div>
      </div>

      {/* M1-M10 unlock track */}
      <ol className="mt-3 grid grid-cols-5 gap-1" data-testid="mastery-track">
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
              className={`flex min-h-[42px] flex-col items-center justify-center gap-0.5 rounded-[10px] border px-1 py-1 text-center font-body text-[9px] leading-tight sm:text-[10px] ${
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
              <span className="shrink-0 font-bold">M{rung.level}</span>
              <span
                className={`hidden w-full truncate sm:block ${
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

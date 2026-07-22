'use client';

/**
 * StrainChip - compact display for one strain (Buildcraft: The Genome §7).
 *
 * Strain-colored pip chip: name + optional pip count (lineage strength /
 * live strain points). Used by the lab lineage surfaces, the breeding
 * preview/reveal, and the pre-run "Build Seed" row. Pure display.
 */

import React from 'react';
import { STRAINS, type StrainId } from '@/shared/game/strains';

function hexToRgba(hex: string, opacity: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export interface StrainChipProps {
  strain: StrainId;
  /** Pips rendered after the name (strain points / lineage strength). */
  points?: number;
  /** sm = collection cards / HUD rows, md = detail modal / reveal. */
  size?: 'sm' | 'md';
  /** Extra emphasis (breeding reveal pop-in). */
  emphasis?: boolean;
  className?: string;
}

export function StrainChip({
  strain,
  points,
  size = 'sm',
  emphasis = false,
  className = '',
}: StrainChipProps): React.ReactElement | null {
  const def = STRAINS[strain];
  if (!def) return null;

  const tooltip = `${def.name} — ${def.identity}`;

  return (
    <span
      data-testid={`strain-chip-${strain}`}
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded-arcade border font-mono font-semibold whitespace-nowrap uppercase tracking-wide ${
        size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
      } ${emphasis ? 'animate-pop-in' : ''} ${className}`}
      style={{
        borderColor: hexToRgba(def.color, 0.55),
        backgroundColor: hexToRgba(def.color, 0.12),
        color: def.color,
        boxShadow: emphasis
          ? `0 0 12px -2px ${hexToRgba(def.color, 0.7)}`
          : undefined,
      }}
    >
      {def.name}
      {typeof points === 'number' && points > 0 && (
        <span aria-label={`${points} point${points === 1 ? '' : 's'}`}>
          {'•'.repeat(Math.min(4, points))}
        </span>
      )}
    </span>
  );
}

export default StrainChip;

'use client';

/**
 * StrainChip - compact display for one strain (Buildcraft: The Genome §7).
 *
 * Strain-colored pip chip: name + optional pip count (lineage strength /
 * live strain points). Used by the lab lineage surfaces, the breeding
 * preview/reveal, and the pre-run "Build Seed" row.
 *
 * ── Two fixes from WP-2.07b ──────────────────────────────────────────────
 *
 * 1. The chip now carries an **unconditional `aria-label`**. It had none:
 *    the strain's identity line lived only in a `title`, which touch never
 *    shows and which a screen reader is not obliged to announce, so the
 *    sentence explaining what AURUM *is* reached neither.
 * 2. `interactive` wraps the chip in an `InfoPopover`, the same opt-in
 *    `TraitChip` has and for the same reason — it renders a `<button>`, so
 *    hosts that are themselves buttons (the lineage-primary selects, the
 *    breeding draft's lineage toggles) must not ask for it.
 */

import React from 'react';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { describe as describeEntry } from '@/shared/game/lexicon';
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
  /**
   * Wrap the chip in a tap-to-explain popover. Default false: the chip
   * renders no `<button>` unless a host that is not itself a button asks
   * for one.
   */
  interactive?: boolean;
  /** Pair the family rune with its written name for first-glance buildcraft. */
  showGlyph?: boolean;
  className?: string;
}

export function StrainChip({
  strain,
  points,
  size = 'sm',
  emphasis = false,
  interactive = false,
  showGlyph = false,
  className = '',
}: StrainChipProps): React.ReactElement | null {
  const def = STRAINS[strain];
  if (!def) return null;

  const tooltip = `${def.name} — ${def.identity}`;
  const pips = typeof points === 'number' && points > 0 ? points : 0;
  const pipPhrase = pips > 0 ? `, ${pips} point${pips === 1 ? '' : 's'}` : '';

  const chip = (
    <span
      data-testid={`strain-chip-${strain}`}
      title={tooltip}
      aria-label={`${tooltip}${pipPhrase}`}
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
      {showGlyph && (
        <span
          className={size === 'sm' ? 'h-3 w-3 shrink-0' : 'h-4 w-4 shrink-0'}
          aria-hidden="true"
        >
          <StrainGlyph id={strain} />
        </span>
      )}
      {def.name}
      {pips > 0 && (
        <span aria-label={`${pips} point${pips === 1 ? '' : 's'}`}>
          {'•'.repeat(Math.min(4, pips))}
        </span>
      )}
    </span>
  );

  if (!interactive) return chip;

  // The strain's identity is the Lexicon's `effect` for a strain family; a
  // family is a taxonomy rather than a deal, so it is documented costless.
  const entry = describeEntry('strain', strain);
  if (!entry) return chip;

  return (
    <InfoPopover
      testId={`strain-${strain}`}
      title={entry.name}
      effect={entry.effect}
      cost={entry.cost}
      label={`${entry.name}${pipPhrase}: what it does`}
    >
      {chip}
    </InfoPopover>
  );
}

export default StrainChip;

'use client';

/**
 * TraitChip - compact display for one trait (Design v2 Phase 3A).
 *
 * Traits are sidegrades, so the chip surfaces both halves of the deal in
 * its tooltip: "effect — tradeoff". Taxonomy-tinted border: [E]conomic
 * cyan, [P]hysical orange, mixed violet. A dashed EmptyTraitSlot marks an
 * unlocked-but-unfilled slot, and TraitChipRow lays out a snake's slots.
 */

import React from 'react';
import { TRAITS, type TraitId, type TraitKind } from '@/shared/game/traits';

/** Taxonomy tint - matches the E/P color language of the mutation cards. */
const KIND_COLOR: Record<TraitKind, string> = {
  E: '#00FFFF', // economic - cyber cyan
  P: '#FF7A1A', // physical - venom orange
  EP: '#a78bfa', // mixed - violet
};

function hexToRgba(hex: string, opacity: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export interface TraitChipProps {
  traitId: TraitId;
  /** sm = collection cards / parent slots, md = detail modal / reveal. */
  size?: 'sm' | 'md';
  /** Extra emphasis (breeding reveal pop-in). */
  emphasis?: boolean;
  className?: string;
}

export function TraitChip({
  traitId,
  size = 'sm',
  emphasis = false,
  className = '',
}: TraitChipProps): React.ReactElement<any> | null {
  const def = TRAITS[traitId];
  if (!def) return null;

  const color = KIND_COLOR[def.kind];
  const tooltip = `${def.name}: ${def.effect} — ${def.cost}`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-arcade border font-mono font-semibold whitespace-nowrap ${
        size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
      } ${emphasis ? 'animate-pop-in' : ''} ${className}`}
      style={{
        borderColor: hexToRgba(color, 0.55),
        backgroundColor: hexToRgba(color, 0.12),
        color,
        boxShadow: emphasis ? `0 0 12px -2px ${hexToRgba(color, 0.7)}` : undefined,
      }}
      title={tooltip}
      aria-label={tooltip}
      data-testid={`trait-chip-${def.id}`}
    >
      {def.name}
    </span>
  );
}

export interface EmptyTraitSlotProps {
  size?: 'sm' | 'md';
  className?: string;
}

/** An unlocked but unfilled trait slot - breeding/rerolling can fill it. */
export function EmptyTraitSlot({
  size = 'sm',
  className = '',
}: EmptyTraitSlotProps): React.ReactElement<any> {
  return (
    <span
      className={`inline-flex items-center rounded-arcade border border-dashed border-beige/30 text-beige/40 font-mono whitespace-nowrap ${
        size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
      } ${className}`}
      title="Empty trait slot — breed to fill it"
      aria-label="Empty trait slot"
      data-testid="trait-slot-empty"
    >
      Empty
    </span>
  );
}

export interface TraitChipRowProps {
  /** Trait ids in slot order (already sanitized by the API mapper). */
  traits: string[] | undefined;
  /** Total slots (section 6.1); empty slots render as dashed placeholders. */
  slots?: number;
  size?: 'sm' | 'md';
  /** Pop-in emphasis for freshly rolled traits (breeding reveal). */
  emphasis?: boolean;
  className?: string;
}

/** A snake's trait slots: filled chips first, then dashed empties. */
export function TraitChipRow({
  traits,
  slots,
  size = 'sm',
  emphasis = false,
  className = '',
}: TraitChipRowProps): React.ReactElement<any> | null {
  const filled = (traits ?? []).filter((t): t is TraitId => t in TRAITS);
  const slotCount = Math.max(slots ?? filled.length, filled.length);
  if (slotCount === 0) return null;

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1 ${className}`}
      data-testid="trait-chip-row"
    >
      {filled.map((traitId) => (
        <TraitChip key={traitId} traitId={traitId} size={size} emphasis={emphasis} />
      ))}
      {Array.from({ length: slotCount - filled.length }).map((_, i) => (
        <EmptyTraitSlot key={`empty-${i}`} size={size} />
      ))}
    </span>
  );
}

export default TraitChip;

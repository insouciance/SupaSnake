'use client';

/**
 * MutationHUD - the held-mutations strip near the score chips.
 *
 * One small violet chip per held mutation (pick order), monogram + native
 * tooltip carrying name, effect, and cost. Phoenix dims once its one-time
 * save has been consumed; other economic benefits dim after a Phoenix
 * trigger (they are voided from that food onward - see mutations.ts).
 */

import { MUTATIONS, type MutationPick } from '@/shared/game/mutations';

/** Two-letter monograms - stable, readable at chip size. */
const MONOGRAMS: Record<string, string> = {
  gold_trail: 'GT',
  overgrowth: 'OG',
  wall_rush: 'WR',
  shed: 'SH',
  mirror_wager: 'MW',
  magnet_pulse: 'MP',
  time_dilation: 'TD',
  splitter: 'SP',
  phoenix: 'PX',
  compound_interest: 'CI',
};

/** Benefit-carrying mutations that a Phoenix trigger voids. */
const VOIDED_ON_PHOENIX = new Set([
  'gold_trail',
  'overgrowth',
  'mirror_wager',
  'compound_interest',
]);

interface MutationHUDProps {
  held: MutationPick[];
  phoenixTriggered: boolean;
}

export function MutationHUD({ held, phoenixTriggered }: MutationHUDProps) {
  if (held.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5" data-testid="mutation-hud">
      {held.map((pick) => {
        const def = MUTATIONS[pick.id];
        const dimmed =
          phoenixTriggered &&
          (pick.id === 'phoenix' || VOIDED_ON_PHOENIX.has(pick.id));
        return (
          <span
            key={pick.id}
            data-testid={`mutation-chip-${pick.id}`}
            title={`${def.name} — ${def.effect}. Cost: ${def.cost}${
              dimmed ? ' (spent)' : ''
            }`}
            className={`inline-flex items-center justify-center w-7 h-7 rounded-arcade border text-[11px] font-bold font-body backdrop-blur-sm transition-opacity ${
              dimmed
                ? 'border-[#a855f7]/30 bg-void/50 text-[#c4b5fd]/40 opacity-60'
                : 'border-[#a855f7]/60 bg-[#a855f7]/15 text-[#c4b5fd]'
            }`}
          >
            {MONOGRAMS[pick.id] ?? '??'}
          </span>
        );
      })}
    </div>
  );
}

export default MutationHUD;

'use client';

/**
 * MutationHUD - the held-mutations strip near the score chips.
 *
 * One small violet chip per held mutation (pick order), monogram + native
 * tooltip carrying name, effect, and cost. Phoenix dims once its one-time
 * save has been consumed; other economic benefits dim after a Phoenix
 * trigger (they are voided from that food onward - see mutations.ts).
 */

import { GENES, geneStrains, type GenePick } from '@/shared/game/genes';
import { fusePicks, SPLICES } from '@/shared/game/splices';
import { STRAINS } from '@/shared/game/strains';

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

/** Fallback monogram: first letters of the gene name's words. */
function monogram(id: string): string {
  const known = MONOGRAMS[id];
  if (known) return known;
  const name = GENES[id as keyof typeof GENES]?.name ?? '';
  const initials = name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return initials || '??';
}

/** Benefit-carrying mutations that a Phoenix trigger voids. */
const VOIDED_ON_PHOENIX = new Set([
  'gold_trail',
  'overgrowth',
  'mirror_wager',
  'compound_interest',
]);

interface MutationHUDProps {
  held: GenePick[];
  phoenixTriggered: boolean;
  /** Server-gated: render two fused parents as one braided held slot. */
  splicesEnabled?: boolean;
}

export function MutationHUD({
  held,
  phoenixTriggered,
  splicesEnabled = false,
}: MutationHUDProps) {
  if (held.length === 0) return null;

  const view = splicesEnabled
    ? fusePicks(held)
    : { loose: [...held], splices: [] };
  const slots = [
    ...view.loose.map((pick) => ({ kind: 'gene' as const, atFood: pick.atFood, pick })),
    ...view.splices.map((splice) => ({ kind: 'splice' as const, atFood: splice.atFood, splice })),
  ].sort((a, b) => a.atFood - b.atFood);

  return (
    <div className="flex items-center gap-1.5" data-testid="mutation-hud">
      {slots.map((slot) => {
        if (slot.kind === 'splice') {
          const definition = SPLICES[slot.splice.spliceId];
          const [firstParent, secondParent] = slot.splice.parents;
          const firstStrain = geneStrains(firstParent.id)[0] ?? 'FLUX';
          const secondStrain = geneStrains(secondParent.id)[0] ?? firstStrain;
          return (
            <span
              key={slot.splice.spliceId}
              data-testid={`splice-chip-${slot.splice.spliceId}`}
              data-slot-kind="splice"
              title={`${definition.name} — ${GENES[firstParent.id].name} + ${GENES[secondParent.id].name}; one held slot`}
              className="inline-flex h-7 min-w-9 animate-pop-in items-center justify-center rounded-arcade border border-cosmic/80 px-1 text-[10px] font-bold font-body text-bone-white shadow-[0_0_10px_rgba(168,85,247,0.35)]"
              style={{
                background: `repeating-linear-gradient(135deg, ${STRAINS[firstStrain].color}cc 0 4px, ${STRAINS[secondStrain].color}cc 4px 8px)`,
              }}
            >
              {definition.name
                .split(/\s+/)
                .map((word) => word[0] ?? '')
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </span>
          );
        }
        const pick = slot.pick;
        const def = GENES[pick.id];
        const dimmed =
          phoenixTriggered &&
          (pick.id === 'phoenix' || VOIDED_ON_PHOENIX.has(pick.id));
        return (
          <span
            key={pick.id}
            data-testid={`mutation-chip-${pick.id}`}
            data-slot-kind="gene"
            title={`${def.name} — ${def.effect}. Cost: ${def.cost}${
              dimmed ? ' (spent)' : ''
            }`}
            className={`inline-flex items-center justify-center w-7 h-7 rounded-arcade border text-[11px] font-bold font-body backdrop-blur-sm transition-opacity ${
              dimmed
                ? 'border-[#a855f7]/30 bg-void/50 text-[#c4b5fd]/40 opacity-60'
                : 'border-[#a855f7]/60 bg-[#a855f7]/15 text-[#c4b5fd]'
            }`}
          >
            {monogram(pick.id)}
          </span>
        );
      })}
    </div>
  );
}

export default MutationHUD;

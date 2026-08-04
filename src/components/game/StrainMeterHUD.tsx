'use client';

import { strainTierLabel } from '@/shared/game/lexicon';
import {
  STRAINS,
  STRAIN_IDS,
  type StrainId,
  type StrainPoints,
} from '@/shared/game/strains';

interface StrainMeterHUDProps {
  counts: StrainPoints;
  tiers: Partial<Record<StrainId, number>>;
  suppressed?: readonly StrainId[];
  /** Run-frozen effective Apex target for each Strain (normally 3, 4, or 5). */
  apexTargets?: Readonly<Partial<Record<StrainId, number>>>;
}

/**
 * Five-slot, low-frequency DOM HUD. It updates only on picks/surges.
 *
 * The tier names come from the Lexicon — this component used to carry its
 * own copy of the same four branches, including an invented tier-0 label
 * that existed nowhere else in the game. That label is now documented in
 * the registry (STRAIN_TIER_DORMANT) rather than local to this file.
 *
 * The meter deliberately keeps a `title`-only tooltip and gains **no**
 * popover: mid-run, one-handed, at speed, a panel that swallows the next
 * steering input is worse than no explanation at all. The full tier text
 * is reachable in the Codex instead.
 */
export function StrainMeterHUD({
  counts,
  tiers,
  suppressed = [],
  apexTargets = {},
}: StrainMeterHUDProps) {
  return (
    <div
      className="grid grid-cols-5 gap-1 rounded-arcade border border-scale-blue-light/40 bg-void/80 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md"
      data-testid="strain-meter"
      aria-label="Path meter"
    >
      {STRAIN_IDS.map((strain) => {
        const def = STRAINS[strain];
        const apexTarget = Math.max(
          1,
          Math.min(5, Math.floor(apexTargets[strain] ?? 4))
        );
        const points = Math.max(
          0,
          Math.min(apexTarget, Math.floor(counts[strain] ?? 0))
        );
        const tier = Math.max(0, Math.min(3, Math.floor(tiers[strain] ?? 0)));
        const isSuppressed = suppressed.includes(strain);
        return (
          <div
            key={strain}
            data-testid={`strain-meter-${strain}`}
            title={`${def.identity} — ${isSuppressed ? 'capped above Level I' : strainTierLabel(strain, tier)}`}
            className={`min-w-0 rounded-arcade border px-1.5 py-1 ${
              isSuppressed ? 'border-dashed opacity-70' : ''
            }`}
            style={{
              borderColor: `${def.color}66`,
              backgroundColor: `${def.color}12`,
            }}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-[8px] font-mono font-bold uppercase sm:text-[9px]" style={{ color: def.color }}>
                {def.name}
              </span>
              {isSuppressed && <span className="text-[8px] text-strike-red">CAP</span>}
            </div>
            <div
              className="mt-1 flex gap-px sm:gap-0.5"
              aria-label={`${points} of ${apexTarget} Path points`}
            >
              {Array.from({ length: apexTarget }, (_, index) => index + 1).map((pip) => (
                <span
                  key={pip}
                  className="h-1.5 min-w-0 flex-1 rounded-full border sm:w-2.5 sm:flex-none"
                  style={{
                    borderColor: `${def.color}88`,
                    backgroundColor: pip <= points ? def.color : 'transparent',
                    opacity: pip <= points ? 1 : 0.3,
                  }}
                />
              ))}
            </div>
            <p className="mt-1 truncate text-[8px] font-body text-beige/60">
              {strainTierLabel(strain, tier)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default StrainMeterHUD;

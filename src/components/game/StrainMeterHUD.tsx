'use client';

import {
  STRAINS,
  STRAIN_IDS,
  STRAIN_TIER_NAMES,
  type StrainId,
  type StrainPoints,
} from '@/shared/game/strains';

interface StrainMeterHUDProps {
  counts: StrainPoints;
  tiers: Partial<Record<StrainId, number>>;
  suppressed?: readonly StrainId[];
}

function activeTierName(strain: StrainId, tier: number): string {
  if (tier >= 3) return STRAIN_TIER_NAMES[strain].apex;
  if (tier >= 2) return STRAIN_TIER_NAMES[strain].expression;
  if (tier >= 1) return STRAIN_TIER_NAMES[strain].minor;
  return 'Dormant';
}

/** Five-slot, low-frequency DOM HUD. It updates only on picks/surges. */
export function StrainMeterHUD({
  counts,
  tiers,
  suppressed = [],
}: StrainMeterHUDProps) {
  return (
    <div
      className="grid grid-cols-5 gap-1 rounded-arcade border border-scale-blue-light/40 bg-void/80 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md"
      data-testid="strain-meter"
      aria-label="Genome strain meter"
    >
      {STRAIN_IDS.map((strain) => {
        const def = STRAINS[strain];
        const points = Math.max(0, Math.min(4, Math.floor(counts[strain] ?? 0)));
        const tier = Math.max(0, Math.min(3, Math.floor(tiers[strain] ?? 0)));
        const isSuppressed = suppressed.includes(strain);
        return (
          <div
            key={strain}
            data-testid={`strain-meter-${strain}`}
            title={`${def.identity} — ${isSuppressed ? 'suppressed above Minor' : activeTierName(strain, tier)}`}
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
            <div className="mt-1 flex gap-px sm:gap-0.5" aria-label={`${points} strain points`}>
              {[1, 2, 3, 4].map((pip) => (
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
              {activeTierName(strain, tier)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default StrainMeterHUD;

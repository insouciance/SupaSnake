export interface AscendanceProgressionModel {
  generation: number;
  curveVersion: 1 | 2;
  currentMultiplier: string;
  nextGeneration: number;
  nextMultiplier: string;
  relativeStepPercent: string;
  nextMilestoneGeneration: number;
  milestoneMultiplier: string;
  generationsUntilMilestone: number;
}

interface AscendanceProjectionInput {
  generation: number;
  curveVersion: 1 | 2;
  multiplierForGeneration: (generation: number) => number;
  formatMultiplier: (multiplier: number) => string;
  evolutionInterval?: number;
}

/**
 * Presentation-only adapter. The caller injects the authoritative curve
 * resolver; this module does not own or duplicate economy arithmetic.
 */
export function projectAscendanceProgression({
  generation,
  curveVersion,
  multiplierForGeneration,
  formatMultiplier,
  evolutionInterval = 5,
}: AscendanceProjectionInput): AscendanceProgressionModel {
  const safeGeneration = Math.max(1, Math.floor(generation));
  const current = multiplierForGeneration(safeGeneration);
  const nextGeneration = safeGeneration + 1;
  const next = multiplierForGeneration(nextGeneration);
  const nextMilestoneGeneration = Math.ceil(nextGeneration / evolutionInterval) * evolutionInterval;
  const milestone = multiplierForGeneration(nextMilestoneGeneration);
  const relative = current > 0 ? ((next / current) - 1) * 100 : 0;
  return {
    generation: safeGeneration,
    curveVersion,
    currentMultiplier: formatMultiplier(current),
    nextGeneration,
    nextMultiplier: formatMultiplier(next),
    relativeStepPercent: relative.toFixed(2),
    nextMilestoneGeneration,
    milestoneMultiplier: formatMultiplier(milestone),
    generationsUntilMilestone: nextMilestoneGeneration - safeGeneration,
  };
}

export function AscendanceProgressionInstrument({
  model,
  compact = false,
}: {
  model: AscendanceProgressionModel;
  compact?: boolean;
}) {
  const progress = Math.max(0, Math.min(5, 5 - model.generationsUntilMilestone));
  const v2 = model.curveVersion === 2;
  return (
    <section
      className={`rounded-[16px] border border-venom-orange/30 bg-gradient-to-br from-venom-orange/8 via-void-deep/55 to-cosmic/8 ${compact ? 'p-3' : 'p-4'}`}
      data-testid="ascendance-progression"
      data-curve-version={model.curveVersion}
      aria-label={`Ascendance generation ${model.generation}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-body text-[9px] font-bold uppercase tracking-[0.16em] text-venom-orange">Ascendance</p>
          <p className={`${compact ? 'text-xl' : 'text-2xl'} font-display text-bone-white`}>
            Gen {model.generation} · Yield ×{model.currentMultiplier}
          </p>
        </div>
        {!v2 ? (
          <span className="rounded-full border border-scale-blue-light/25 px-2 py-1 font-body text-[9px] font-bold uppercase tracking-[0.1em] text-beige/50">
            Legacy run
          </span>
        ) : null}
      </div>

      {v2 && model.generation < 4 ? (
        <p className="mt-3 rounded-[10px] border border-cosmic/25 bg-cosmic/5 p-2.5 font-body text-[10px] leading-snug text-beige/65" data-testid="ascendance-begins">
          Ascendance begins at Gen4. Gen1–3 establish this snake&apos;s traits and lineage before permanent Yield growth starts.
        </p>
      ) : null}

      {v2 ? (
        <div className="mt-3 grid grid-cols-2 gap-2" data-testid="ascendance-v2-next">
          <div className="rounded-[10px] border border-rarity-uncommon/25 bg-rarity-uncommon/5 p-2.5">
            <p className="font-body text-[9px] uppercase tracking-[0.1em] text-beige/45">Next generation</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-rarity-uncommon">
              Gen {model.nextGeneration} · ×{model.nextMultiplier}
            </p>
            <p className="mt-0.5 font-body text-[10px] text-beige/60">+{model.relativeStepPercent}% relative · every generation</p>
          </div>
          <div className="rounded-[10px] border border-cosmic/25 bg-cosmic/5 p-2.5">
            <p className="font-body text-[9px] uppercase tracking-[0.1em] text-beige/45">Next visible evolution</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-cosmic">
              Gen {model.nextMilestoneGeneration} · ×{model.milestoneMultiplier}
            </p>
            <p className="mt-0.5 font-body text-[10px] text-beige/60">{model.generationsUntilMilestone} generation{model.generationsUntilMilestone === 1 ? '' : 's'} away</p>
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-[10px] border border-scale-blue-light/20 bg-void-deep/40 p-2.5 font-body text-[10px] leading-snug text-beige/65" data-testid="ascendance-v1-legacy">
          This run retained its v1 Ascendance stamp. Its frozen multiplier settles unchanged; newly started runs use the current curve.
        </p>
      )}

      {v2 ? (
        <div className="mt-3" data-testid="ascendance-milestone-track">
          <div className="grid grid-cols-5 gap-1" aria-label={`${progress} of 5 generations toward the next visual evolution`}>
            {Array.from({ length: 5 }, (_, index) => (
              <span
                key={index}
                className={`h-1.5 rounded-full ${index < progress ? 'bg-venom-orange' : 'bg-scale-blue-light/20'}`}
              />
            ))}
          </div>
          <p className="mt-2 font-body text-[10px] leading-snug text-beige/50">
            The Yield curve has no design cap. Breeding cost rises independently; every fifth generation adds visible evolution and pedigree prestige.
          </p>
        </div>
      ) : null}
    </section>
  );
}

'use client';

import { useMemo, useState } from 'react';
import type { StrainId } from '@/shared/game/strains';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';

export interface GenomeAtlasGene {
  id: string;
  name: string;
  category: string;
  effect: string;
  cost: string;
  strains: readonly StrainId[];
  dynastyFacts?: readonly string[];
}

export interface GenomeAtlasTier {
  points: number;
  name: string;
  rule: string;
  cost: string;
  lockedReason?: string;
}

export interface GenomeAtlasStrain {
  id: StrainId;
  name: string;
  color: string;
  identity: string;
  tiers: readonly GenomeAtlasTier[];
}

export interface GenomeAtlasSplice {
  id: string;
  name: string;
  rule: string;
  cost: string;
  strains: readonly StrainId[];
  recipeKnown: boolean;
  parentIds: readonly string[];
  recipeLabel: string;
}

export interface GenomeStrategyAtlasModel {
  rulesVersion: 1 | 2;
  rosterLabel: string;
  genes: readonly GenomeAtlasGene[];
  strains: readonly GenomeAtlasStrain[];
  splices: readonly GenomeAtlasSplice[];
}

export function GenomeStrategyAtlas({ model }: { model: GenomeStrategyAtlasModel }) {
  const categories = useMemo(
    () => Array.from(new Set(model.genes.map((gene) => gene.category))),
    [model.genes]
  );
  const [category, setCategory] = useState<string>(categories[0] ?? '');
  const visibleGenes = useMemo(
    () => model.genes.filter((gene) => gene.category === category),
    [category, model.genes]
  );
  const [selectedId, setSelectedId] = useState<string>(model.genes[0]?.id ?? '');
  const selected = model.genes.find((gene) => gene.id === selectedId) ?? visibleGenes[0] ?? model.genes[0];
  const selectedStrains = selected
    ? model.strains.filter((strain) => selected.strains.includes(strain.id))
    : [];
  const splicePaths = selected
    ? model.splices.filter((splice) => splice.parentIds.includes(selected.id))
    : [];

  if (!selected) return null;

  return (
    <section
      className="panel-elevated overflow-hidden p-4 sm:p-5"
      data-testid="genome-strategy-atlas"
      data-rules-version={model.rulesVersion}
      aria-labelledby="genome-atlas-title"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-scale-blue-light/20 pb-4">
        <div>
          <p className="font-body text-[10px] font-bold uppercase tracking-[0.18em] text-cosmic">Strategy atlas</p>
          <h2 id="genome-atlas-title" className="heading-display text-2xl text-bone-white">Read the Loom before it opens</h2>
          <p className="mt-1 max-w-2xl font-body text-sm text-beige/65">
            A gene changes more than one number. Trace its rule into Strain thresholds, possible Splices, body pressure, and the next BANK or crash decision.
          </p>
        </div>
        <span className="rounded-full border border-cosmic/35 px-3 py-1 font-body text-[10px] font-bold uppercase tracking-[0.12em] text-cosmic">
          {model.rosterLabel}
        </span>
      </header>

      <ol className="my-4 grid grid-cols-4 gap-1 text-center font-body text-[9px] font-bold uppercase tracking-[0.08em] text-beige/55 sm:text-xs" aria-label="Genome consequence chain">
        {['Offer', 'Strain', 'Splice', 'BANK / crash'].map((step, index) => (
          <li key={step} className="relative rounded-[9px] border border-scale-blue-light/20 bg-void-deep/35 px-1 py-2">
            {step}{index < 3 ? <span className="absolute -right-1.5 top-1/2 z-10 -translate-y-1/2 text-cosmic" aria-hidden="true">›</span> : null}
          </li>
        ))}
      </ol>

      <div className="grid gap-4 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.7fr)]">
        <div className="min-w-0">
          <div className="flex gap-1 overflow-x-auto pb-2 [scrollbar-width:thin]" role="tablist" aria-label="Gene categories" data-testid="atlas-categories">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={category === item}
                onClick={() => {
                  setCategory(item);
                  const first = model.genes.find((gene) => gene.category === item);
                  if (first) setSelectedId(first.id);
                }}
                className={`min-h-11 shrink-0 rounded-[10px] border px-3 py-2 font-body text-[10px] font-bold uppercase tracking-[0.08em] ${
                  category === item
                    ? 'border-cosmic bg-cosmic/10 text-bone-white'
                    : 'border-scale-blue-light/20 bg-void/35 text-beige/55'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2" role="listbox" aria-label={`${category} genes`}>
            {visibleGenes.map((gene) => (
              <button
                key={gene.id}
                type="button"
                role="option"
                aria-selected={selected.id === gene.id}
                onClick={() => setSelectedId(gene.id)}
                className={`min-h-11 min-w-0 rounded-[10px] border px-2.5 py-2 text-left ${
                  selected.id === gene.id
                    ? 'border-venom-orange/70 bg-venom-orange/8'
                    : 'border-scale-blue-light/20 bg-void-deep/30 hover:border-scale-blue-light/50'
                }`}
                data-testid={`atlas-gene-${gene.id}`}
              >
                <span className="block truncate font-body text-xs font-bold text-bone-white" title={gene.name}>{gene.name}</span>
                <span className="mt-1 block truncate font-body text-[9px] uppercase tracking-[0.08em] text-beige/45">
                  {gene.strains.join(' + ')}
                </span>
              </button>
            ))}
          </div>
        </div>

        <article className="min-w-0 rounded-[14px] border border-cosmic/30 bg-void-deep/35 p-3 sm:p-4" data-testid="atlas-consequence">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-body text-[10px] font-bold uppercase tracking-[0.14em] text-cosmic">{selected.category}</p>
              <h3 className="heading-display text-xl text-bone-white">{selected.name}</h3>
            </div>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-beige/55" aria-label={`Strains: ${selected.strains.join(', ')}`}>
              {selected.strains.map((strain) => (
                <span key={strain} className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-scale-blue-light/25 p-1" style={{ color: model.strains.find((entry) => entry.id === strain)?.color }} title={model.strains.find((entry) => entry.id === strain)?.name}>
                  <StrainGlyph id={strain} />
                </span>
              ))}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-[10px] border border-rarity-uncommon/25 bg-rarity-uncommon/5 p-3">
              <p className="font-body text-[9px] font-bold uppercase tracking-[0.12em] text-rarity-uncommon">Rule</p>
              <p className="mt-1 font-body text-xs leading-snug text-beige/75">{selected.effect}</p>
            </div>
            <div className="rounded-[10px] border border-strike-red/25 bg-strike-red/5 p-3">
              <p className="font-body text-[9px] font-bold uppercase tracking-[0.12em] text-strike-red">Cost / commitment</p>
              <p className="mt-1 font-body text-xs leading-snug text-beige/75">{selected.cost}</p>
            </div>
          </div>

          <section className="mt-4" aria-label="Strain ladders for selected gene">
            <h4 className="font-display text-xs uppercase tracking-[0.12em] text-bone-white">Second-order · Strain ladders</h4>
            <div className="mt-2 space-y-2">
              {selectedStrains.map((strain) => (
                <div key={strain.id} className="rounded-[10px] border p-2.5" style={{ borderColor: `${strain.color}55` }} data-testid={`atlas-strain-${strain.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 font-display text-xs" style={{ color: strain.color }}>
                      <span className="inline-block h-4 w-4" aria-hidden="true"><StrainGlyph id={strain.id} /></span>
                      {strain.name}
                    </p>
                    <p className="font-body text-[9px] text-beige/45">This gene contributes +1</p>
                  </div>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                    {strain.tiers.map((tier) => (
                      <div key={tier.points} className="rounded-[8px] bg-void/35 p-2" data-testid={`atlas-tier-${strain.id}-${tier.points}`}>
                        <p className="font-display text-[10px] text-bone-white">{tier.points} · {tier.name}</p>
                        <p className="mt-1 font-body text-[9px] leading-snug text-beige/60">{tier.rule}</p>
                        {tier.cost ? <p className="mt-1 font-body text-[9px] leading-snug text-strike-red/65">{tier.cost}</p> : null}
                        {tier.lockedReason ? <p className="mt-1 font-body text-[9px] leading-snug text-venom-orange">Locked · {tier.lockedReason}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4" aria-label="Splice paths for selected gene">
            <h4 className="font-display text-xs uppercase tracking-[0.12em] text-bone-white">Third-order · Splice paths</h4>
            {splicePaths.length > 0 ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {splicePaths.map((splice) => (
                  <div key={splice.id} className="rounded-[9px] border border-cosmic/25 bg-cosmic/5 p-2.5" data-testid={`atlas-splice-${splice.id}`}>
                    <p className="font-display text-xs text-cosmic">{splice.name}</p>
                    <p className="mt-1 font-body text-[10px] leading-snug text-beige/70">{splice.rule}</p>
                    <p className="mt-1 font-body text-[9px] leading-snug text-strike-red/65">{splice.cost}</p>
                    <p className="mt-1 font-body text-[9px] text-beige/45">{splice.recipeLabel}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 font-body text-[10px] text-beige/45">This gene has no direct Splice recipe in the current ruleset.</p>
            )}
          </section>

          {selected.dynastyFacts && selected.dynastyFacts.length > 0 ? (
            <section className="mt-4 rounded-[9px] border border-venom-orange/25 bg-venom-orange/5 p-2.5">
              <h4 className="font-display text-[10px] uppercase tracking-[0.12em] text-venom-orange">Dynasty interaction</h4>
              <ul className="mt-1 space-y-1 font-body text-[10px] leading-snug text-beige/65">
                {selected.dynastyFacts.map((fact) => <li key={fact}>• {fact}</li>)}
              </ul>
            </section>
          ) : null}
        </article>
      </div>

      <section className="mt-5" aria-labelledby="atlas-all-ladders-title" data-testid="atlas-all-ladders">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="atlas-all-ladders-title" className="font-display text-sm uppercase tracking-[0.12em] text-bone-white">All Strain ladders</h3>
          <p className="font-body text-[10px] text-beige/45">Every 2 / 3 / 4 threshold stays visible before it activates.</p>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {model.strains.map((strain) => (
            <article key={strain.id} className="rounded-[10px] border bg-void-deep/30 p-2.5" style={{ borderColor: `${strain.color}45` }}>
              <p className="flex items-center gap-1.5 font-display text-xs" style={{ color: strain.color }}>
                <span className="inline-block h-4 w-4" aria-hidden="true"><StrainGlyph id={strain.id} /></span>
                {strain.name}
              </p>
              <p className="mt-0.5 font-body text-[9px] leading-snug text-beige/45">{strain.identity}</p>
              <ol className="mt-2 space-y-1.5">
                {strain.tiers.map((tier) => (
                  <li key={tier.points} className="rounded-[7px] bg-void/35 px-2 py-1.5" data-testid={`atlas-all-tier-${strain.id}-${tier.points}`}>
                    <p className="font-display text-[10px] text-bone-white">{tier.points} · {tier.name}</p>
                    <p className="mt-0.5 font-body text-[9px] leading-snug text-beige/55">{tier.rule}</p>
                    {tier.lockedReason ? <p className="mt-0.5 font-body text-[9px] text-venom-orange">Locked · {tier.lockedReason}</p> : null}
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <details className="mt-4 rounded-[12px] border border-scale-blue-light/20 bg-void-deep/25 px-3 py-2" data-testid="atlas-splice-archive">
        <summary className="cursor-pointer font-display text-xs text-beige/70">All Splice rules ({model.splices.length})</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {model.splices.map((splice) => (
            <article key={splice.id} className="rounded-[9px] border border-scale-blue-light/20 p-2.5">
              <p className="font-display text-xs text-bone-white">{splice.name}</p>
              <p className="mt-1 font-body text-[10px] leading-snug text-beige/65">{splice.rule}</p>
              <p className="mt-1 font-body text-[9px] leading-snug text-strike-red/60">{splice.cost}</p>
              <p className="mt-1 font-body text-[9px] text-cosmic/65">{splice.recipeLabel}</p>
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}

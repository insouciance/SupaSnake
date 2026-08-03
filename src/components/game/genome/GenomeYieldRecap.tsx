import type { StrainId } from '@/shared/game/strains';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';

export interface GenomeYieldRecapRow {
  id: string;
  label: string;
  amount: number;
  /** Exact server/core-formatted fixed-point value when integer fallback loses detail. */
  amountLabel?: string;
  detail: string;
  tone: 'gain' | 'forfeit' | 'neutral';
}
export interface GenomeYieldRecapModel {
  rulesVersion: 1 | 2;
  baseYield: number;
  genomeYield: number;
  genomeDelta: number;
  baseYieldLabel?: string;
  genomeYieldLabel?: string;
  genomeDeltaLabel?: string;
  factorLabel: string;
  activeGenes: readonly { id: string; name: string; strains: readonly StrainId[] }[];
  activeSplices: readonly { id: string; name: string }[];
  rows: readonly GenomeYieldRecapRow[];
  executionSummary: string;
  bankCrashSummary: string;
}

/** Exact, server-projected Genome portion of the Results receipt. */
export function GenomeYieldRecap({ model }: { model: GenomeYieldRecapModel }) {
  const geneCount = model.activeGenes.length;
  const spliceCount = model.activeSplices.length;

  return (
    <section
      className="mx-auto max-w-lg rounded-[16px] border border-cosmic/35 bg-gradient-to-br from-cosmic/8 via-void-deep/50 to-venom-orange/6 p-3 text-left sm:p-4"
      data-testid="results-genome-recap"
      data-rules-version={model.rulesVersion}
      aria-label="Genome Yield contribution"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-cosmic">Genome Yield</p>
          <p className="mt-0.5 font-display text-base leading-tight text-bone-white sm:text-lg">
            {model.baseYieldLabel ?? model.baseYield.toLocaleString()} → {model.genomeYieldLabel ?? `${model.genomeYield.toLocaleString()} Yield`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-base font-bold text-venom-orange sm:text-lg">{model.factorLabel}</p>
          <p className={`font-mono text-xs font-bold ${model.genomeDelta >= 0 ? 'text-rarity-uncommon' : 'text-strike-red'}`}>
            {model.genomeDeltaLabel ?? `${model.genomeDelta >= 0 ? '+' : ''}${model.genomeDelta.toLocaleString()}`}
          </p>
        </div>
      </div>

      <p className="mt-2 font-body text-sm leading-snug text-beige/75" data-testid="results-genome-execution">
        {model.executionSummary}
      </p>

      <details
        className="group mt-2 border-t border-scale-blue-light/20 pt-1"
        data-testid="results-genome-details"
      >
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 rounded-[10px] px-1 font-body text-xs font-semibold text-beige/70 transition-colors hover:text-bone-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cosmic [&::-webkit-details-marker]:hidden">
          <span>Full Genome receipt</span>
          <span className="shrink-0 font-mono text-xs text-cosmic" data-testid="results-genome-receipt-counts">
            {geneCount} {geneCount === 1 ? 'gene' : 'genes'} · {spliceCount} {spliceCount === 1 ? 'Splice' : 'Splices'}
          </span>
        </summary>

        <div className="space-y-3 pb-1 pt-2" data-testid="results-genome-details-content">
          {model.activeGenes.length > 0 ? (
            <div>
              <p className="font-body text-xs font-bold uppercase tracking-[0.1em] text-beige/50">Active Genome</p>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5" aria-label="Active run Genome">
                {model.activeGenes.map((gene) => (
                  <span key={gene.id} className="flex min-h-8 min-w-0 items-center gap-1.5 rounded-[9px] border border-scale-blue-light/25 bg-void/35 px-2 py-1 font-body text-xs text-bone-white">
                    <span className="flex shrink-0 items-center gap-0.5">
                      {gene.strains.map((strain) => (
                        <span key={strain} className="inline-block h-3.5 w-3.5 text-cosmic" aria-hidden="true"><StrainGlyph id={strain} /></span>
                      ))}
                    </span>
                    <span className="min-w-0 leading-tight">{gene.name}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {model.activeSplices.length > 0 ? (
            <p className="font-body text-xs leading-snug text-cosmic">
              <span className="font-bold uppercase tracking-[0.08em]">Splices</span> · {model.activeSplices.map((splice) => splice.name).join(' · ')}
            </p>
          ) : null}

          {model.rows.length > 0 ? (
            <dl className="space-y-2 border-t border-scale-blue-light/20 pt-2">
              {model.rows.map((row) => (
                <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3" data-testid={`results-genome-row-${row.id}`}>
                  <dt className="font-body text-xs text-beige/70">{row.label}</dt>
                  <dd className={`font-mono text-xs font-bold ${row.tone === 'gain' ? 'text-rarity-uncommon' : row.tone === 'forfeit' ? 'text-strike-red' : 'text-bone-white'}`}>
                    {row.amountLabel ?? `${row.amount > 0 ? '+' : ''}${row.amount.toLocaleString()}`}
                  </dd>
                  <dd className="col-span-2 font-body text-xs leading-snug text-beige/50">{row.detail}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <p className="rounded-[9px] border border-scale-blue-light/20 bg-void-deep/25 px-2.5 py-2 font-body text-xs leading-snug text-beige/60" data-testid="results-genome-outcome-rule">
            {model.bankCrashSummary}
          </p>
        </div>
      </details>
    </section>
  );
}

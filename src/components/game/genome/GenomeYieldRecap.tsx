import type { StrainId } from '@/shared/game/strains';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';

export interface GenomeYieldRecapRow {
  id: string;
  label: string;
  amount: number;
  detail: string;
  tone: 'gain' | 'forfeit' | 'neutral';
}
export interface GenomeYieldRecapModel {
  rulesVersion: 1 | 2;
  baseYield: number;
  genomeYield: number;
  genomeDelta: number;
  factorLabel: string;
  activeGenes: readonly { id: string; name: string; strains: readonly StrainId[] }[];
  activeSplices: readonly { id: string; name: string }[];
  rows: readonly GenomeYieldRecapRow[];
  executionSummary: string;
  bankCrashSummary: string;
}

/** Exact, server-projected Genome portion of the Results receipt. */
export function GenomeYieldRecap({ model }: { model: GenomeYieldRecapModel }) {
  return (
    <section
      className="mx-auto max-w-lg rounded-[16px] border border-cosmic/35 bg-gradient-to-br from-cosmic/8 via-void-deep/50 to-venom-orange/6 p-4 text-left"
      data-testid="results-genome-recap"
      data-rules-version={model.rulesVersion}
      aria-label="Genome Yield contribution"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-body text-[9px] font-bold uppercase tracking-[0.16em] text-cosmic">Genome outcome</p>
          <p className="mt-0.5 font-display text-lg text-bone-white">
            {model.baseYield.toLocaleString()} → {model.genomeYield.toLocaleString()} Yield
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-bold text-venom-orange">{model.factorLabel}</p>
          <p className={`font-mono text-xs font-bold ${model.genomeDelta >= 0 ? 'text-rarity-uncommon' : 'text-strike-red'}`}>
            {model.genomeDelta >= 0 ? '+' : ''}{model.genomeDelta.toLocaleString()}
          </p>
        </div>
      </div>

      <p className="mt-2 font-body text-xs leading-snug text-beige/70" data-testid="results-genome-execution">
        {model.executionSummary}
      </p>

      {model.activeGenes.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Active run Genome">
          {model.activeGenes.map((gene) => (
            <span key={gene.id} className="inline-flex min-h-7 items-center gap-1 rounded-full border border-scale-blue-light/25 bg-void/40 px-2 py-1 font-body text-[10px] text-bone-white">
              {gene.strains.map((strain) => (
                <span key={strain} className="inline-block h-3.5 w-3.5 text-cosmic" aria-hidden="true"><StrainGlyph id={strain} /></span>
              ))}
              {gene.name}
            </span>
          ))}
        </div>
      ) : null}

      {model.activeSplices.length > 0 ? (
        <p className="mt-2 font-body text-[10px] text-cosmic">
          Splices · {model.activeSplices.map((splice) => splice.name).join(' · ')}
        </p>
      ) : null}

      {model.rows.length > 0 ? (
        <dl className="mt-3 space-y-1.5 border-t border-scale-blue-light/20 pt-3">
          {model.rows.map((row) => (
            <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3" data-testid={`results-genome-row-${row.id}`}>
              <dt className="font-body text-[11px] text-beige/65">{row.label}</dt>
              <dd className={`font-mono text-[11px] font-bold ${row.tone === 'gain' ? 'text-rarity-uncommon' : row.tone === 'forfeit' ? 'text-strike-red' : 'text-bone-white'}`}>
                {row.amount > 0 ? '+' : ''}{row.amount.toLocaleString()}
              </dd>
              <dd className="col-span-2 font-body text-[9px] leading-snug text-beige/45">{row.detail}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="mt-3 rounded-[9px] border border-scale-blue-light/20 bg-void-deep/35 px-2.5 py-2 font-body text-[10px] leading-snug text-beige/55" data-testid="results-genome-outcome-rule">
        {model.bankCrashSummary}
      </p>
    </section>
  );
}

'use client';

import { useState } from 'react';
import { StrainChip } from '@/components/traits/StrainChip';
import {
  genomeCardCascadeRows,
  shareGenomeCard,
  type GenomeCardModel,
} from '@/lib/share/genomeCardImage';
import { STRAINS } from '@/shared/game/strains';

export function GenomeCard({ model }: { model: GenomeCardModel }) {
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const rows = genomeCardCascadeRows(model);

  const exportCard = async () => {
    if (exporting) return;
    setExporting(true);
    setExported(null);
    try {
      const result = await shareGenomeCard(model);
      setExported(result === 'shared' ? 'Shared' : 'PNG downloaded');
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') setExported('Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="panel-glow [--glow:#a855f7] p-4 text-left space-y-3" data-testid="genome-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-arcade text-cosmic">Genome Card</p>
          <p className="heading-display text-xl text-bone-white">{model.snakeName}</p>
          <p className="text-xs font-body text-beige/60">{model.dynasty} · Gen {model.generation} · {model.foods} foods</p>
        </div>
        {model.allIn && (
          <span className="-rotate-3 rounded-arcade border-2 border-strike-red px-2 py-1 text-xs font-black tracking-widest text-strike-red" data-testid="genome-all-in">ALL IN</span>
        )}
      </div>

      <div className="flex h-5 overflow-hidden rounded-full border border-scale-blue-light/50" data-testid="genome-body-strip">
        {(model.genes.length > 0 ? model.genes : [{ id: 'empty', name: 'Unwritten', strains: ['FLUX'] as const }]).map((gene) => {
          const first = STRAINS[gene.strains[0] ?? 'FLUX'].color;
          const second = STRAINS[gene.strains[1] ?? gene.strains[0] ?? 'FLUX'].color;
          return (
            <span
              key={gene.id}
              className="min-w-5 flex-1"
              style={{
                background: gene.strains.length > 1
                  ? `linear-gradient(135deg, ${first} 0 45%, ${second} 55% 100%)`
                  : first,
              }}
            />
          );
        })}
      </div>

      {model.genes.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="genome-card-genes">
          {model.genes.map((gene) => (
            <span key={gene.id} className="inline-flex items-center gap-1 rounded-arcade border border-scale-blue-light/40 bg-void/50 px-2 py-1 text-xs font-body text-bone-white">
              {gene.name}
              {gene.strains.map((strain) => <StrainChip key={strain} strain={strain} />)}
            </span>
          ))}
        </div>
      )}

      {(model.splices.length > 0 || model.milestones.length > 0) && (
        <div className="space-y-1 text-xs font-body">
          {model.splices.map((splice) => <p key={splice.id} className="text-cosmic">Splice · {splice.name}</p>)}
          {model.milestones.map((item) => <p key={`${item.strain}-${item.tier}`} className="text-[#7df9ff]">{item.tier} · {item.name}</p>)}
        </div>
      )}

      <ol className="space-y-1 border-t border-scale-blue-light/30 pt-3" data-testid="genome-cascade">
        {rows.map((row, index) => (
          <li key={row.label} className={`flex items-center justify-between text-xs font-body ${index === rows.length - 1 ? 'text-venom-orange font-bold text-base' : 'text-beige/70'}`} style={{ animationDelay: `${index * 90}ms` }}>
            <span>{row.label}{row.factor !== null ? ` ×${row.factor.toFixed(2)}` : ''}</span>
            <span>{row.value.toLocaleString()} DNA</span>
          </li>
        ))}
      </ol>

      <button type="button" onClick={exportCard} disabled={exporting} data-testid="genome-card-export" className="btn-neutral w-full min-h-[44px] px-4 py-2">
        {exporting ? 'Drawing PNG…' : 'Share / Download Genome Card'}
      </button>
      {exported && <p className="text-center text-xs font-body text-beige/60" role="status">{exported}</p>}
    </section>
  );
}

export default GenomeCard;

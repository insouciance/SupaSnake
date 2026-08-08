'use client';

import type { GenomeCardModel } from '@/lib/share/genomeCardImage';
import { STRAINS } from '@/shared/game/strains';

/**
 * THE BARCODE — the run as a possession, and the only part of the old Genome
 * Card that survives on Results (2026-08-05 triage: "barcode stays").
 *
 * WHAT LEFT AND WHY. The Genome Card was a second receipt standing beside the
 * real one: it repeated the gene list and the yield cascade that
 * `GenomeYieldRecap` already states exactly, and it ended in a
 * "Share / Download Genome Card" button whose canvas draws in an art direction
 * the product does not otherwise have (audit B7 — two fonts the app never
 * loads, a palette it does not own). The download is cut here by ruling; the
 * duplicated receipt goes with it as redundancy.
 *
 * What is left is the one thing that was never duplicated anywhere: the strip
 * itself. It is this run's genome as a drawn object — one band per gene, in
 * that gene's strain colours, in acquisition order. It is not a chart and it
 * is not read for values; it is a fingerprint, and two runs that played
 * differently look different at a glance.
 *
 * DRAWN, NOT LIT. Ink contour on the silhouette, hard displaced block, chip
 * radius. The bands are flat authored fills that meet edge to edge — a FIELD
 * separated by nothing at all, because a barcode's bands are supposed to
 * touch. The old strip used a per-gene gradient; the audit calls that out as
 * "a gradient where the direction wants authored steps", so a two-strain gene
 * is now a hard split rather than a blend.
 */
export function GenomeBarcode({ model }: { model: GenomeCardModel }) {
  const genes = model.genes.length > 0 ? model.genes : null;

  return (
    <div
      className="flex min-w-0 items-center gap-3 rounded-[var(--radius-card)] border-[length:var(--ink-w-2)] border-ink bg-[color:var(--fill-deck-2)] px-3 py-2.5 text-left shadow-[var(--ink-drop-void-2)]"
      data-testid="genome-barcode"
    >
      <div className="min-w-0 flex-1">
        <p className="heading-display truncate text-sm text-bone-white">
          {model.snakeName}
        </p>
        <p className="truncate font-body text-[11px] text-beige/65">
          {model.dynasty} · Gen {model.generation} · {model.foods} foods
        </p>

        <div
          className="mt-1.5 flex h-4 overflow-hidden rounded-[var(--radius-chip)] border-[length:var(--ink-w-1)] border-ink"
          data-testid="genome-body-strip"
          role="img"
          aria-label={
            genes
              ? `This run's genome: ${genes.map((gene) => gene.name).join(', ')}`
              : "This run's genome: unwritten"
          }
        >
          {(genes ?? [{ id: 'empty', name: 'Unwritten', strains: ['FLUX'] as const }]).map(
            (gene) => {
              const first = STRAINS[gene.strains[0] ?? 'FLUX'].color;
              const second =
                STRAINS[gene.strains[1] ?? gene.strains[0] ?? 'FLUX'].color;
              return (
                <span
                  key={gene.id}
                  className="min-w-4 flex-1"
                  style={{
                    background:
                      gene.strains.length > 1
                        ? `linear-gradient(135deg, ${first} 0 50%, ${second} 50% 100%)`
                        : first,
                  }}
                />
              );
            }
          )}
        </div>
      </div>

      {model.allIn && (
        <span
          className="shrink-0 -rotate-3 rounded-[var(--radius-chip)] border-[length:var(--ink-w-2)] border-ink bg-strike-red px-2 py-1 font-display text-[10px] tracking-widest text-bone-white shadow-[var(--ink-drop-1)]"
          data-testid="genome-all-in"
        >
          ALL IN
        </span>
      )}
    </div>
  );
}

export default GenomeBarcode;

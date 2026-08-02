'use client';

import type { CodexLegacyArchive } from '@/app/api/codex/utils';
import { StrainChip } from '@/components/traits/StrainChip';
import { GENES, isGeneId } from '@/shared/game/genes';

function legacyGeneName(id: string): string {
  return isGeneId(id) ? GENES[id].name : id;
}

/**
 * Versioned history is deliberately collapsed beneath the active catalog.
 * It preserves the meaning of earned v1 discoveries without presenting
 * retired mechanics as candidates for the live Tactical Loom.
 */
export function LegacyGenomeArchive({ archive }: { archive: CodexLegacyArchive }) {
  return (
    <details
      className="group overflow-hidden rounded-arcade border border-cosmic/25 bg-void-deep/45"
      data-testid="codex-legacy-archive"
    >
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 marker:hidden sm:px-5">
        <span className="flex min-w-0 items-center gap-3">
          <i className="grid h-9 w-9 flex-none place-items-center rounded-full border border-cosmic/40 font-mono text-xs not-italic text-cosmic">
            v1
          </i>
          <span className="min-w-0">
            <strong className="block font-display text-bone-white">Earlier Genome archive</strong>
            <small className="block font-body text-xs text-beige/55">
              {archive.recorded} preserved record{archive.recorded === 1 ? '' : 's'} · read-only
            </small>
          </span>
        </span>
        <span className="flex-none font-display text-xs text-cosmic group-open:hidden">Open history</span>
        <span className="hidden flex-none font-display text-xs text-cosmic group-open:inline">Close history</span>
      </summary>

      <div className="space-y-6 border-t border-cosmic/15 px-4 py-5 sm:px-5">
        <p className="max-w-3xl font-body text-sm text-beige/65">
          These records were earned under Genome v1. Their original rules stay
          readable here, but they never enter the active Loom or rewrite a v2 run.
        </p>

        {archive.genes.length > 0 ? (
          <section aria-label="Earlier Genome genes">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="font-display text-sm text-bone-white">Recorded genes</h4>
              <span className="font-mono text-[11px] text-beige/45">
                {archive.sampleSize} v1 run{archive.sampleSize === 1 ? '' : 's'} in the bounded history
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {archive.genes.map((gene) => (
                <article
                  key={gene.id}
                  className="rounded-arcade border border-scale-blue-light/20 bg-void-deep/55 p-4"
                  data-testid={`codex-legacy-gene-${gene.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h5 className="font-display text-sm text-bone-white">{gene.name}</h5>
                    <div className="flex gap-1">
                      {gene.strains.map((strain) => <StrainChip key={strain} strain={strain} />)}
                    </div>
                  </div>
                  <p className="mt-3 font-body text-sm text-beige/70">{gene.effect}</p>
                  <p className="mt-2 font-body text-xs text-strike-red/70">{gene.cost}</p>
                  <p className="mt-3 font-mono text-[11px] text-beige/45">
                    {gene.discovered ? 'Archived' : 'Run record'} · {gene.picks} picks · {gene.banks} banked
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {archive.splices.length > 0 ? (
          <section aria-label="Earlier Genome Splices">
            <h4 className="mb-3 font-display text-sm text-bone-white">Recorded Splices</h4>
            <div className="grid gap-3 md:grid-cols-2">
              {archive.splices.map((splice) => (
                <article
                  key={splice.id}
                  className="rounded-arcade border border-cosmic/20 bg-void-deep/55 p-4"
                  data-testid={`codex-legacy-splice-${splice.id}`}
                >
                  <h5 className="font-display text-sm text-bone-white">{splice.name}</h5>
                  <p className="mt-3 font-body text-sm text-beige/70">{splice.effect}</p>
                  <p className="mt-2 font-body text-xs text-strike-red/70">{splice.cost}</p>
                  <p className="mt-2 font-body text-xs text-cosmic/75">
                    {splice.parents
                      ? `Recipe: ${legacyGeneName(splice.parents[0])} + ${legacyGeneName(splice.parents[1])}`
                      : 'Recipe remained undiscovered under v1'}
                  </p>
                  <p className="mt-3 font-mono text-[11px] text-beige/45">
                    {splice.discoveries} runs · {splice.banks} banked
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </details>
  );
}

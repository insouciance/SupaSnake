'use client';

/**
 * What this snake cannot reach, and what would change it (WP-2.08).
 *
 * This is where a build calculator earns its keep. "Comet Tail is not
 * formable" is a dead end; "Comet Tail wants Afterburner, which is CYBER M6"
 * is a plan. Every line is derived from the same tables `composeGenePool`
 * reads, so a retune of the mastery track cannot leave this copy behind
 * asserting an unlock that moved.
 *
 * Three splices are unformable from a base pool and they fall out of the data
 * rather than being listed by hand: Comet Tail wants Afterburner (CYBER M6),
 * Black Magnet wants Gravity Well (COSMIC M6), and Old Growth wants both Deep
 * Roots (PRIMAL M3) and a seasonal Glacial Reserve.
 */

import type { WorkbenchReachability } from '@/shared/game/workbench';

export interface ReachabilityPanelProps {
  reachability: WorkbenchReachability;
}

export function ReachabilityPanel({ reachability }: ReachabilityPanelProps) {
  const unformable = reachability.splices.filter((splice) => !splice.formable);

  return (
    <section className="panel p-5" data-testid="workbench-reachability">
      <h3 className="heading-display text-xl">Out of reach on this snake</h3>

      <div className="mt-4">
        <h4 className="font-display text-sm text-bone-white">Splices it cannot form</h4>
        {unformable.length === 0 ? (
          <p
            className="mt-2 font-body text-xs text-beige/55"
            data-testid="workbench-splices-all-formable"
          >
            Every splice in the game is formable from this snake&apos;s pool.
          </p>
        ) : (
          <ul className="mt-2 space-y-2" data-testid="workbench-splice-locks">
            {unformable.map((splice) => (
              <li
                key={splice.splice}
                className="font-body text-xs text-beige/70"
                data-testid={`workbench-splice-lock-${splice.splice}`}
              >
                <span className="font-display text-bone-white">{splice.name}</span>
                {' wants '}
                {splice.missing.map((gene, index) => (
                  <span key={gene.gene}>
                    {index > 0 && ' and '}
                    <span className="text-cyber">{gene.name}</span>
                    {' — '}
                    {gene.unlock}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5">
        <h4 className="font-display text-sm text-bone-white">
          Genes it will not be offered
        </h4>
        {reachability.genes.length === 0 ? (
          <p
            className="mt-2 font-body text-xs text-beige/55"
            data-testid="workbench-genes-all-reachable"
          >
            The whole catalogue is in this snake&apos;s pool.
          </p>
        ) : (
          <ul className="mt-2 grid gap-1 sm:grid-cols-2" data-testid="workbench-gene-locks">
            {reachability.genes.map((gene) => (
              <li
                key={gene.gene}
                className="font-body text-xs text-beige/65"
                data-testid={`workbench-gene-lock-${gene.gene}`}
              >
                <span className="text-bone-white">{gene.name}</span> — {gene.unlock}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

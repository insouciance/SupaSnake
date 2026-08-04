'use client';

/**
 * The three projections — and the two ways a calculator lies (WP-2.08).
 *
 * FIRST LIE: Yield is rawDna. It is not. `applyGenomeOutcome` stands between
 * them and the two differ by more than a third on an ordinary build, so every
 * row here shows rawDna, the banked Yield, the salvaged Yield AND both
 * multipliers. A player who sees only the last number cannot tell which of the
 * three moved when they change the plan, and a tool that cannot be reasoned
 * about is a tool that gets distrusted the first time it surprises somebody.
 *
 * SECOND LIE: one number. A single projected figure is a promise the first
 * undershooting run breaks, after which the tool is never believed again. So
 * there are three labelled bases drawn from the player's OWN history — the
 * plan's own floor, their median run and their best — each carrying the sample
 * size it came from, so a player with two runs on record can see that it is
 * two.
 *
 * And every one of them is a FLOOR, stated in those words. The bounded-trust
 * claims — Gilded Wake cells, Ouroboros bites, the Second Sun
 * trigger — are claimed by a run that plays them, not derived from a build, so
 * they are excluded and the excluded ceiling is reported separately from the
 * engine's own `genomeClaimCaps` rather than guessed at or quietly folded in.
 */

import type { WorkbenchExclusion, WorkbenchProjection } from '@/shared/game/workbench';
import { FLOOR_LABEL } from '@/shared/game/workbench';
import { formatNonNegativeAmount as num } from '@/shared/format/amount';

/** A FACTOR, not an amount: the decimal is the value and stays. */
function multiplier(value: number): string {
  return `×${value.toFixed(2)}`;
}

export interface ProjectionPanelProps {
  projections: readonly WorkbenchProjection[];
  excluded: readonly WorkbenchExclusion[];
}

export function ProjectionPanel({ projections, excluded }: ProjectionPanelProps) {
  return (
    <section className="panel p-5" data-testid="workbench-projections">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="heading-display text-xl">What the plan pays</h3>
        <p className="font-body text-xs text-beige/50">
          Yield is not raw DNA — the outcome multiplier stands between them.
        </p>
      </div>

      <p
        className="mb-4 font-body text-sm text-cosmic"
        data-testid="workbench-floor-label"
      >
        {FLOOR_LABEL}
      </p>

      <div className="grid gap-3 lg:grid-cols-3">
        {projections.map((projection) => (
          <article
            key={projection.basis}
            className="rounded-arcade border border-scale-blue-light/30 p-4"
            data-testid={`workbench-projection-${projection.basis}`}
          >
            <p className="font-display text-sm text-bone-white">{projection.label}</p>
            <p className="mt-1 font-mono text-xs text-beige/55">
              {projection.foods} foods ·{' '}
              <span data-testid={`workbench-sample-${projection.basis}`}>
                {projection.sampleSize === 0
                  ? 'derived from the plan, not from history'
                  : `from ${projection.sampleSize} ${
                      projection.sampleSize === 1 ? 'run' : 'runs'
                    }`}
              </span>
            </p>

            <dl className="mt-3 space-y-2 font-body text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-beige/70">Raw DNA</dt>
                <dd className="font-mono text-bone-white">{num(projection.rawDna)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-beige/70">
                  Banked{' '}
                  <span className="font-mono text-xs text-cyber">
                    {multiplier(projection.bankMultiplier)}
                  </span>
                </dt>
                <dd
                  className="font-mono text-venom-orange"
                  data-testid={`workbench-banked-${projection.basis}`}
                >
                  {num(projection.banked)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-beige/70">
                  Salvaged{' '}
                  <span className="font-mono text-xs text-cyber">
                    {multiplier(projection.salvageMultiplier)}
                  </span>
                </dt>
                <dd
                  className="font-mono text-beige"
                  data-testid={`workbench-salvaged-${projection.basis}`}
                >
                  {num(projection.salvaged)}
                </dd>
              </div>
            </dl>

            <p className="mt-3 font-mono text-xs text-beige/45">
              {projection.genesLanded} genes landed · {projection.infusesSpent} infuses spent
            </p>
          </article>
        ))}
      </div>

      {/* ── What the floor leaves out, named and capped ─────────────────── */}
      <div className="mt-5 border-t border-scale-blue-light/20 pt-4">
        <h4 className="font-display text-sm text-bone-white">
          Left out of every number above
        </h4>
        {excluded.length === 0 ? (
          <p
            className="mt-2 font-body text-xs text-beige/55"
            data-testid="workbench-excluded-none"
          >
            This plan claims nothing that has to be played for, so its floor and
            its ceiling are the same number.
          </p>
        ) : (
          <ul className="mt-2 space-y-2" data-testid="workbench-excluded">
            {excluded.map((entry) => (
              <li key={entry.id} className="font-body text-xs text-beige/65">
                <span className="font-display text-bone-white">{entry.name}</span>
                {' — up to '}
                <span className="font-mono text-cyber">{num(entry.ceiling)}</span>
                {' more DNA. '}
                {entry.why}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

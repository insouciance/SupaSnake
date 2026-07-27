'use client';

/**
 * Where each strain lands under this plan and this week (WP-2.08).
 *
 * Every tier here came out of `strainActivations` — the resolver that honours
 * the FTUE tier cap, the week's suppressions and its threshold shifts — and
 * never from comparing points to a threshold in this file. Four ordinary cases
 * make a hand-rolled comparison wrong (four points but only two in-run genes; a
 * tier cap of 1; a suppressed strain; a three-point pre-cap heirloom), and the
 * parity suite exists because of them.
 *
 * The useful column is the last one: what STANDS BETWEEN this strain and its
 * next tier. "Two more points" and "one more in-run gene" send a player to
 * different plans, and spawn points can never satisfy the second.
 */

import { StrainChip } from '@/components/traits/StrainChip';
import type { WorkbenchStrainReading } from '@/shared/game/workbench';
import type { StrainTier } from '@/shared/game/strains';

function blockedCopy(reading: WorkbenchStrainReading): string {
  switch (reading.blockedBy) {
    case 'points':
      return `${reading.pointsNeeded} more ${
        reading.pointsNeeded === 1 ? 'point' : 'points'
      } for the next tier.`;
    case 'genes':
      return `${reading.genesNeeded} more in-run ${
        reading.genesNeeded === 1 ? 'gene' : 'genes'
      } — spawn points cannot satisfy this one.`;
    case 'suppressed':
      return 'Suppressed this week: tier 1 is its ceiling, whatever the points say.';
    case 'tierCap':
      return 'At your account ceiling. More banked runs raise it.';
    default:
      return reading.tier >= 3 ? 'At Apex — nothing left above it.' : 'Ready for the next tier.';
  }
}

export interface StrainPanelProps {
  strains: readonly WorkbenchStrainReading[];
  tierCap: StrainTier;
}

export function StrainPanel({ strains, tierCap }: StrainPanelProps) {
  return (
    <section className="panel p-5" data-testid="workbench-strains">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="heading-display text-xl">Where the strains land</h3>
        <p className="font-body text-xs text-beige/55" data-testid="workbench-tier-cap">
          Your account ceiling is tier {tierCap}. Tiers above it never activate.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {strains.map((reading) => (
          <article
            key={reading.strain}
            className={`rounded-arcade border border-scale-blue-light/30 p-3 ${
              reading.tier === 0 ? 'opacity-60' : ''
            }`}
            data-testid={`workbench-strain-${reading.strain}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StrainChip strain={reading.strain} points={reading.points} size="md" />
              <span
                className="font-display text-sm text-bone-white"
                data-testid={`workbench-strain-tier-${reading.strain}`}
              >
                {reading.tierLabel}
              </span>
            </div>

            <p className="mt-2 font-mono text-xs text-beige/55">
              {reading.points} {reading.points === 1 ? 'point' : 'points'} ·{' '}
              {reading.genes} in-run {reading.genes === 1 ? 'gene' : 'genes'}
              {reading.thresholdDelta !== 0 && (
                <span className="text-cosmic">
                  {' '}
                  · thresholds {reading.thresholdDelta > 0 ? '+' : ''}
                  {reading.thresholdDelta} this week
                </span>
              )}
            </p>

            {(reading.minorAt !== null ||
              reading.expressionAt !== null ||
              reading.apexAt !== null) && (
              <p className="mt-1 font-mono text-xs text-cyber">
                {[
                  reading.minorAt !== null ? `Minor at food ${reading.minorAt}` : null,
                  reading.expressionAt !== null
                    ? `Expression at food ${reading.expressionAt}`
                    : null,
                  reading.apexAt !== null ? `Apex at food ${reading.apexAt}` : null,
                ]
                  .filter((line): line is string => line !== null)
                  .join(' · ')}
              </p>
            )}

            <p
              className="mt-2 font-body text-xs text-beige/70"
              data-testid={`workbench-strain-blocked-${reading.strain}`}
            >
              {blockedCopy(reading)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

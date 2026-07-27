'use client';

/**
 * Offer likelihood — and the number this panel refuses to show (WP-2.08).
 *
 * SLOT 1 is a weighted draw whose share is exactly computable from the pool,
 * the points and the week, so it is shown — labelled "before overrides",
 * because the lineage guarantee and the pity rule replace the RESULT of that
 * draw and a pre-run tool cannot know `recentOffers`. Those two are therefore
 * named CONDITIONALLY ("if your last two offers hold no…"), never asserted.
 *
 * SLOT 2 IS NOT QUOTED AT ALL. A quarter of the time it ignores gravity
 * entirely and redraws uniformly over genes the build has no points in, so no
 * single share describes it. A wrong probability in a calculator is worse than
 * a missing one: the missing one sends a player to the Codex, the wrong one
 * sends them to a build that does not work and they blame the game. The
 * refusal sentence is exported from `workbench.ts` so this screen and the test
 * read the same words, and so a refusal that lives only in a comment cannot be
 * quietly deleted.
 */

import { StrainChip } from '@/components/traits/StrainChip';
import { geneStrains } from '@/shared/game/genes';
import type { WorkbenchOfferReading } from '@/shared/game/workbench';

function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

export interface OfferPanelProps {
  offers: WorkbenchOfferReading;
}

export function OfferPanel({ offers }: OfferPanelProps) {
  const top = offers.firstOffer.slice(0, 8);

  return (
    <section className="panel p-5" data-testid="workbench-offers">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="heading-display text-xl">What you are likely to be offered</h3>
        <p
          className="font-body text-xs text-cosmic"
          data-testid="workbench-offer-caveat"
        >
          Slot 1 only, before overrides.
        </p>
      </div>

      {top.length === 0 ? (
        <p className="font-body text-sm text-beige/60" data-testid="workbench-offers-empty">
          This snake has no gene pool to draw from, so there is nothing to weigh.
        </p>
      ) : (
        <ol className="space-y-1" data-testid="workbench-first-offer">
          {top.map((entry) => (
            <li
              key={entry.gene}
              className="flex flex-wrap items-center gap-2 font-body text-sm"
              data-testid={`workbench-offer-${entry.gene}`}
            >
              <span className="font-mono text-xs text-venom-orange w-14">
                {percent(entry.share)}
              </span>
              <span className="text-bone-white">{entry.name}</span>
              <span className="flex gap-1">
                {geneStrains(entry.gene).map((strain) => (
                  <StrainChip key={strain} strain={strain} />
                ))}
              </span>
              <span className="ml-auto font-mono text-xs text-beige/45">
                weight {entry.breakdown.total.toFixed(2)}
                {entry.breakdown.condition !== 0 && (
                  <span className="text-cosmic">
                    {' '}
                    (week {entry.breakdown.condition > 0 ? '+' : ''}
                    {entry.breakdown.condition.toFixed(2)})
                  </span>
                )}
                {entry.breakdown.lineage !== 0 && (
                  <span className="text-cyber">
                    {' '}
                    (lineage +{entry.breakdown.lineage.toFixed(2)})
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* ── The plan's own genes, at the offer the plan wants them ─────── */}
      {offers.planned.length > 0 && (
        <div className="mt-5 border-t border-scale-blue-light/20 pt-4">
          <h4 className="font-display text-sm text-bone-white">
            Your planned picks, at the offer you want them
          </h4>
          <ul className="mt-2 space-y-1" data-testid="workbench-planned-offers">
            {offers.planned.map((entry) => (
              <li
                key={`${entry.gene}-${entry.offerIndex}`}
                className="font-body text-xs text-beige/70"
                data-testid={`workbench-planned-${entry.offerIndex}`}
              >
                <span className="font-mono text-venom-orange">
                  {percent(entry.share)}
                </span>{' '}
                <span className="text-bone-white">{entry.name}</span> at offer{' '}
                {entry.offerIndex + 1} (food {entry.atFood}) —{' '}
                {entry.rank > 0
                  ? `${entry.rank} of ${entry.candidates} by weight`
                  : 'not a candidate from this pool'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── The two overrides, stated conditionally ─────────────────────── */}
      <div className="mt-5 border-t border-scale-blue-light/20 pt-4">
        <h4 className="font-display text-sm text-bone-white">
          What can replace that draw
        </h4>
        <ul className="mt-2 space-y-2" data-testid="workbench-overrides">
          {offers.overrides.map((note) => (
            <li key={note} className="font-body text-xs text-beige/65">
              {note}
            </li>
          ))}
        </ul>
      </div>

      {/* ── The number that is not here, and why ────────────────────────── */}
      <p
        className="mt-4 rounded-arcade border border-cosmic/40 bg-cosmic/5 p-3 font-body text-xs text-beige/75"
        data-testid="workbench-slot2-refusal"
      >
        {offers.slot2Refusal}
      </p>
    </section>
  );
}

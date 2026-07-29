/**
 * Universal Genome-offer cadence.
 *
 * This is deliberately not a growth-profile field. A short or degressive
 * body curve should not starve buildcraft, and a high-pressure ladder curve
 * should not decide how many opportunities a build receives. The engine roll
 * and server validator floor both read this object.
 */

export const GENE_OFFER_CADENCE = {
  /** Mean foods between offers. */
  intervalBase: 6,
  /** Uniform half-width: offers arrive every 4-8 foods. */
  intervalJitter: 2,
  /** Exact lower roll and validator bound. */
  minFoodsPerPick: 4,
} as const;

export function rollGeneOfferInterval(
  rng: () => number = Math.random
): number {
  const span = 2 * GENE_OFFER_CADENCE.intervalJitter + 1;
  return (
    GENE_OFFER_CADENCE.intervalBase -
    GENE_OFFER_CADENCE.intervalJitter +
    Math.floor(rng() * span)
  );
}

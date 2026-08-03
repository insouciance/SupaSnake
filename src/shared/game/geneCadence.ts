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

/**
 * V2-only buildcraft cadence. The first two decisions arrive after four foods
 * so the Genome becomes visible immediately; later intervals are uniformly
 * 4–6 (mean five). V1 callers remain on `GENE_OFFER_CADENCE` above.
 */
export const GENOME_V2_GENE_OFFER_CADENCE = {
  openingOfferCount: 2,
  openingInterval: 4,
  intervalBase: 5,
  intervalJitter: 1,
  minFoodsPerPick: 4,
  maxFoodsPerPick: 6,
} as const;

export function rollGenomeV2GeneOfferInterval(
  offerIndex: number,
  rng: () => number
): number {
  const index = Math.max(0, Math.floor(offerIndex));
  if (index < GENOME_V2_GENE_OFFER_CADENCE.openingOfferCount) {
    return GENOME_V2_GENE_OFFER_CADENCE.openingInterval;
  }
  const span = 2 * GENOME_V2_GENE_OFFER_CADENCE.intervalJitter + 1;
  return (
    GENOME_V2_GENE_OFFER_CADENCE.intervalBase -
    GENOME_V2_GENE_OFFER_CADENCE.intervalJitter +
    Math.floor(Math.min(0.999999999999, Math.max(0, rng())) * span)
  );
}

/**
 * Universal Genome-offer cadence.
 *
 * This is deliberately not a growth-profile field. A short or degressive
 * body curve should not starve buildcraft, and a high-pressure ladder curve
 * should not decide how many opportunities a build receives. The engine roll
 * and server validator floor both read this object.
 */

export const GENE_OFFER_CADENCE = {
  /**
   * Mean foods between offers.
   *
   * 6 -> 8 (owner ruling, 2026-08-05). At six the relic arrived while the last
   * decision was still being played out, so the run read as a queue of offers
   * rather than a build with consequences between them. Eight leaves room for
   * the pick to matter before the next one lands, and it is the RELIC cadence
   * only: the portal schedule is untouched, because the carry gamble is core
   * design and its spacing is not a pacing dial.
   */
  intervalBase: 8,
  /** Uniform half-width: offers arrive every 6-10 foods. */
  intervalJitter: 2,
  /**
   * Validator floor: the smallest food gap any LIVE cadence can produce.
   *
   * Deliberately NOT the universal roll's lower bound any more. The auto-offer
   * interaction (`GENOME_V2_GENE_OFFER_CADENCE`, still the rollback path for a
   * run started with the relic flag off) opens its first two offers after FOUR
   * foods, so a floor of six would reject a legal run's first pick. The bound
   * exists against forgery, and the honest reading of it is the minimum across
   * every cadence a run may have played under - which is four, and stays four
   * until the auto-offer path is retired.
   */
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
 * Compatibility cadence for rules-v2 interaction version 1. Those already
 * started sessions opened their first two decisions after four foods, then
 * used uniformly distributed 4–6-food intervals. New player-pulled relic runs
 * use the universal `GENE_OFFER_CADENCE` through
 * `genomeV2PhysicalRelicInterval`; this function remains byte-compatible for
 * resumable automatic-offer sessions.
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

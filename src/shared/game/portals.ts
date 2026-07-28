/**
 * THE PORTAL SCHEDULE AND THE CARRY (WP-3.10).
 *
 * Two things live here, and the first exists only so the second can.
 *
 * ── THE CARRY ───────────────────────────────────────────────────────────────
 *
 * Owner ruling, 2026-07-28: bank and salvage both START at 1/1 and separate
 * from the first portal. Bank climbs with every door you walk past; salvage
 * decays toward a FLOOR, never toward zero. *"That large prize the player eyed
 * for is gone on death"* — but the run was still worth playing.
 *
 * The shape is a strict improvement at the shallow end. Today's salvage is a
 * flat 0.6, so a player who dies before ever seeing a portal is punished for a
 * risk they were never offered. Under the carry they lose nothing until they
 * decline something, and the punishment only ever grows as far as the floor.
 * That is §12.3's *"it may pull, it may never punish"* stated as arithmetic.
 *
 * YIELD ONLY, NEVER SCORE. Rule 2 makes Score structurally unable to read the
 * extraction outcome — the fold may only do
 * `score += round(FOOD_BASE_SCORE * ruleset.scoreMultiplier(n))` — so this is
 * mandated by the Constitution rather than merely prudent. `verify:constitution`
 * enforces it mechanically.
 *
 * ── WHY THE SCHEDULE HAD TO CHANGE FIRST ────────────────────────────────────
 *
 * The carry multiplies the payout by how many portals you passed. That is a
 * far more leveraged number than anything this codebase trusts a client for:
 * at the shipped cadence a run that reaches 48 foods sees about five portals,
 * so a client free to claim its own pass count could turn a x1.25 bank into
 * x3.05 — a 2.4x payout inflation, against the +-0.05 an infuse moves or the
 * +1.4 ratio a COSMIC combo is clamped to. Bounded trust is the wrong tool at
 * this leverage. The server has to DERIVE the count.
 *
 * It could not. Portal intervals were rolled from `Math.random` (the engine's
 * default rng, seeded only for challenge runs), and worse, the next portal was
 * scheduled from the moment the previous one RESOLVED — a tick-timing fact the
 * server cannot reconstruct from a settled run. `maxPortalsSpawnable` exists in
 * the validator precisely because of this: it is a conservative upper bound,
 * not a count.
 *
 * So the schedule is now FOOD-INDEXED AND SEEDED, which is exactly the
 * discipline `terrain.ts` already adopted for the same reason ("food-indexed
 * cadence and seeded cell choice so the server can replay it; without that it
 * cannot be validated and must not ship"). Portal k's food is a pure function
 * of `(extraction config, runSeed, k, the taxes in force at that food)`, so
 * both the engine and the settlement walk the same recurrence and land on the
 * same number. Nothing about it depends on when the player physically arrived.
 *
 * The stream is DOMAIN-PREFIXED — `portal:${runSeed}:${index}`, never the bare
 * `${runSeed}:${index}` the gene-offer stream uses. That is not tidiness: the
 * Signal/Serpent Monday key collision is the precedent for what happens when
 * two independent derivations share a key space, and two streams that agree on
 * every index would make the portal schedule a function of the offer schedule.
 *
 * CONSEQUENCE, STATED RATHER THAN BURIED. The interval no longer restarts when
 * a portal resolves; it is laid out from the run's seed. A player who lingers
 * can therefore meet the next door sooner after banking a previous one than
 * they used to. That is the price of a validatable schedule, and it is the same
 * price terrain paid.
 */

import { mulberry32, fnv1a } from '@/shared/game/offerGravity';
import { MUTATION_PHYSICS } from '@/shared/game/mutations';
import { TRAIT_PHYSICS } from '@/shared/game/traits';
import { ANOMALY_PHYSICS } from '@/shared/game/anomalies';
import { STRAIN_PHYSICS } from '@/shared/game/strains';
import { GENE_PHYSICS } from '@/shared/game/genes';
import { SPLICE_PHYSICS } from '@/shared/game/splices';

// =============================================================================
// CADENCE
// =============================================================================

/**
 * Just the fields a portal schedule needs from a dynasty's `ExtractionConfig`.
 *
 * Structural rather than the real type on purpose: `rulesets.ts` imports
 * `genome.ts`, `genome.ts` imports this module, so importing `rulesets.ts` back
 * would close a cycle. Declaring the shape here keeps the dependency a straight
 * line — and `ExtractionConfig` satisfies it, so callers pass theirs directly.
 */
export interface PortalCadence {
  firstExitAtFood: number;
  intervalBase: number;
  intervalJitter: number;
}

/**
 * Roll the food-interval to the next exit portal: base +/- jitter, uniform,
 * inclusive.
 *
 * This lives here rather than in `rulesets.ts` (which re-exports it, so every
 * existing caller is unchanged) because the schedule and the roll must be one
 * implementation. Two copies of a seeded recurrence is how an engine and a
 * settlement stop agreeing.
 */
export function rollExitInterval(
  cadence: PortalCadence,
  rng: () => number = Math.random
): number {
  const span = 2 * cadence.intervalJitter + 1;
  return cadence.intervalBase - cadence.intervalJitter + Math.floor(rng() * span);
}

// =============================================================================
// THE INTERVAL TAX
// =============================================================================

/**
 * Everything that pushes the next door further away, as facts rather than as
 * live objects.
 *
 * The engine reads these off its own state; the settlement reconstructs them
 * from the accepted picks, the activations and the infuse list. Passing FACTS
 * through one shared function means the only thing that can drift between the
 * two sides is fact-gathering — a much narrower surface than two copies of the
 * arithmetic, and one that a parity test can pin.
 */
export interface PortalTaxFacts {
  hasMagnetPulse: boolean;
  hasSolsticeEngine: boolean;
  hasMagnetism: boolean;
  isGoldRush: boolean;
  /** 0 when the genome is inactive; otherwise the FLUX tier at this food. */
  fluxTier: number;
  hasPocketRift: boolean;
  hasBlackMagnet: boolean;
  /** Infuses resolved at or before this food. Each is +2 foods of exposure. */
  infuses: number;
}

/**
 * The raw run data both sides already hold, from which the facts are read.
 *
 * FACT-GATHERING IS SHARED TOO, AND THAT IS DELIBERATE. Sharing only the
 * arithmetic would leave the two sides free to disagree about *when* a gene was
 * held or *which* food a tier activated at — a quieter bug than a wrong formula
 * and a much harder one to find, because it only bites on runs that pick late.
 *
 * Everything here is indexed by food, never by tick. That is what lets the
 * settlement answer the same question the engine answered live.
 */
export interface PortalTaxSources {
  /** Every gene pick, fused parents included — the engine keeps them too. */
  picks: readonly { id: string; atFood: number }[];
  /** Splices formed, by the food they formed at. */
  splices: readonly { id: string; atFood: number }[];
  traits: readonly string[];
  anomaly: string | null;
  infuses: readonly { atFood: number }[];
  /** FLUX tier as of a food, already FTUE-capped by the caller. */
  fluxTierAt: (food: number) => number;
}

/**
 * The facts in force at a given food.
 *
 * Evaluated at the SCHEDULED food, never at "now". The engine used to read its
 * live state, which is the same thing right up until a VOLT arc collects three
 * foods in one tick and the current food count runs ahead of the door that just
 * came due. Indexing by the scheduled food makes engine and settlement answer
 * the identical question by construction.
 */
export function portalTaxFactsAt(
  sources: PortalTaxSources,
  food: number
): PortalTaxFacts {
  const held = (id: string): boolean =>
    sources.picks.some((p) => p.id === id && p.atFood <= food);
  const fused = (id: string): boolean =>
    sources.splices.some((s) => s.id === id && s.atFood <= food);
  return {
    hasMagnetPulse: held('magnet_pulse'),
    hasSolsticeEngine: held('solstice_engine'),
    hasMagnetism: sources.traits.includes('magnetism'),
    isGoldRush: sources.anomaly === 'gold_rush',
    fluxTier: sources.fluxTierAt(food),
    hasPocketRift: held('pocket_rift'),
    hasBlackMagnet: fused('splice_black_magnet'),
    infuses: sources.infuses.filter((i) => i.atFood <= food).length,
  };
}

/** The additive interval penalties in force. Each pull source pays its own. */
export function portalIntervalTax(facts: PortalTaxFacts): number {
  let tax =
    (facts.hasMagnetPulse ? MUTATION_PHYSICS.magnetPortalIntervalPenalty : 0) +
    (facts.hasSolsticeEngine
      ? MUTATION_PHYSICS.solsticeEnginePortalIntervalPenalty
      : 0) +
    (facts.hasMagnetism ? TRAIT_PHYSICS.magnetismPortalIntervalPenalty : 0) +
    // Gold Rush (anomaly): richer food, rarer doors - interval +6
    (facts.isGoldRush ? ANOMALY_PHYSICS.goldRushPortalIntervalPenalty : 0);
  if (facts.fluxTier >= 2) tax += STRAIN_PHYSICS.riftAuraPortalIntervalPenalty;
  if (facts.fluxTier >= 3) {
    tax += STRAIN_PHYSICS.singularityPortalIntervalPenalty;
  }
  if (facts.hasPocketRift) tax += GENE_PHYSICS.pocketRiftPortalIntervalPenalty;
  if (facts.hasBlackMagnet) {
    tax += SPLICE_PHYSICS.blackMagnetPortalIntervalPenalty;
  }
  tax += facts.infuses * STRAIN_PHYSICS.infusePortalIntervalPenalty;
  return tax;
}

// =============================================================================
// THE SEEDED STREAM
// =============================================================================

/**
 * The deterministic stream for portal k of a run.
 *
 * Counter-based like `offerStream`, so the server can derive portal k without
 * replaying anything before it — and domain-prefixed so it can never coincide
 * with the offer stream.
 */
export function portalStream(runSeed: string, index: number): () => number {
  return mulberry32(fnv1a(`portal:${runSeed}:${index}`));
}

/**
 * Portals a single run may schedule.
 *
 * A bound, not a balance dial: it stops a pathological food count from walking
 * the recurrence forever, and it is far above any reachable run (the shipped
 * cadence needs roughly 400 foods to reach it).
 */
export const PORTAL_SCHEDULE_LIMIT = 48;

/**
 * The food counts at which portals spawn, in order, up to `foodCount`.
 *
 * `intervalTaxAt(food)` supplies the additive interval penalties in force when
 * portal k is scheduled — Magnet Pulse, Magnetism, Gold Rush, Rift Aura,
 * Singularity, Pocket Rift, Black Magnet, and two foods per infuse. It is a
 * callback rather than a value because the taxes depend on what the run held at
 * that food, which the engine knows live and the server reconstructs. Both
 * sides pass the same facts and must therefore get the same array; the engine
 * and the settlement are asserted equal by test.
 */
export function portalSchedule(
  extraction: PortalCadence,
  runSeed: string,
  foodCount: number,
  intervalTaxAt: (food: number) => number = () => 0
): number[] {
  const foods: number[] = [];
  if (!runSeed || foodCount < 0) return foods;
  let next = extraction.firstExitAtFood;
  for (let index = 0; index < PORTAL_SCHEDULE_LIMIT; index++) {
    if (next > foodCount) break;
    foods.push(next);
    const interval =
      rollExitInterval(extraction, portalStream(runSeed, index)) +
      Math.max(0, intervalTaxAt(next));
    // A tax can only ever push a door further away, and an interval of zero
    // would stack every remaining portal onto one food.
    next += Math.max(1, interval);
  }
  return foods;
}

/** How many portals a run of `foodCount` foods met. */
export function portalsEncountered(
  extraction: PortalCadence,
  runSeed: string,
  foodCount: number,
  intervalTaxAt: (food: number) => number = () => 0
): number {
  return portalSchedule(extraction, runSeed, foodCount, intervalTaxAt).length;
}

/**
 * Portals the player DECLINED.
 *
 * The identity that makes the carry need no new client claim: every portal a
 * run met was either infused at, banked at, or passed. Infuses are already
 * sanitized server-side and `extracted` is already derived there, so the third
 * term falls out of the other two.
 *
 * A portal that expired unused counts as passed — the same reading the run-event
 * vocabulary has used since Identity v1 ("a portal that expires unused was
 * PASSED - the greed decision the Analyst narrates").
 */
export function portalsPassed(
  encountered: number,
  infuses: number,
  extracted: boolean
): number {
  return Math.max(0, encountered - infuses - (extracted ? 1 : 0));
}

// =============================================================================
// THE CARRY
// =============================================================================

export const CARRY = {
  /**
   * What one passed door multiplies the bank by. [H]
   *
   * 1.25 is not a coincidence: it is today's flat bank multiplier, re-read as
   * a RATE rather than a constant. Banking at the first portal pays exactly
   * what banking pays today, so the shallow end of the curve is unchanged and
   * only the deep end is new.
   */
  bankStep: 1.25,
  /**
   * Passed doors the carry counts before it stops climbing. [H]
   *
   * At the shipped cadence a 48-food run (D1's candidate median) meets about
   * five portals, so this leaves headroom for a long run without letting an
   * exceptional one compound without limit. Bank tops out at 1.25^6 = 3.81.
   */
  maxPortals: 6,
  /**
   * Where salvage stops falling. [H]
   *
   * The whole point of the ruling: *"never near-zero."* A crash after five
   * passed doors still returns better than a third of the run, so the run was
   * worth playing even when the prize the player was eyeing is gone.
   */
  salvageFloor: 0.35,
  /**
   * How fast salvage approaches the floor, per passed door. [H]
   *
   * 0.6 lands the sketch the owner signed off on: 1.00 / 0.74 / 0.58 / 0.50 /
   * 0.43 across the first five portals, against a sketched 0.44 at portal five.
   */
  salvageDecay: 0.6,
} as const;

/**
 * The bank multiplier a run carries into its `passed`-th-plus-one portal.
 *
 * `passed = 0` is the first door: 1.25, exactly today's flat value.
 */
export function carryBankMultiplier(passed: number): number {
  const doors = Math.min(CARRY.maxPortals, Math.max(0, Math.floor(passed)));
  return round4(Math.pow(CARRY.bankStep, doors + 1));
}

/**
 * The salvage multiplier a run carries after `passed` declined portals.
 *
 * `passed = 0` is 1.0 — before you have declined anything there is nothing to
 * have gambled, so a crash returns the run whole. It can never exceed 1: dying
 * must never pay more than the run earned.
 *
 * `salvageFloor` is a PARAMETER rather than a read of `CARRY.salvageFloor`
 * because the D2 ladder's "Thin Salvage" rung lowers it (WP-3.12). It defaults
 * to the shipped floor, so every existing caller — and every run at rung 0 —
 * gets exactly the curve it got before. The floor is supplied by
 * `ladderSalvageFloor(rung)`, which is the ONE place that arithmetic lives; a
 * caller computing its own would be a second dial that could go stale.
 *
 * Note that `passed = 0` is 1.0 whatever the floor is: the floor is where the
 * decay LANDS, not where it starts, so a rung that lowers it cannot punish a
 * player who never declined a door.
 */
export function carrySalvageMultiplier(
  passed: number,
  salvageFloor: number = CARRY.salvageFloor
): number {
  const doors = Math.min(CARRY.maxPortals, Math.max(0, Math.floor(passed)));
  const floor = Math.min(1, Math.max(0, salvageFloor));
  const decayed = floor + (1 - floor) * Math.pow(CARRY.salvageDecay, doors);
  return round4(Math.min(1, decayed));
}

/**
 * The multipliers every gene, trait, splice, anomaly and clamp in the catalog
 * was authored against. The carry is expressed RELATIVE to these — see
 * `carryScaled`.
 */
export const CARRY_BASE = { bank: 1.25, salvage: 0.6 } as const;

/**
 * Apply the carry to an outcome the existing build math already produced.
 *
 * COMPOSED AS A RATIO, NOT AS A REPLACEMENT, AND THAT IS THE WHOLE TRICK.
 * Every wager, interest, overclock, infuse, strain-tier, trait and world-clause
 * delta in `genomeOutcomeMultipliers` was authored against a 1.25 bank and a
 * 0.6 salvage, and so were the §10 clamps that bound them. Rebasing that math
 * on a moving number would silently retune all of it — a +0.05 infuse delta
 * means something quite different against 1.25 than against 3.81, and the
 * clamps would stop bounding what they were written to bound.
 *
 * So the build math runs untouched on the historical base, its clamps still
 * bound BUILD's influence, and the carry scales the result afterwards. Two
 * consequences worth stating:
 *
 *   - At the first portal the bank is byte-identical to today's. Nothing about
 *     the shallow end of a banked run changes.
 *   - Salvage at zero passed doors becomes 1.0, up from 0.6. That is the
 *     ruling, not a side effect: a player who dies before declining anything
 *     was never offered the gamble they are being charged for.
 *
 * Salvage is finally clamped at 1: dying must never pay more than the run
 * earned, whatever a build stacks on top.
 */
export function carryScaled(
  outcome: { bank: number; death: number },
  passed: number,
  salvageFloor: number = CARRY.salvageFloor
): { bank: number; death: number } {
  const bankRatio = carryBankMultiplier(passed) / CARRY_BASE.bank;
  const salvageRatio =
    carrySalvageMultiplier(passed, salvageFloor) / CARRY_BASE.salvage;
  return {
    bank: round4(outcome.bank * bankRatio),
    death: round4(Math.min(1, outcome.death * salvageRatio)),
  };
}

/** Four decimal places, matching `genome.ts`'s rounding discipline. */
function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

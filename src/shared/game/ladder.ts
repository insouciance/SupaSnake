/**
 * THE D2 DIFFICULTY LADDER (WP-3.12).
 *
 * Eight rungs. Rung 0 is the shipped game; rungs 1-7 each add exactly ONE
 * named rule, in a fixed order, cumulatively, identically for everyone. There
 * is no per-dynasty ladder, no per-player tuning and no randomness: two players
 * standing on rung 5 are playing the same game.
 *
 * ── WHY ONE RULE PER RUNG ───────────────────────────────────────────────────
 *
 * A rung the player cannot NAME is a rung they cannot learn. The whole value of
 * a ladder over a difficulty slider is that each step is legible: you know what
 * beat you, and you know what the next step will ask. So a rung is allowed to
 * move exactly one dial, and it gets a sentence a player can repeat.
 *
 * ── WHY THESE DIALS AND NOT THE PLAN'S ──────────────────────────────────────
 *
 * `docs/ops/REDESIGN_WAVE.md` §WP-3.10 sketched a rung list before the wave was
 * built, and two of its examples describe things that do not exist: there is no
 * PASS DNA reward and no BANISH verb. They are not implemented here, and they
 * are not invented here either. Every dial below is a substrate this wave
 * actually shipped, named with the module that owns it:
 *
 *   growthProfileFloor        `growth.ts`      GROWTH_PROFILES
 *   holdBudgetDelta           `config/game.ts` session.holds.base
 *   portalWindowSecondsDelta  `rulesets.ts`    ExtractionConfig.despawnSeconds
 *   portalIntervalFoodsDelta  `portals.ts`     PortalCadence
 *   infuseGrowthDelta         `strains.ts`     STRAIN_PHYSICS.infuseGrowth
 *   salvageFloorDelta         `portals.ts`     CARRY.salvageFloor
 *
 * TWO SUBSTRATES WERE CONSIDERED AND DELIBERATELY LEFT OUT.
 *
 *   - CYBER's second terrain ring. `rulesets.ts` says in as many words that "a
 *     second ring is a ladder rung, not base content", and it is the right
 *     instinct — but the terrain schedule is under active change elsewhere in
 *     this wave, and a rung whose dial is being retuned underneath it is a rung
 *     that cannot be reasoned about. It is the obvious rung 8.
 *   - "The Serpent's week clause is always hostile." The week's clause set is
 *     re-derived at settlement by `resolveSessionWorldCondition` from the
 *     session row's own stamps, which is deliberately the ONE source for that
 *     fact. A rung that made a player's run resolve a different clause set from
 *     the week it was played in would create a second source, which is exactly
 *     the drift `runContext.ts` refuses to introduce for the world condition.
 *
 * ── THE UNIT QUESTION, ASKED OF EVERY DIAL ──────────────────────────────────
 *
 * *What unit is this bound in, and what happens to it when the thing it depends
 * on changes?* Three bounds in this codebase were found denominated in the
 * wrong unit in a single day, so it is asked here rung by rung:
 *
 *   growthProfileFloor       a profile ID, not a number. It cannot rot: it
 *                            names a curve, and if the curve is retuned the
 *                            rung means "that curve" exactly as before.
 *   holdBudgetDelta          holds. A count of a thing that is itself a count.
 *   portalWindowSecondsDelta SECONDS, and this is the one that matters. WP-3.04
 *                            found the extraction window authored in TICKS,
 *                            which made it shrink fourfold as CYBER accelerated
 *                            — 90 ticks is 18.0s on PRIMAL and 4.5s at CYBER's
 *                            old floor. A rung that shortened a tick count
 *                            would reintroduce that bug at a steeper angle. It
 *                            is converted by the LIVE tick at the point of use.
 *   portalIntervalFoodsDelta FOODS. The schedule is food-indexed precisely so
 *                            the server can replay it; a delta in any other
 *                            unit could not be replayed.
 *   infuseGrowthDelta        SEGMENTS, the unit `STRAIN_PHYSICS.infuseGrowth`
 *                            is already in, and the unit both length models
 *                            fold in.
 *   salvageFloorDelta        a RATIO subtracted from a ratio. Dimensionless on
 *                            both sides.
 *
 * ── THE FLAG GATES THE SELECTOR, NEVER THE MATH ─────────────────────────────
 *
 * Nothing in this module reads a `NEXT_PUBLIC_*` value, for the same reason
 * `growth.ts` does not: those are inlined at build time, so a flag on run math
 * means a client built with one rung's rules and a server recomputing with
 * another. They would disagree on length, on the portal schedule and on the
 * payout, and a disagreement invalidates runs a player honestly earned.
 *
 * The rung is therefore resolved SERVER-SIDE at run start, stamped into
 * `run_context`, and replayed from that stamp at settlement — the growth
 * profile's pattern, verbatim. `NEXT_PUBLIC_LADDER_V1` gates only whether the
 * Run Setup selector is shown. With it off the server never stamps a rung,
 * every run is rung 0, and rung 0 is byte-identical to the shipped game.
 */

import {
  GROWTH_PROFILES,
  DEFAULT_GROWTH_PROFILE,
  type GrowthProfileId,
} from '@/shared/game/growth';
import { STRAIN_PHYSICS } from '@/shared/game/strains';
import { CARRY, type PortalCadence } from '@/shared/game/portals';

/** The rung every unstamped, unknown and malformed run resolves to. */
export const DEFAULT_LADDER_RUNG = 0;

/**
 * The dials a rung may move. Every field is a DELTA against the shipped game
 * except `growthProfileFloor`, which names a curve.
 *
 * Exhaustive on purpose: a new dial is a compile error at every fold site
 * rather than a field that silently defaults, which is how a rung would come to
 * mean one thing in the engine and another in the settlement.
 */
export interface LadderParams {
  /**
   * The slowest growth curve this rung may be played on.
   *
   * A FLOOR, not an assignment: a player who has opted into a faster curve in
   * the lab keeps it. The rung raises the floor, it never lowers a choice.
   */
  growthProfileFloor: GrowthProfileId;
  /** Tactical holds removed from the run's base budget. Never below zero. */
  holdBudgetDelta: number;
  /** SECONDS removed from the extraction window. Converted by the live tick. */
  portalWindowSecondsDelta: number;
  /** FOODS added to the first door and to every interval after it. */
  portalIntervalFoodsDelta: number;
  /** SEGMENTS added to what an INFUSE grows. */
  infuseGrowthDelta: number;
  /** Subtracted from `CARRY.salvageFloor`. */
  salvageFloorDelta: number;
}

export interface LadderRung {
  /** Position on the ladder. The array index, and the stamped value. */
  rung: number;
  /** Short, repeatable, player-facing. */
  name: string;
  /** THE one rule this rung adds, in one sentence the player can say back. */
  rule: string;
  /** What this rung changes relative to the rung below it. */
  step: Partial<LadderParams>;
}

/** Rung 0: the shipped game, and what every delta is measured against. */
const GROUND: LadderParams = {
  growthProfileFloor: DEFAULT_GROWTH_PROFILE,
  holdBudgetDelta: 0,
  portalWindowSecondsDelta: 0,
  portalIntervalFoodsDelta: 0,
  infuseGrowthDelta: 0,
  salvageFloorDelta: 0,
};

/**
 * THE LADDER. Fixed order, cumulative, the same for everyone.
 *
 * Every number here is an [H] dial — a value chosen to be retuned by the owner
 * playing, not defended by analysis. They are listed in the work package's PR
 * body as a table for exactly that reason. Reordering the array renumbers the
 * ladder and would revalue every stored `best_rung`, so it is an owner
 * decision, not a refactor.
 */
export const LADDER_RUNGS: readonly LadderRung[] = [
  {
    rung: 0,
    name: 'Ground',
    rule: 'The game as it shipped.',
    step: {},
  },
  {
    rung: 1,
    name: 'The Quickening',
    rule: 'The run is played on the Tuned growth curve.',
    // The single most felt dial in the wave: Tuned puts three foods on the
    // board and grows +6 for the first twelve, which is what makes a 400-cell
    // board close at all. Across 144 production runs the median reached 8%
    // occupancy, so rung 1 is where the board first becomes an opponent.
    step: { growthProfileFloor: 'tuned' },
  },
  {
    rung: 2,
    name: 'Short Rope',
    rule: 'One fewer tactical hold.',
    // Three to open (`GAME_CONFIG.session.holds.base`), and the run earns more
    // at lengths 25 and 40. Taking one removes a whole recovery, not a fraction
    // of one, which is why it is legible without being large.
    step: { holdBudgetDelta: -1 },
  },
  {
    rung: 3,
    name: 'The Narrow Door',
    rule: 'The extraction window is four seconds shorter.',
    // 18s -> 14s. Authored in SECONDS and converted by the live tick, so it
    // cannot rot the way `despawnTicks` did (WP-3.04). Four seconds is roughly
    // a fifth of the window and about two board-crossings at PRIMAL's tempo:
    // enough that a door across the board stops being free, not so much that
    // the decision itself is what runs out.
    step: { portalWindowSecondsDelta: -4 },
  },
  {
    rung: 4,
    name: 'The Long Walk',
    rule: 'Every door is three foods further away.',
    // The cadence is 15, then 12 +/- 4. +3 makes it 18, then 15 +/- 4 — one
    // extra door's worth of exposure across a 48-food run. It lengthens the
    // stake without touching what the stake pays.
    step: { portalIntervalFoodsDelta: 3 },
  },
  {
    rung: 5,
    name: 'The Weight of Power',
    rule: 'INFUSE grows you four more segments.',
    // Rule 15 made INFUSE cost growth (8 segments). 12 is half again, and this
    // is the rung that makes INFUSE a decision rather than a habit on a run
    // that is already fighting the board because of rung 1.
    step: { infuseGrowthDelta: 4 },
  },
  {
    rung: 6,
    name: 'Thin Salvage',
    rule: 'The salvage floor drops from 0.35 to 0.25.',
    // The carry's floor is the owner's "never near-zero" ruling as arithmetic.
    // This rung moves the floor, never the shape: a crash after five passed
    // doors still returns a quarter of the run. Below 0.25 the ruling starts to
    // read as broken rather than as steep, which is why this is the last
    // economic rung rather than the first of several.
    step: { salvageFloorDelta: 0.1 },
  },
  {
    rung: 7,
    name: 'The Reckoning',
    rule: 'The run is played on the Aggressive growth curve.',
    // The second growth step, and the top of the ladder as built. Aggressive
    // grows +8 for ten foods and ends near 2:48 — stacked on rungs 2-6 it is a
    // different game from Ground while being made of the same six dials.
    step: { growthProfileFloor: 'aggressive' },
  },
] as const;

/** The highest rung the ladder currently offers. */
export const LADDER_MAX_RUNG = LADDER_RUNGS.length - 1;

/**
 * Total, and never throws.
 *
 * An absent, non-integer, negative or UNRECOGNISED rung resolves to 0 — the
 * shipped game — rather than being clamped to the top. Clamping would settle a
 * run under rules harder than the ones it was played under, which is the worse
 * of the two failure modes: rung 0 pays and plays exactly as the game did
 * before this module existed, so a stamp written by a future build, or no stamp
 * at all, can never change how a run settles unexpectedly. Same posture as
 * `resolveGrowthProfile`.
 */
export function resolveLadderRung(value: unknown): number {
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= LADDER_MAX_RUNG
  ) {
    return value;
  }
  return DEFAULT_LADDER_RUNG;
}

/** Type guard for a rung the ladder actually offers. */
export function isLadderRung(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= LADDER_MAX_RUNG
  );
}

/** The rung's definition. Unknown rungs answer with Ground. */
export function ladderRung(rung: unknown): LadderRung {
  return LADDER_RUNGS[resolveLadderRung(rung)];
}

/**
 * The parameters in force at a rung: rungs 0..rung folded in order.
 *
 * Cumulative by construction. A rung does not restate the rungs below it, so
 * retuning rung 2 cannot leave rung 5 quoting the old value — the failure mode
 * of writing each rung's parameters out in full.
 */
export function ladderParams(rung: unknown): LadderParams {
  const top = resolveLadderRung(rung);
  const params: LadderParams = { ...GROUND };
  for (let index = 0; index <= top; index++) {
    Object.assign(params, LADDER_RUNGS[index].step);
  }
  return params;
}

/** Growth curves in order of how hard they make the run. */
const GROWTH_ORDER: readonly GrowthProfileId[] = ['baseline', 'tuned', 'aggressive'];

/**
 * The growth profile a run at this rung is actually played on: the HARDER of
 * what the player asked for and what the rung requires.
 *
 * Resolved once, server-side, and stamped as `growthProfileId` — so the rung's
 * growth step needs no second channel through the engine, the length models or
 * the validator's food-rate bound. They all already replay from that stamp.
 */
export function ladderGrowthProfileId(
  requested: unknown,
  rung: unknown
): GrowthProfileId {
  const floor = ladderParams(rung).growthProfileFloor;
  const asked =
    typeof requested === 'string' && requested in GROWTH_PROFILES
      ? (requested as GrowthProfileId)
      : DEFAULT_GROWTH_PROFILE;
  return GROWTH_ORDER.indexOf(asked) >= GROWTH_ORDER.indexOf(floor)
    ? asked
    : floor;
}

/**
 * The portal cadence in force at a rung.
 *
 * THE ONE FUNCTION, in the sense `baseGrowthForFood` is: the engine's
 * incremental walk and the settlement's closed walk both call it, so a rung
 * cannot move the doors for one side and not the other. A second copy of this
 * arithmetic is how an engine and a settlement stop agreeing about how many
 * doors a run met — and the carry multiplies the payout by that count.
 *
 * `intervalJitter` is untouched: the rung shifts the schedule, it does not make
 * it noisier. `firstExitAtFood` floors at 1 so no delta can put the first door
 * before the run starts.
 */
export function ladderCadence(
  cadence: PortalCadence,
  rung: unknown
): PortalCadence {
  const delta = ladderParams(rung).portalIntervalFoodsDelta;
  if (delta === 0) return cadence;
  return {
    ...cadence,
    firstExitAtFood: Math.max(1, cadence.firstExitAtFood + delta),
    intervalBase: Math.max(1, cadence.intervalBase + delta),
  };
}

/**
 * Segments an INFUSE grows at this rung.
 *
 * Both length models call this — the engine when the portal resolves, and
 * `computeLengthTrace` when the run settles. Reading `STRAIN_PHYSICS.infuseGrowth`
 * directly at either site would drift the moment a rung moves it, and a length
 * drift silently invalidates an honest run.
 */
export function ladderInfuseGrowth(rung: unknown): number {
  return Math.max(0, STRAIN_PHYSICS.infuseGrowth + ladderParams(rung).infuseGrowthDelta);
}

/**
 * The carry's salvage floor at this rung.
 *
 * Floored at 0.05 rather than at 0: the owner's ruling on the carry is
 * *"never near-zero"*, and a rung is allowed to make the floor steep but not to
 * repeal the ruling. If a future rung wants zero salvage it needs a different
 * argument than a dial nudge.
 */
export function ladderSalvageFloor(rung: unknown): number {
  return Math.max(0.05, CARRY.salvageFloor - ladderParams(rung).salvageFloorDelta);
}

/**
 * Tactical holds a run opens with at this rung.
 *
 * Floored at 1: a run with no hold at all is a different game, not a harder
 * one, and the hold budget is what makes a long body steerable rather than a
 * lottery.
 */
export function ladderHoldBase(base: number, rung: unknown): number {
  return Math.max(1, base + ladderParams(rung).holdBudgetDelta);
}

/**
 * The rung a player may ATTEMPT, given their best rung across ALL dynasties.
 *
 * THE ANTI-RE-CLIMB RULING, stated as one function. Unlock is GLOBAL and the
 * record is PER-DYNASTY: a player who beat rung 4 on PRIMAL may open a CYBER
 * run at rung 5 without re-climbing four rungs they have already proved they
 * can climb. Their CYBER record is still their CYBER record — that is
 * `player_ladders`, not this.
 *
 * One rung above the best, so the ladder is climbed and never skipped.
 */
export function highestAttemptableRung(bestAcrossDynasties: unknown): number {
  const best = resolveLadderRung(bestAcrossDynasties);
  return Math.min(LADDER_MAX_RUNG, best + 1);
}

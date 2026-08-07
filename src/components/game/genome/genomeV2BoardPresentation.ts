import {
  GENOME_V2_CONFIG,
  GENOME_V2_SPLICES,
  GENOME_V2_YIELD_SCALE,
  genomeV2HasGene,
  genomeV2HasSplice,
  genomeV2TerrainSolidAt,
  type GenomeV2Cell,
  type GenomeV2ExclusiveTargetKind,
  type GenomeV2State,
  type GenomeV2TargetLifecycle,
} from '@/shared/game/genomeV2';
import { GENOME_V2_GENES } from '@/shared/game/genes';
import type { Direction } from '@/lib/game/SnakeGameLogic';
import { genomeV2PresentationFormat } from './genomeV2PresentationAdapter';

export type GenomeV2BoardTerrainSource =
  | 'coilkeeper_seal'
  | 'phase_gate_scar';

export interface GenomeV2BoardTarget {
  targetId: string;
  kind: 'crown_future' | GenomeV2ExclusiveTargetKind;
  lifecycle: GenomeV2TargetLifecycle;
  cell: GenomeV2Cell;
  /** Physical branch identity for the mutually exclusive Gilded Fork. */
  branchChoice: 'ordinary' | 'gilded' | null;
  /** Circuit leg two occupies the original destination after the relay. */
  leg: 1 | 2;
  edible: boolean;
  collidable: boolean;
  remainingMoves: number | null;
  totalMoveBudget: number | null;
  budgetFraction: number | null;
  budgetExpired: boolean;
  rewardLabel: string;
  statusLabel: string;
}

export interface GenomeV2BoardGate {
  targetId: string;
  entry: GenomeV2Cell;
  exit: GenomeV2Cell;
  /**
   * The heading the head would come out of this door with, if it crossed the
   * entry on the heading it has right now.
   *
   * The door preserves heading exactly - that is the whole rule - so this is
   * simply the live direction, drawn where the consequence of it lands.
   * Turning before the entry turns the chevron with you, which is what makes
   * it a route the player can plan rather than a leap of faith.
   */
  arrivalHeading: Direction;
}

export interface GenomeV2BoardTerrainCell extends GenomeV2Cell {
  source: GenomeV2BoardTerrainSource;
  terrainId: string;
  /** True while the cell is a passable decal counting down to lethal. */
  forming: boolean;
  /** 0 at the moment of creation, 1 the tick it locks. Drawn as a fill. */
  formingProgress: number;
}

export interface GenomeV2BoardProjection {
  targets: GenomeV2BoardTarget[];
  gates: GenomeV2BoardGate[];
  permanentTerrain: GenomeV2BoardTerrainCell[];
  /** Exact lethal cells for pathline danger and trail-packing presentation. */
  occupiedCells: GenomeV2Cell[];
}

export interface GenomeV2RuntimeSignal {
  id:
    | 'target'
    | 'mirror'
    | 'loan'
    | 'bonds'
    | 'phoenix'
    | 'overgrowth'
    | 'dilation'
    | 'anchor';
  label: string;
  tone: 'objective' | 'risk' | 'ready' | 'pressure';
}

export interface GenomeV2BoardFeedback {
  eventId: string;
  label: string;
  tone: 'success' | 'warning' | 'risk';
}

function cellKey(cell: GenomeV2Cell): string {
  return `${cell.x}:${cell.z}`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function sameCell(left: GenomeV2Cell, right: GenomeV2Cell): boolean {
  return left.x === right.x && left.z === right.z;
}

function targetName(kind: GenomeV2ExclusiveTargetKind): string {
  switch (kind) {
    case 'gold_trail':
      return 'GOLDEN HOUR';
    case 'live_wire':
      return 'STRAIGHT SHOT';
    case 'circuit_run':
      return 'FOOD CHAIN';
    case 'coilkeeper':
      return 'LOOP TRAP';
    case 'wall_rush':
      return 'WALL BOUNCE';
    case 'phase_gate':
      return 'SIDE DOOR';
  }
}

function targetRewardLabel(
  state: GenomeV2State,
  kind: GenomeV2ExclusiveTargetKind,
  sealedAreaCells: number
): string {
  switch (kind) {
    case 'gold_trail':
      return genomeV2HasSplice(state, 'splice_gilded_fork')
        ? '×4 GREED'
        : '×3 PAYOUT';
    case 'live_wire':
      return '×3 PAYOUT';
    case 'circuit_run':
      return genomeV2HasSplice(state, 'splice_perfect_circuit')
        ? '×5 PAYOUT'
        : '×4 PAYOUT';
    case 'coilkeeper': {
      const tier = [...GENOME_V2_CONFIG.coilkeeper.rewardTiers]
        .reverse()
        .find((entry) => sealedAreaCells >= entry.minimumCells);
      const bps = genomeV2HasSplice(state, 'splice_worldcoil')
        ? Math.min(
            GENOME_V2_CONFIG.splices.worldcoilMaximumMultiplierBps,
            (tier?.multiplierBps ?? 0) + sealedAreaCells * 1_000
          )
        : (tier?.multiplierBps ?? 0);
      return bps > 0 ? `×${bps / GENOME_V2_YIELD_SCALE} PAYOUT` : 'SEAL PAYOUT';
    }
    case 'wall_rush':
      return genomeV2HasSplice(state, 'splice_riftline')
        ? '×4 PAYOUT'
        : '×2.5 PAYOUT';
    case 'phase_gate':
      return '×3 VIA GATE';
  }
}

function liveTargetCell(
  target: GenomeV2State['targets'][string],
  foods: readonly GenomeV2Cell[]
): { cell: GenomeV2Cell; leg: 1 | 2 } {
  const secondaryCell = target.secondaryCell;
  if (
    target.kind === 'circuit_run' &&
    secondaryCell &&
    foods.some((food) => sameCell(food, secondaryCell)) &&
    !foods.some((food) => sameCell(food, target.cell))
  ) {
    return { cell: { ...secondaryCell }, leg: 2 };
  }
  return { cell: { ...target.cell }, leg: 1 };
}

/**
 * One renderer-facing inventory derived entirely from the canonical reducer.
 * It does not infer mechanics from held gene IDs, so reconnects and Recode
 * cannot produce a picture that disagrees with the live run.
 */
/**
 * The cells a run's permanent terrain claims — the tick-INDEPENDENT half of
 * the board projection.
 *
 * `projectGenomeV2Board` returns the same set in `occupiedCells`, but it also
 * needs the simulation tick to decide how far each Scar has formed. The trail
 * renderer and the aim telegraph want only the claimed cells: whether a block
 * is lethal YET does not change which cell it sits on, and neither does the
 * fill drawn over it.
 *
 * Split out so those two consumers can subscribe to genome state alone
 * instead of to every movement tick (ET-3). It is verified against the
 * projection's own `occupiedCells` in genomeV2BoardPresentation.test.ts —
 * these two must never disagree.
 */
export function genomeV2OccupiedCells(
  state: GenomeV2State | null
): GenomeV2Cell[] {
  if (!state) return [];
  const occupied = new Map<string, GenomeV2Cell>();
  for (const fact of state.permanentTerrain) {
    for (const cell of fact.cells) {
      occupied.set(cellKey(cell), { ...cell });
    }
  }
  return Array.from(occupied.values());
}

export function projectGenomeV2Board(
  state: GenomeV2State | null,
  foods: readonly GenomeV2Cell[],
  simulationTick: number,
  /** Live heading, so a gate can draw the heading it will hand back. */
  direction: Direction = 'RIGHT'
): GenomeV2BoardProjection {
  if (!state) {
    return { targets: [], gates: [], permanentTerrain: [], occupiedCells: [] };
  }

  const permanentTerrain: GenomeV2BoardTerrainCell[] = [];
  const occupied = new Map<string, GenomeV2Cell>();
  const terrainSource = new Map<string, GenomeV2BoardTerrainSource>();
  const terrainId = new Map<string, string>();
  const terrainForming = new Map<string, number>();
  for (const fact of state.permanentTerrain) {
    // A forming Scar is still a claimed cell - it is drawn, and nothing else
    // may be placed on it - but it is not lethal yet, and the fill says so.
    const solid = genomeV2TerrainSolidAt(fact, simulationTick);
    const total = fact.formingTotalTicks ?? 0;
    const progress = solid || total <= 0
      ? 1
      : clamp01((simulationTick - (fact.formingFromTick ?? 0)) / total);
    for (const cell of fact.cells) {
      const key = cellKey(cell);
      // An overlap is invalid authority, but choosing Scar here keeps the
      // more dangerous traversal consequence visible if malformed history is
      // ever inspected instead of drawing two coplanar blocks.
      const source = fact.source === 'phase_gate_scar'
        ? 'phase_gate_scar'
        : (terrainSource.get(key) ?? 'coilkeeper_seal');
      terrainSource.set(key, source);
      if (fact.source === 'phase_gate_scar' || !terrainId.has(key)) {
        terrainId.set(key, fact.terrainId);
      }
      // A cell claimed twice reads as the closer of the two to lethal: an
      // overlap must never make a block look further away than it is.
      terrainForming.set(key, Math.max(terrainForming.get(key) ?? 0, progress));
      occupied.set(key, { ...cell });
    }
  }
  occupied.forEach((cell, key) => {
    const source = terrainSource.get(key) ?? 'coilkeeper_seal';
    const progress = terrainForming.get(key) ?? 1;
    permanentTerrain.push({
      ...cell,
      source,
      terrainId: terrainId.get(key) ?? `terrain:${key}`,
      forming: progress < 1,
      formingProgress: progress,
    });
  });

  const targets: GenomeV2BoardTarget[] = [];
  const gates: GenomeV2BoardGate[] = [];
  const active = Object.values(state.targets).filter(
    (target) => target.lifecycle === 'active' || target.lifecycle === 'armed'
  );
  for (const target of active) {
    if (target.crownRole === 'future') {
      targets.push({
        targetId: target.targetId,
        kind: 'crown_future',
        lifecycle: target.lifecycle,
        cell: { ...target.cell },
        branchChoice: null,
        leg: 1,
        edible: false,
        collidable: false,
        remainingMoves: null,
        totalMoveBudget: null,
        budgetFraction: null,
        budgetExpired: false,
        rewardLabel: 'NEXT STAR',
        statusLabel: 'GHOST · NOT EDIBLE',
      });
      continue;
    }
    if (target.kind === 'ordinary') continue;

    const elapsed = Math.max(0, Math.floor(simulationTick) - target.spawnTick);
    const remainingMoves = target.moveBudget === null
      ? null
      : Math.max(0, target.moveBudget - elapsed);
    const budgetFraction = target.moveBudget === null
      ? null
      : target.moveBudget <= 0
        ? 0
        : Math.max(0, Math.min(1, remainingMoves! / target.moveBudget));
    const budgetExpired = target.moveBudget !== null && elapsed > target.moveBudget;
    const current = liveTargetCell(target, foods);
    const name = targetName(target.kind);
    const rewardLabel = targetRewardLabel(state, target.kind, target.sealedAreaCells);
    if (
      target.kind === 'gold_trail' &&
      target.forkCell &&
      genomeV2HasSplice(state, 'splice_gilded_fork')
    ) {
      const statusLabel = 'THE BAG · SAFE ×1 OR GREED ×4 / +2 BODY';
      targets.push(
        {
          targetId: target.targetId,
          kind: target.kind,
          lifecycle: target.lifecycle,
          cell: { ...target.cell },
          branchChoice: 'ordinary',
          leg: 1,
          edible: target.edible,
          collidable: target.collidable,
          remainingMoves: null,
          totalMoveBudget: null,
          budgetFraction: null,
          budgetExpired: false,
          rewardLabel: 'SAFE · ×1 PAYOUT',
          statusLabel,
        },
        {
          targetId: target.targetId,
          kind: target.kind,
          lifecycle: target.lifecycle,
          cell: { ...target.forkCell },
          branchChoice: 'gilded',
          leg: 1,
          edible: target.edible,
          collidable: target.collidable,
          remainingMoves: null,
          totalMoveBudget: null,
          budgetFraction: null,
          budgetExpired: false,
          rewardLabel: 'GREED · ×4 PAYOUT · +2 BODY',
          statusLabel,
        }
      );
      continue;
    }
    targets.push({
      targetId: target.targetId,
      kind: target.kind,
      lifecycle: target.lifecycle,
      cell: current.cell,
      branchChoice: null,
      leg: current.leg,
      edible: target.edible,
      collidable: target.collidable,
      remainingMoves,
      totalMoveBudget: target.moveBudget,
      budgetFraction,
      budgetExpired,
      rewardLabel,
      statusLabel: budgetExpired
        ? `${name} · BONUS MISSED`
        : remainingMoves === null
          ? `${name} · ${rewardLabel}`
          : `${name} · ${remainingMoves} MOVE${remainingMoves === 1 ? '' : 'S'} · ${rewardLabel}`,
    });

    if (
      target.optionalRouteCells &&
      target.optionalRouteCells.every((cell) => !occupied.has(cellKey(cell)))
    ) {
      gates.push({
        targetId: target.targetId,
        entry: { ...target.optionalRouteCells[0] },
        exit: { ...target.optionalRouteCells[1] },
        arrivalHeading: direction,
      });
    }
  }

  return {
    targets,
    gates,
    permanentTerrain,
    occupiedCells: Array.from(occupied.values()),
  };
}

/**
 * The rail's compact payout, from the one formatter.
 *
 * This used to be a private duplicate that rendered "42Y" while the Loom
 * rendered "42 Yield" for the same number. The short form is now an option on
 * `genomeV2PresentationFormat.scaledYield`, not a second implementation.
 */
function scaledYield(value: number): string {
  return genomeV2PresentationFormat.scaledYield(value, { short: true });
}

/** Highest-value live facts for the fixed, non-interactive status rail. */
export function buildGenomeV2RuntimeSignals(
  state: GenomeV2State | null,
  board: GenomeV2BoardProjection
): GenomeV2RuntimeSignal[] {
  if (!state) return [];
  const signals: GenomeV2RuntimeSignal[] = [];
  const target = board.targets.find((entry) => entry.kind !== 'crown_future');
  if (target) {
    signals.push({
      id: 'target',
      label: target.statusLabel,
      tone: target.budgetExpired ? 'risk' : 'objective',
    });
  }
  if (state.mirrorLeg) {
    signals.push({
      id: 'mirror',
      label: `SPLIT BET ARMED · BET ${scaledYield(state.ledger.mirrorStake)}`,
      tone: 'risk',
    });
  }
  if (state.loan) {
    signals.push({
      id: 'loan',
      label: `DEAL · ${state.loan.foodsRemaining} LEFT · ON THE TABLE ${scaledYield(state.loan.escrowYield)}`,
      tone: 'risk',
    });
  }
  if (state.bonds > 0) {
    const bankBonus = state.bonds
      * GENOME_V2_CONFIG.compoundInterest.bankBonusPerBondBps
      / 100;
    signals.push({
      id: 'bonds',
      label: `STASH · ${state.bonds}/${GENOME_V2_CONFIG.compoundInterest.maxBonds} · BANK +${bankBonus}%`,
      tone: 'ready',
    });
  }
  if (state.secondLife && !state.secondLife.consumed) {
    signals.push({ id: 'phoenix', label: 'PHOENIX READY', tone: 'ready' });
  }
  if (genomeV2HasGene(state, 'overgrowth') || genomeV2HasSplice(state, 'splice_worldcoil')) {
    signals.push({
      id: 'overgrowth',
      label: 'FEAST · +1 BODY / FOOD · ×1.4–2.5',
      tone: 'pressure',
    });
  }
  if (genomeV2HasGene(state, 'time_dilation')) {
    signals.push({
      id: 'dilation',
      label: 'SLO-MO · SPEED ×0.88 · +1 BODY / 4 FOOD',
      tone: 'pressure',
    });
  }
  if (genomeV2HasGene(state, 'loom_anchor')) {
    signals.push({
      id: 'anchor',
      label: state.anchor.pinnedGeneId
        ? `ON ICE · ${GENOME_V2_GENES[state.anchor.pinnedGeneId].name.toUpperCase()}`
        : `ON ICE · ${state.anchor.charges} SAVE${state.anchor.charges === 1 ? '' : 'S'}`,
      tone: state.anchor.charges > 0 ? 'ready' : 'pressure',
    });
  }
  return signals.slice(0, 3);
}

/**
 * The latest unseen canonical board event, formatted for the cockpit's
 * pointer-transparent status rail. The event ID is the dedupe key; animation
 * never controls authority or acknowledgement.
 */
export function latestGenomeV2BoardFeedback(
  state: GenomeV2State | null,
  seenEventId: string | null
): GenomeV2BoardFeedback | null {
  if (!state) return null;
  for (let index = state.journal.length - 1; index >= 0; index -= 1) {
    const event = state.journal[index];
    if (event.eventId === seenEventId) return null;
    if (event.type === 'target_resolved') {
      const target = state.targets[event.targetId];
      if (!target || target.kind === 'ordinary') continue;
      const success = target.lifecycle === 'completed';
      return {
        eventId: event.eventId,
        label: success
          ? target.kind === 'gold_trail' &&
            genomeV2HasSplice(state, 'splice_gilded_fork')
            ? target.forkChoice === 'gilded'
              ? 'THE BAG · GREED SECURED · ×4 / +2 BODY'
              : 'THE BAG · SAFE BRANCH SECURED · ×1'
            : `${targetName(target.kind)} COMPLETE · ${targetRewardLabel(state, target.kind, target.sealedAreaCells)}`
          : `${targetName(target.kind)} · BONUS MISSED`,
        tone: success ? 'success' : 'warning',
      };
    }
    if (event.type === 'target_window_expired') {
      return {
        eventId: event.eventId,
        label: 'GOLDEN HOUR OVER · THIS FOOD IS ORDINARY',
        tone: 'warning',
      };
    }
    if (event.type === 'phase_gate_used') {
      return {
        eventId: event.eventId,
        label: 'SIDE DOOR USED · 2 SCARS FORMING',
        tone: 'risk',
      };
    }
    if (event.type === 'coil_sealed') {
      return {
        eventId: event.eventId,
        label: `COIL SEALED · ${event.cells.length} CELLS NOW SOLID`,
        tone: 'risk',
      };
    }
    if (event.type === 'phoenix_triggered') {
      return {
        eventId: event.eventId,
        label: `PHOENIX FIRED · +${GENOME_V2_CONFIG.phoenix.growthCost} BODY · ${GENOME_V2_CONFIG.phoenix.phaseTicks}-MOVE PHASE`,
        tone: 'risk',
      };
    }
    if (event.type === 'offer_declined') {
      if (event.pinGeneId) {
        return {
          eventId: event.eventId,
          label: `LOOM ANCHORED · ${event.pinGeneId.replaceAll('_', ' ').toUpperCase()}`,
          tone: 'success',
        };
      }
      if (state.bonds > 0) {
        return {
          eventId: event.eventId,
          label: `COMPOUND BOND ${state.bonds}/${GENOME_V2_CONFIG.compoundInterest.maxBonds} · BANK BONUS ARMED`,
          tone: 'success',
        };
      }
    }
    if (event.type === 'wall_redirected') {
      return {
        eventId: event.eventId,
        label: 'WALL BOUNCE · NEXT FOOD ARMED',
        tone: 'success',
      };
    }
    if (event.type === 'crown_wave_closed') {
      return {
        eventId: event.eventId,
        label: event.outcome === 'perfect'
          ? 'WAVE CLEARED · CROWN PAYOUT SECURED'
          : 'WAVE BROKEN · CROWN PAYOUT LOST',
        tone: event.outcome === 'perfect' ? 'success' : 'warning',
      };
    }
    if (event.type === 'overclock_started') {
      return {
        eventId: event.eventId,
        label: `${event.source === 'zenith_protocol' ? 'REDLINE' : 'TURBO'} ARMED · PAYOUT WINDOW LIVE`,
        tone: 'risk',
      };
    }
    if (event.type === 'overclock_ended') {
      return {
        eventId: event.eventId,
        label: 'BURST WINDOW COMPLETE',
        tone: 'warning',
      };
    }
  }
  return null;
}

export const genomeV2BoardLabels = {
  targetName,
  targetRewardLabel,
  spliceName: (id: keyof typeof GENOME_V2_SPLICES) => GENOME_V2_SPLICES[id].name,
};

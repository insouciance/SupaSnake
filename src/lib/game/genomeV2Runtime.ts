/**
 * Deterministic live/replay adapter for the pure Genome-v2 reducer.
 *
 * Shared code owns offer gravity, target selection, growth, ladders, Splices,
 * ledgers, and every reward. This adapter owns only engine-local identities,
 * board progress between canonical events, and checkpoint cursors.
 */

import type { GenomeV2ActiveGeneId } from '@/shared/game/genes';
import {
  GENOME_RULES_V2,
  GENOME_V2_CONFIG,
  assertGenomeV2PersistenceBound,
  createGenomeV2State,
  genomeV2BodyGrowthDelta,
  genomeV2EventId,
  genomeV2HasGene,
  genomeV2HasLadderTier,
  genomeV2HasSplice,
  genomeV2MechanicEnabled,
  genomeV2OfferInterval,
  previewGenomeV2Recode,
  projectGenomeV2NextTarget,
  reduceGenomeV2Event,
  rollGenomeV2Offer,
  type GenomeV2Cell,
  type GenomeV2Event,
  type GenomeV2ExclusiveTargetKind,
  type GenomeV2Ftue,
  type GenomeV2NextTargetProjection,
  type GenomeV2PhoenixEffect,
  type GenomeV2RecodePreview,
  type GenomeV2SlotIndex,
  type GenomeV2SpliceId,
  type GenomeV2State,
  type GenomeV2TargetState,
} from '@/shared/game/genomeV2';
import type { DynastyName } from '@/shared/game/rulesets';
import type { StrainId, StrainPoints } from '@/shared/game/strains';

type GenomeV2EventFacts = GenomeV2Event extends infer Event
  ? Event extends GenomeV2Event
    ? Omit<Event, 'index' | 'tick' | 'eventId'>
    : never
  : never;

const SNAPSHOT_VERSION = 1 as const;

interface GenomeV2TargetProgress {
  targetId: string;
  circuitLegsCompleted: 0 | 1;
  usedOptionalRoute: boolean;
}

/** Reducer state persists once in `GameState.genomeV2`; this holds cursors only. */
export interface GenomeV2RuntimeSnapshot {
  version: typeof SNAPSHOT_VERSION;
  cadenceOfferCount: number;
  nextCadenceOfferAtFood: number;
  targetOrdinal: number;
  portalOrdinal: number;
  instanceOrdinal: number;
  terrainOrdinal: number;
  territoryOrdinal: number;
  activationOrdinal: number;
  waveOrdinal: number;
  targetProgress: GenomeV2TargetProgress[];
}

export interface GenomeV2RuntimeOptions {
  runSeed: string;
  dynasty: DynastyName;
  pool?: readonly GenomeV2ActiveGeneId[];
  ftue?: GenomeV2Ftue;
  startingStrainPoints?: StrainPoints;
  offerTiltStrain?: StrainId | null;
  suppressedStrains?: readonly StrainId[];
  strainThresholdDelta?: Readonly<Partial<Record<StrainId, number>>>;
  externalSecondLife?: 'iron_scales' | 'other' | null;
  reducerState?: GenomeV2State;
  snapshot?: GenomeV2RuntimeSnapshot;
  onEvent?: (event: GenomeV2Event) => void;
}

export interface GenomeV2OfferFacts {
  offerId: string;
  candidates: readonly [GenomeV2ActiveGeneId, GenomeV2ActiveGeneId];
  pinnedGeneId: GenomeV2ActiveGeneId | null;
}

export interface GenomeV2AcquisitionResult {
  geneId: GenomeV2ActiveGeneId;
  slot: GenomeV2SlotIndex;
  recoded: boolean;
  growthCharged: number;
}

export interface GenomeV2SpawnFacts {
  targetId: string;
  target: GenomeV2TargetState;
  projection: GenomeV2NextTargetProjection;
}

export interface GenomeV2TargetResolutionResult {
  targetId: string;
  kind: GenomeV2TargetState['kind'];
  lifecycle: GenomeV2TargetState['lifecycle'];
  collectedUnits: 0 | 1;
  bodyGrowthDelta: number;
}

export interface GenomeV2CircuitAdvance {
  targetId: string;
  destination: GenomeV2Cell;
}

export interface GenomeV2PhaseGatePreview {
  targetId: string;
  cells: readonly [GenomeV2Cell, GenomeV2Cell];
}

export interface GenomeV2CrownAdvance {
  outcome: 'perfect' | 'failed';
  crownTargetId: string | null;
  crownCell: GenomeV2Cell | null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`Invalid Genome v2 runtime ${label}.`);
  }
  return value as number;
}

function cellKey(cell: GenomeV2Cell): string {
  return `${cell.x}:${cell.z}`;
}

function sameCell(a: GenomeV2Cell, b: GenomeV2Cell): boolean {
  return a.x === b.x && a.z === b.z;
}

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((entry, index) => sameJson(entry, b[index]))
    );
  }
  if (
    typeof a !== 'object' ||
    a === null ||
    typeof b !== 'object' ||
    b === null
  ) {
    return false;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && sameJson(left[key], right[key])
    )
  );
}

function activeTargets(state: GenomeV2State): GenomeV2TargetState[] {
  return Object.values(state.targets)
    .filter((target) => ['active', 'armed'].includes(target.lifecycle))
    .sort(
      (a, b) =>
        a.spawnTick - b.spawnTick || a.targetId.localeCompare(b.targetId)
    );
}

function mechanicInstances(state: GenomeV2State, geneId: GenomeV2ActiveGeneId) {
  if (!genomeV2MechanicEnabled(state, geneId)) return [];
  return Object.values(state.instances)
    .filter(
      (instance) =>
        (instance.status === 'active' || instance.status === 'spliced') &&
        instance.geneId === geneId
    )
    .sort((a, b) => a.acquisitionOrdinal - b.acquisitionOrdinal);
}

/** Shortest legal orthogonal route on the current board. */
export function shortestGenomeV2Route(
  gridSize: number,
  start: GenomeV2Cell,
  destination: GenomeV2Cell,
  blockedCells: readonly GenomeV2Cell[],
  torus: boolean
): GenomeV2Cell[] | null {
  if (gridSize < 1) return null;
  const blocked = new Set(blockedCells.map(cellKey));
  blocked.delete(cellKey(start));
  blocked.delete(cellKey(destination));
  const startKey = cellKey(start);
  const destinationKey = cellKey(destination);
  const queue: GenomeV2Cell[] = [{ ...start }];
  let cursor = 0;
  const previous = new Map<string, string | null>([[startKey, null]]);
  const cells = new Map<string, GenomeV2Cell>([[startKey, { ...start }]]);
  const offsets = [
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
  ];

  while (cursor < queue.length) {
    const current = queue[cursor++];
    const currentKey = cellKey(current);
    if (currentKey === destinationKey) {
      const path: GenomeV2Cell[] = [];
      let key: string | null = currentKey;
      while (key !== null) {
        path.push(cells.get(key)!);
        key = previous.get(key) ?? null;
      }
      return path.reverse();
    }
    for (const offset of offsets) {
      let x = current.x + offset.x;
      let z = current.z + offset.z;
      if (torus) {
        x = ((x % gridSize) + gridSize) % gridSize;
        z = ((z % gridSize) + gridSize) % gridSize;
      } else if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) {
        continue;
      }
      const next = { x, z };
      const key = cellKey(next);
      if (blocked.has(key) || previous.has(key)) continue;
      previous.set(key, currentKey);
      cells.set(key, next);
      queue.push(next);
    }
  }
  return null;
}

/**
 * Deterministic Circuit geometry. The visible first leg lies on a safe route;
 * the ordinary food cell becomes leg two, so the pair awards one growth unit.
 */
export function genomeV2CircuitRoute(
  gridSize: number,
  start: GenomeV2Cell,
  destination: GenomeV2Cell,
  blockedCells: readonly GenomeV2Cell[],
  torus: boolean
): { relay: GenomeV2Cell; shortestSafeMoves: number } | null {
  const direct = shortestGenomeV2Route(
    gridSize,
    start,
    destination,
    blockedCells,
    torus
  );
  if (!direct) return null;
  if (direct.length >= 3) {
    const relay = direct[Math.max(1, Math.floor((direct.length - 1) / 2))];
    if (!sameCell(relay, destination) && !sameCell(relay, start)) {
      return { relay: { ...relay }, shortestSafeMoves: direct.length - 1 };
    }
  }

  const blocked = new Set(blockedCells.map(cellKey));
  const offsets = [
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
  ];
  for (const offset of offsets) {
    let x = start.x + offset.x;
    let z = start.z + offset.z;
    if (torus) {
      x = ((x % gridSize) + gridSize) % gridSize;
      z = ((z % gridSize) + gridSize) % gridSize;
    } else if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) {
      continue;
    }
    const relay = { x, z };
    if (sameCell(relay, destination) || blocked.has(cellKey(relay))) {
      continue;
    }
    const second = shortestGenomeV2Route(
      gridSize,
      relay,
      destination,
      blockedCells,
      torus
    );
    if (second) {
      return {
        relay,
        shortestSafeMoves: 1 + Math.max(0, second.length - 1),
      };
    }
  }
  return null;
}

/** Safe entry/exit pair for an optional Phase shortcut. */
export function genomeV2PhaseRoute(
  gridSize: number,
  start: GenomeV2Cell,
  destination: GenomeV2Cell,
  blockedCells: readonly GenomeV2Cell[],
  torus: boolean
): readonly [GenomeV2Cell, GenomeV2Cell] | null {
  const route = shortestGenomeV2Route(
    gridSize,
    start,
    destination,
    blockedCells,
    torus
  );
  if (!route) return null;
  if (route.length >= 4) {
    const entry = route[1];
    const exit = route[route.length - 2];
    if (
      !sameCell(entry, exit) &&
      !sameCell(entry, destination) &&
      !sameCell(exit, destination)
    ) {
      return [{ ...entry }, { ...exit }];
    }
  }

  // A close target can still offer an honest optional route: choose a legal
  // first step and a distinct legal cell adjacent to the destination. This is
  // deterministic and avoids consuming a queued Phase contract merely because
  // the ordinary food happened to spawn fewer than three moves away.
  const blocked = new Set(blockedCells.map(cellKey));
  const offsets = [
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
  ];
  const neighbours = (cell: GenomeV2Cell): GenomeV2Cell[] =>
    offsets.flatMap((offset) => {
      let x = cell.x + offset.x;
      let z = cell.z + offset.z;
      if (torus) {
        x = ((x % gridSize) + gridSize) % gridSize;
        z = ((z % gridSize) + gridSize) % gridSize;
      } else if (x < 0 || x >= gridSize || z < 0 || z >= gridSize) {
        return [];
      }
      return [{ x, z }];
    });
  for (const entry of neighbours(start)) {
    if (
      sameCell(entry, start) ||
      sameCell(entry, destination) ||
      blocked.has(cellKey(entry))
    ) {
      continue;
    }
    for (const exit of neighbours(destination)) {
      if (
        sameCell(exit, entry) ||
        sameCell(exit, destination) ||
        blocked.has(cellKey(exit))
      ) {
        continue;
      }
      return [{ ...entry }, { ...exit }];
    }
  }
  return null;
}

/**
 * Find newly enclosed free cells. Protected objectives invalidate their whole
 * component; filtering just the objective cell would seal a trap around it.
 */
export function enclosedGenomeV2Cells(
  gridSize: number,
  occupiedCells: readonly GenomeV2Cell[],
  protectedCells: readonly GenomeV2Cell[],
  torus: boolean
): GenomeV2Cell[] {
  const occupied = new Set(occupiedCells.map(cellKey));
  const protectedSet = new Set(protectedCells.map(cellKey));
  const visited = new Set<string>();
  const components: Array<{
    cells: GenomeV2Cell[];
    touchesEdge: boolean;
    containsProtected: boolean;
  }> = [];
  const offsets = [
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
  ];

  for (let x = 0; x < gridSize; x += 1) {
    for (let z = 0; z < gridSize; z += 1) {
      const seed = { x, z };
      const seedKey = cellKey(seed);
      if (occupied.has(seedKey) || visited.has(seedKey)) continue;
      const queue = [seed];
      let cursor = 0;
      const cells: GenomeV2Cell[] = [];
      let touchesEdge = false;
      let containsProtected = false;
      visited.add(seedKey);
      while (cursor < queue.length) {
        const current = queue[cursor++];
        cells.push(current);
        containsProtected ||= protectedSet.has(cellKey(current));
        if (
          current.x === 0 ||
          current.z === 0 ||
          current.x === gridSize - 1 ||
          current.z === gridSize - 1
        ) {
          touchesEdge = true;
        }
        for (const offset of offsets) {
          let nx = current.x + offset.x;
          let nz = current.z + offset.z;
          if (torus) {
            nx = ((nx % gridSize) + gridSize) % gridSize;
            nz = ((nz % gridSize) + gridSize) % gridSize;
          } else if (nx < 0 || nx >= gridSize || nz < 0 || nz >= gridSize) {
            continue;
          }
          const next = { x: nx, z: nz };
          const key = cellKey(next);
          if (occupied.has(key) || visited.has(key)) continue;
          visited.add(key);
          queue.push(next);
        }
      }
      components.push({ cells, touchesEdge, containsProtected });
    }
  }

  const eligible = components.filter(
    (component) => !component.containsProtected
  );
  const enclosed = torus
    ? [...eligible]
        .sort((a, b) => b.cells.length - a.cells.length)
        .slice(1)
        .flatMap((component) => component.cells)
    : eligible
        .filter((component) => !component.touchesEdge)
        .flatMap((component) => component.cells);
  return enclosed.sort((a, b) => a.x - b.x || a.z - b.z);
}

export class GenomeV2Runtime {
  private readonly initialState: GenomeV2State;
  private readonly onEvent?: (event: GenomeV2Event) => void;
  private state: GenomeV2State;
  private cadenceOfferCount = 0;
  private nextCadenceOfferAtFood = 4;
  private targetOrdinal = 0;
  private portalOrdinal = 0;
  private instanceOrdinal = 0;
  private terrainOrdinal = 0;
  private territoryOrdinal = 0;
  private activationOrdinal = 0;
  private waveOrdinal = 0;
  private targetProgress = new Map<string, GenomeV2TargetProgress>();

  constructor(options: GenomeV2RuntimeOptions) {
    const reducerState = options.reducerState
      ? clone(options.reducerState)
      : createGenomeV2State(options.dynasty, {
          runSeed: options.runSeed,
          genePool: options.pool,
          ftue: options.ftue,
          splicesEnabled: options.ftue?.splicesUnlocked,
          externalSecondLife: options.externalSecondLife,
          startingStrainPoints: options.startingStrainPoints,
          offerTiltStrain: options.offerTiltStrain,
          suppressedStrains: options.suppressedStrains,
          strainThresholdDelta: options.strainThresholdDelta,
        });
    if (
      reducerState.v !== GENOME_RULES_V2 ||
      reducerState.dynasty !== options.dynasty ||
      reducerState.runSeed !== options.runSeed
    ) {
      throw new Error('Genome v2 reducer state is not bound to its run start.');
    }
    if (options.pool && !sameJson(reducerState.genePool, options.pool)) {
      throw new Error(
        'Genome v2 reducer pool differs from its run-start stamp.'
      );
    }
    if (options.ftue && !sameJson(reducerState.ftue, options.ftue)) {
      throw new Error(
        'Genome v2 reducer FTUE differs from its run-start stamp.'
      );
    }
    if (
      options.startingStrainPoints &&
      !sameJson(reducerState.startingStrainPoints, options.startingStrainPoints)
    ) {
      throw new Error(
        'Genome v2 starting points differ from their run-start stamp.'
      );
    }
    if (
      options.offerTiltStrain !== undefined &&
      reducerState.offerTiltStrain !== options.offerTiltStrain
    ) {
      throw new Error('Genome v2 offer tilt differs from its run-start stamp.');
    }
    if (
      options.suppressedStrains &&
      !sameJson(reducerState.suppressedStrains, options.suppressedStrains)
    ) {
      throw new Error(
        'Genome v2 suppression differs from its run-start stamp.'
      );
    }
    if (
      options.strainThresholdDelta &&
      !sameJson(reducerState.strainThresholdDelta, options.strainThresholdDelta)
    ) {
      throw new Error(
        'Genome v2 thresholds differ from their run-start stamp.'
      );
    }
    if (
      options.externalSecondLife !== undefined &&
      reducerState.externalSecondLife !== options.externalSecondLife
    ) {
      throw new Error('Genome v2 second-life stamp differs from live physics.');
    }
    if (reducerState.secondLife && reducerState.externalSecondLife !== null) {
      throw new Error('Genome v2 run start contains two second lives.');
    }
    this.initialState = clone(reducerState);
    this.state = clone(reducerState);
    this.onEvent = options.onEvent;
    if (!options.snapshot && activeTargets(this.state).length > 0) {
      throw new Error(
        'Active Genome v2 reducer state requires its runtime snapshot.'
      );
    }
    if (options.snapshot) this.restoreSnapshot(options.snapshot);
    assertGenomeV2PersistenceBound(this.state);
  }

  reset(): void {
    this.state = clone(this.initialState);
    this.cadenceOfferCount = 0;
    this.nextCadenceOfferAtFood = 4;
    this.targetOrdinal = 0;
    this.portalOrdinal = 0;
    this.instanceOrdinal = 0;
    this.terrainOrdinal = 0;
    this.territoryOrdinal = 0;
    this.activationOrdinal = 0;
    this.waveOrdinal = 0;
    this.targetProgress.clear();
  }

  getState(): GenomeV2State {
    return clone(this.state);
  }

  snapshot(): GenomeV2RuntimeSnapshot {
    assertGenomeV2PersistenceBound(this.state);
    return {
      version: SNAPSHOT_VERSION,
      cadenceOfferCount: this.cadenceOfferCount,
      nextCadenceOfferAtFood: this.nextCadenceOfferAtFood,
      targetOrdinal: this.targetOrdinal,
      portalOrdinal: this.portalOrdinal,
      instanceOrdinal: this.instanceOrdinal,
      terrainOrdinal: this.terrainOrdinal,
      territoryOrdinal: this.territoryOrdinal,
      activationOrdinal: this.activationOrdinal,
      waveOrdinal: this.waveOrdinal,
      targetProgress: Array.from(this.targetProgress.values()).map(clone),
    };
  }

  private restoreSnapshot(snapshot: GenomeV2RuntimeSnapshot): void {
    if (snapshot?.version !== SNAPSHOT_VERSION) {
      throw new Error('Unsupported Genome v2 runtime snapshot.');
    }
    this.cadenceOfferCount = integer(
      snapshot.cadenceOfferCount,
      'cadence offer count'
    );
    this.nextCadenceOfferAtFood = integer(
      snapshot.nextCadenceOfferAtFood,
      'next cadence food',
      1
    );
    this.targetOrdinal = integer(snapshot.targetOrdinal, 'target ordinal');
    this.portalOrdinal = integer(snapshot.portalOrdinal, 'portal ordinal');
    this.instanceOrdinal = integer(
      snapshot.instanceOrdinal,
      'instance ordinal'
    );
    this.terrainOrdinal = integer(snapshot.terrainOrdinal, 'terrain ordinal');
    this.territoryOrdinal = integer(
      snapshot.territoryOrdinal,
      'territory ordinal'
    );
    this.activationOrdinal = integer(
      snapshot.activationOrdinal,
      'activation ordinal'
    );
    this.waveOrdinal = integer(snapshot.waveOrdinal, 'wave ordinal');
    if (!Array.isArray(snapshot.targetProgress)) {
      throw new Error('Invalid Genome v2 target progress snapshot.');
    }
    const progress = new Map<string, GenomeV2TargetProgress>();
    for (const entry of snapshot.targetProgress) {
      const target = this.state.targets[entry?.targetId];
      if (
        !target ||
        !['active', 'armed'].includes(target.lifecycle) ||
        progress.has(entry.targetId) ||
        (entry.circuitLegsCompleted !== 0 &&
          entry.circuitLegsCompleted !== 1) ||
        typeof entry.usedOptionalRoute !== 'boolean'
      ) {
        throw new Error('Invalid Genome v2 target progress snapshot.');
      }
      progress.set(entry.targetId, clone(entry));
    }
    const targets = activeTargets(this.state);
    if (
      progress.size !== targets.length ||
      targets.some((target) => !progress.has(target.targetId))
    ) {
      throw new Error(
        'Genome v2 target progress does not match its active targets.'
      );
    }
    this.targetProgress = progress;
  }

  private stableId(domain: string, ordinal: number): string {
    return `${domain}:${genomeV2EventId(this.state.runSeed, ordinal)}`;
  }

  private apply(
    facts: GenomeV2EventFacts,
    tick: number
  ): { event: GenomeV2Event; bodyGrowthDelta: number } {
    const event = {
      ...facts,
      index: this.state.eventIndex + 1,
      tick: Math.max(this.state.tick, Math.floor(tick)),
      eventId: genomeV2EventId(this.state.runSeed, this.state.eventIndex + 1),
    } as GenomeV2Event;
    const previous = this.state;
    const next = reduceGenomeV2Event(previous, event);
    const bodyGrowthDelta = genomeV2BodyGrowthDelta(previous, next);
    assertGenomeV2PersistenceBound(next);
    this.state = next;
    this.onEvent?.(clone(event));
    return { event, bodyGrowthDelta };
  }

  private rollOffer(): GenomeV2OfferFacts | null {
    const roll = rollGenomeV2Offer(this.state, this.state.offerCount);
    if (!roll) return null;
    return {
      offerId: this.stableId('offer', this.state.offerCount + 1),
      candidates: roll.candidates,
      pinnedGeneId: this.state.anchor.pinnedGeneId,
    };
  }

  cadenceOfferDue(foodCount: number): boolean {
    return (
      this.state.offer === null &&
      this.state.portal === null &&
      foodCount >= this.nextCadenceOfferAtFood
    );
  }

  openCadenceOffer(tick: number, foodCount: number): GenomeV2OfferFacts | null {
    if (!this.cadenceOfferDue(foodCount)) return null;
    const offer = this.rollOffer();
    if (!offer) {
      this.nextCadenceOfferAtFood = Number.MAX_SAFE_INTEGER;
      return null;
    }
    // Portal and cadence choices share one authoritative offer stream. The
    // interval is rolled from the same pre-open offer index as the candidates,
    // so opening a portal can advance later 4–6-food cadence entropy without
    // maintaining a second, divergent RNG history.
    const interval = genomeV2OfferInterval(this.state, this.state.offerCount);
    this.cadenceOfferCount += 1;
    this.nextCadenceOfferAtFood = foodCount + interval;
    this.apply(
      {
        type: 'offer_opened',
        offerId: offer.offerId,
        source: 'cadence',
        candidates: offer.candidates,
        pinnedGeneId: offer.pinnedGeneId,
      },
      tick
    );
    return offer;
  }

  previewOfferRecode(
    candidateIndex: 0 | 1,
    slot: GenomeV2SlotIndex
  ): GenomeV2RecodePreview | null {
    const offer = this.state.offer;
    const replacementGeneId = offer?.candidateGeneIds[candidateIndex];
    if (!offer || !replacementGeneId) return null;
    try {
      return previewGenomeV2Recode(this.state, {
        source: 'loom',
        offerId: offer.offerId,
        replacementGeneId,
        slot,
      });
    } catch {
      return null;
    }
  }

  acquireOfferCandidate(
    candidateIndex: 0 | 1,
    tick: number,
    slot?: GenomeV2SlotIndex
  ): GenomeV2AcquisitionResult | null {
    const offer = this.state.offer;
    const geneId = offer?.candidateGeneIds[candidateIndex];
    if (!offer || !geneId) return null;
    const openSlot = this.state.slots.find(
      (entry) => entry.occupant === null
    )?.index;
    if (openSlot !== undefined) {
      const targetSlot = slot ?? openSlot;
      if (this.state.slots[targetSlot]?.occupant !== null) return null;
      const ordinal = this.instanceOrdinal + 1;
      this.apply(
        {
          type: 'gene_acquired',
          offerId: offer.offerId,
          instanceId: this.stableId('gene', ordinal),
          geneId,
          slot: targetSlot,
          source: 'offer',
        },
        tick
      );
      this.instanceOrdinal = ordinal;
      return {
        geneId,
        slot: targetSlot,
        recoded: false,
        growthCharged: 0,
      };
    }
    if (slot === undefined) return null;
    const preview = this.previewOfferRecode(candidateIndex, slot);
    if (!preview) return null;
    const ordinal = this.instanceOrdinal + 1;
    const applied = this.apply(
      {
        type: 'offer_recoded',
        source: 'loom',
        offerId: offer.offerId,
        instanceId: this.stableId('gene', ordinal),
        replacementGeneId: geneId,
        slot,
        growthCharged: preview.growthCharged,
      },
      tick
    );
    this.instanceOrdinal = ordinal;
    return {
      geneId,
      slot,
      recoded: true,
      growthCharged: applied.bodyGrowthDelta,
    };
  }

  declineOffer(
    tick: number,
    options: { pinCandidateIndex?: 0 | 1 } = {}
  ): boolean {
    const offer = this.state.offer;
    if (!offer) return false;
    const pinGeneId =
      options.pinCandidateIndex === undefined
        ? undefined
        : offer.candidateGeneIds[options.pinCandidateIndex];
    if (options.pinCandidateIndex !== undefined && !pinGeneId) return false;
    try {
      this.apply(
        {
          type: 'offer_declined',
          offerId: offer.offerId,
          ...(pinGeneId ? { pinGeneId } : {}),
        },
        tick
      );
      return true;
    } catch {
      return false;
    }
  }

  openPortal(
    tick: number,
    options: { includeGenomeOffer?: boolean } = {}
  ): string {
    if (this.state.portal) return this.state.portal.portalId;
    const ordinal = this.portalOrdinal + 1;
    const portalId = this.stableId('portal', ordinal);
    const rolled =
      options.includeGenomeOffer !== false &&
      this.state.ftue.portalGenomeUnlocked &&
      this.state.portalGenomeActions < GENOME_V2_CONFIG.portalGenome.maxActions
        ? this.rollOffer()
        : null;
    this.apply(
      {
        type: 'portal_opened',
        portalId,
        genomeOffer: rolled
          ? { offerId: rolled.offerId, candidates: rolled.candidates }
          : null,
      },
      tick
    );
    this.portalOrdinal = ordinal;
    return portalId;
  }

  inspectPortalCandidate(candidateIndex: 0 | 1): GenomeV2ActiveGeneId | null {
    return this.state.portal?.genomeOffer?.candidates[candidateIndex] ?? null;
  }

  previewPortalRecode(
    candidateIndex: 0 | 1,
    slot: GenomeV2SlotIndex
  ): GenomeV2RecodePreview | null {
    const portal = this.state.portal;
    const replacementGeneId = portal?.genomeOffer?.candidates[candidateIndex];
    if (!portal?.genomeOffer || !replacementGeneId) return null;
    try {
      return previewGenomeV2Recode(this.state, {
        source: 'portal',
        offerId: portal.genomeOffer.offerId,
        replacementGeneId,
        slot,
      });
    } catch {
      return null;
    }
  }

  continuePortal(tick: number, activateMirror: boolean): boolean {
    const portalId = this.state.portal?.portalId;
    if (!portalId || !this.state.ftue.continueUnlocked) return false;
    try {
      this.apply({ type: 'portal_continued', portalId, activateMirror }, tick);
      return true;
    } catch {
      return false;
    }
  }

  expirePortal(tick: number): boolean {
    const portalId = this.state.portal?.portalId;
    if (!portalId) return false;
    this.apply({ type: 'portal_expired', portalId }, tick);
    return true;
  }

  bankPortal(tick: number): boolean {
    const portalId = this.state.portal?.portalId;
    if (!portalId) return false;
    this.apply({ type: 'portal_bank', portalId }, tick);
    return true;
  }

  resolvePortalMutation(
    candidateIndex: 0 | 1,
    tick: number,
    slot?: GenomeV2SlotIndex
  ): GenomeV2AcquisitionResult | null {
    const portal = this.state.portal;
    const geneId = portal?.genomeOffer?.candidates[candidateIndex];
    if (
      !portal?.genomeOffer ||
      !geneId ||
      !this.state.ftue.portalGenomeUnlocked
    ) {
      return null;
    }
    const openSlot = this.state.slots.find(
      (entry) => entry.occupant === null
    )?.index;
    if (openSlot !== undefined) {
      const targetSlot = slot ?? openSlot;
      if (this.state.slots[targetSlot]?.occupant !== null) return null;
      const growthCharged =
        GENOME_V2_CONFIG.portalGenome.infuseGrowth[
          this.state.portalGenomeActions
        ] ?? 0;
      if (growthCharged <= 0) return null;
      const ordinal = this.instanceOrdinal + 1;
      const applied = this.apply(
        {
          type: 'portal_infuse',
          portalId: portal.portalId,
          offerId: portal.genomeOffer.offerId,
          instanceId: this.stableId('gene', ordinal),
          geneId,
          slot: targetSlot,
          growthCharged,
        },
        tick
      );
      this.instanceOrdinal = ordinal;
      return {
        geneId,
        slot: targetSlot,
        recoded: false,
        growthCharged: applied.bodyGrowthDelta,
      };
    }
    if (slot === undefined) return null;
    const preview = this.previewPortalRecode(candidateIndex, slot);
    if (!preview) return null;
    const ordinal = this.instanceOrdinal + 1;
    const applied = this.apply(
      {
        type: 'offer_recoded',
        source: 'portal',
        offerId: portal.genomeOffer.offerId,
        instanceId: this.stableId('gene', ordinal),
        replacementGeneId: geneId,
        slot,
        growthCharged: preview.growthCharged,
      },
      tick
    );
    this.instanceOrdinal = ordinal;
    return {
      geneId,
      slot,
      recoded: true,
      growthCharged: applied.bodyGrowthDelta,
    };
  }

  projectNextTarget(cadenceEligible = true): GenomeV2NextTargetProjection {
    return projectGenomeV2NextTarget(this.state, { cadenceEligible });
  }

  spawnTarget(
    tick: number,
    facts: {
      cell: GenomeV2Cell;
      secondaryCell?: GenomeV2Cell | null;
      optionalRouteCells?: readonly [GenomeV2Cell, GenomeV2Cell] | null;
      speedAtSpawnMs: number;
      shortestSafeMoves: number;
      cadenceEligible?: boolean;
      crownRole?: 'current' | 'future' | 'crown' | null;
    }
  ): GenomeV2SpawnFacts {
    const cadenceEligible = facts.cadenceEligible ?? true;
    const projection = this.projectNextTarget(cadenceEligible);
    const ordinal = this.targetOrdinal + 1;
    const targetId = this.stableId('target', ordinal);
    this.apply(
      {
        type: 'target_spawned',
        targetId,
        cell: facts.cell,
        secondaryCell: facts.secondaryCell ?? null,
        optionalRouteCells: facts.optionalRouteCells ?? null,
        speedAtSpawnMs: Math.max(1, Math.floor(facts.speedAtSpawnMs)),
        shortestSafeMoves: Math.max(0, Math.floor(facts.shortestSafeMoves)),
        cadenceEligible,
        crownRole: facts.crownRole ?? null,
      },
      tick
    );
    this.targetOrdinal = ordinal;
    this.targetProgress.set(targetId, {
      targetId,
      circuitLegsCompleted: 0,
      usedOptionalRoute: false,
    });
    return {
      targetId,
      target: clone(this.state.targets[targetId]),
      projection,
    };
  }

  targetAt(cell: GenomeV2Cell): GenomeV2TargetState | null {
    return (
      activeTargets(this.state)
        .filter((target) => target.edible && target.collidable)
        .find((target) => {
          const progress = this.targetProgress.get(target.targetId);
          const liveCell =
            target.kind === 'circuit_run' &&
            progress?.circuitLegsCompleted === 1 &&
            target.secondaryCell
              ? target.secondaryCell
              : target.cell;
          return sameCell(liveCell, cell);
        }) ?? null
    );
  }

  advanceCircuitLegAt(cell: GenomeV2Cell): GenomeV2CircuitAdvance | null {
    const target = activeTargets(this.state).find(
      (candidate) =>
        candidate.kind === 'circuit_run' &&
        candidate.edible &&
        candidate.collidable &&
        sameCell(candidate.cell, cell) &&
        this.targetProgress.get(candidate.targetId)?.circuitLegsCompleted === 0
    );
    if (!target?.secondaryCell) return null;
    const progress = this.targetProgress.get(target.targetId)!;
    progress.circuitLegsCompleted = 1;
    return {
      targetId: target.targetId,
      destination: { ...target.secondaryCell },
    };
  }

  collectedUnitsForTargetResolution(
    targetId: string,
    resolution: 'collected' | 'missed' | 'expired'
  ): 0 | 1 {
    const target = this.state.targets[targetId];
    if (!target || !['active', 'armed'].includes(target.lifecycle)) return 0;
    if (resolution === 'collected') return 1;
    if (target.circuitLegsRequired !== 2) return 0;
    return this.targetProgress.get(targetId)?.circuitLegsCompleted === 1
      ? 1
      : 0;
  }

  resolveTarget(
    targetId: string,
    tick: number,
    facts: {
      resolution: 'collected' | 'missed' | 'expired';
      movesUsed: number;
      baseYield: number;
      pressureBps: number;
    }
  ): GenomeV2TargetResolutionResult | null {
    const target = this.state.targets[targetId];
    if (!target || !['active', 'armed'].includes(target.lifecycle)) return null;
    const progress = this.targetProgress.get(targetId) ?? {
      targetId,
      circuitLegsCompleted: 0 as const,
      usedOptionalRoute: false,
    };
    const circuitLegsCompleted =
      target.circuitLegsRequired === 2
        ? facts.resolution === 'collected' &&
          progress.circuitLegsCompleted === 1
          ? 2
          : progress.circuitLegsCompleted
        : undefined;
    const collectedUnits = this.collectedUnitsForTargetResolution(
      targetId,
      facts.resolution
    );
    const applied = this.apply(
      {
        type: 'target_resolved',
        targetId,
        resolution: facts.resolution,
        movesUsed: Math.max(0, Math.floor(facts.movesUsed)),
        baseYield: Math.max(0, Math.floor(facts.baseYield)),
        pressureBps: Math.min(
          10_000,
          Math.max(0, Math.floor(facts.pressureBps))
        ),
        collectedUnits: collectedUnits as 0 | 1,
        ...(circuitLegsCompleted !== undefined
          ? { circuitLegsCompleted: circuitLegsCompleted as 0 | 1 | 2 }
          : {}),
        ...(target.optionalRouteCells
          ? { usedOptionalRoute: progress.usedOptionalRoute }
          : {}),
      },
      tick
    );
    this.targetProgress.delete(targetId);
    return {
      targetId,
      kind: target.kind,
      lifecycle: this.state.targets[targetId]?.lifecycle ?? 'expired',
      collectedUnits,
      bodyGrowthDelta: applied.bodyGrowthDelta,
    };
  }

  expireGoldWindows(tick: number): string[] {
    const expired = activeTargets(this.state)
      .filter(
        (target) =>
          target.kind === 'gold_trail' &&
          target.lifecycle === 'active' &&
          target.expiresAtTick !== null &&
          target.expiresAtTick < tick
      )
      .map((target) => target.targetId);
    for (const targetId of expired) {
      this.apply({ type: 'target_window_expired', targetId }, tick);
    }
    return expired;
  }

  chooseGildedFork(
    targetId: string,
    choice: 'ordinary' | 'gilded',
    tick: number
  ): boolean {
    const target = this.state.targets[targetId];
    if (!target || target.forkChoice !== null) return false;
    try {
      this.apply({ type: 'gilded_fork_chosen', targetId, choice }, tick);
      return true;
    } catch {
      return false;
    }
  }

  phaseGateAtEntry(cell: GenomeV2Cell): GenomeV2PhaseGatePreview | null {
    const target = activeTargets(this.state).find((candidate) => {
      const progress = this.targetProgress.get(candidate.targetId);
      return (
        candidate.optionalRouteCells !== null &&
        progress?.usedOptionalRoute === false &&
        sameCell(candidate.optionalRouteCells[0], cell)
      );
    });
    if (!target?.optionalRouteCells) return null;
    return {
      targetId: target.targetId,
      cells: clone(target.optionalRouteCells),
    };
  }

  usePhaseGate(targetId: string, tick: number): boolean {
    const target = this.state.targets[targetId];
    const progress = this.targetProgress.get(targetId);
    if (
      !target?.optionalRouteCells ||
      !progress ||
      progress.usedOptionalRoute
    ) {
      return false;
    }
    const ordinal = this.terrainOrdinal + 1;
    this.apply(
      {
        type: 'phase_gate_used',
        terrainId: this.stableId('terrain', ordinal),
        targetId,
        cells: target.optionalRouteCells,
      },
      tick
    );
    this.terrainOrdinal = ordinal;
    progress.usedOptionalRoute = true;
    return true;
  }

  canWallRedirect(): boolean {
    return (
      mechanicInstances(this.state, 'wall_rush').length > 0 &&
      this.state.wallRushCharges > 0
    );
  }

  recordWallRedirect(tick: number): boolean {
    const instance = mechanicInstances(this.state, 'wall_rush')[0];
    if (!instance) return false;
    try {
      this.apply(
        { type: 'wall_redirected', sourceInstanceId: instance.instanceId },
        tick
      );
      return true;
    } catch {
      return false;
    }
  }

  recordPhoenix(
    tick: number
  ): { bodyGrowthDelta: number; effect: GenomeV2PhoenixEffect } | null {
    const life = this.state.secondLife;
    if (!life || life.consumed) return null;
    const applied = this.apply(
      { type: 'phoenix_triggered', sourceInstanceId: life.phoenixInstanceId },
      tick
    );
    const effect = this.state.lastPhoenixEffect;
    if (!effect) throw new Error('Genome v2 Phoenix produced no effect facts.');
    return { bodyGrowthDelta: applied.bodyGrowthDelta, effect: clone(effect) };
  }

  recordCoilSeal(tick: number, cells: readonly GenomeV2Cell[]): string | null {
    if (cells.length < GENOME_V2_CONFIG.coilkeeper.minimumSealedCells)
      return null;
    const ordinal = this.terrainOrdinal + 1;
    const terrainId = this.stableId('terrain', ordinal);
    try {
      this.apply({ type: 'coil_sealed', terrainId, cells }, tick);
      this.terrainOrdinal = ordinal;
      return terrainId;
    } catch {
      return null;
    }
  }

  recordTerritory(
    tick: number,
    facts: {
      cells: readonly GenomeV2Cell[];
      recoveryExitCount: number;
      source: 'feral_ladder' | 'heartwood';
    }
  ): string | null {
    const ordinal = this.territoryOrdinal + 1;
    const territoryId = this.stableId('territory', ordinal);
    try {
      this.apply(
        {
          type: 'territory_claimed',
          territoryId,
          cells: facts.cells,
          recoveryExitCount: facts.recoveryExitCount,
          source: facts.source,
        },
        tick
      );
      this.territoryOrdinal = ordinal;
      return territoryId;
    } catch {
      return null;
    }
  }

  startOverclock(
    tick: number,
    source: 'volt_apex' | 'zenith_protocol',
    expectedActivationId?: string
  ): string | null {
    if (this.state.overclock) return null;
    const ordinal = this.activationOrdinal + 1;
    const activationId = this.stableId('overclock', ordinal);
    if (
      expectedActivationId !== undefined &&
      expectedActivationId !== activationId
    ) {
      return null;
    }
    try {
      this.apply({ type: 'overclock_started', activationId, source }, tick);
      this.activationOrdinal = ordinal;
      return activationId;
    } catch {
      return null;
    }
  }

  endExpiredOverclock(tick: number): boolean {
    const overclock = this.state.overclock;
    if (!overclock || tick < overclock.expiresAtTick) return false;
    this.apply(
      { type: 'overclock_ended', activationId: overclock.activationId },
      tick
    );
    return true;
  }

  openCrownWave(
    tick: number,
    currentTargetIds: readonly string[],
    futureTargetId: string | null
  ): string | null {
    if (this.state.crownWave) return null;
    const future = futureTargetId ? this.state.targets[futureTargetId] : null;
    const ordinal = this.waveOrdinal + 1;
    const waveId = this.stableId('crown-wave', ordinal);
    try {
      this.apply(
        {
          type: 'crown_wave_opened',
          waveId,
          currentTargetIds,
          futureCells: future ? [future.cell] : [],
          crownStarTargetId: null,
        },
        tick
      );
      this.waveOrdinal = ordinal;
      return waveId;
    } catch {
      return null;
    }
  }

  advanceCrownWave(tick: number): GenomeV2CrownAdvance | null {
    const wave = this.state.crownWave;
    if (!wave) return null;
    const current = wave.currentTargetIds.map(
      (targetId) => this.state.targets[targetId]
    );
    const failed = current.some(
      (target) => !target || ['burnt', 'expired'].includes(target.lifecycle)
    );
    if (failed) {
      const trackedIds = new Set([
        ...wave.currentTargetIds,
        ...Object.values(this.state.targets)
          .filter(
            (target) =>
              target.crownRole === 'future' &&
              wave.futureCells.some((cell) => sameCell(cell, target.cell))
          )
          .map((target) => target.targetId),
      ]);
      this.apply(
        { type: 'crown_wave_closed', waveId: wave.waveId, outcome: 'failed' },
        tick
      );
      trackedIds.forEach((targetId) => this.targetProgress.delete(targetId));
      return { outcome: 'failed', crownTargetId: null, crownCell: null };
    }
    if (!current.every((target) => target.lifecycle === 'completed'))
      return null;

    const futureTarget = Object.values(this.state.targets).find(
      (target) =>
        target.crownRole === 'future' &&
        wave.futureCells.some((cell) => sameCell(cell, target.cell))
    );
    this.apply(
      { type: 'crown_wave_closed', waveId: wave.waveId, outcome: 'perfect' },
      tick
    );
    if (futureTarget) this.targetProgress.delete(futureTarget.targetId);
    return {
      outcome: 'perfect',
      // Closing the perfect wave expires its preview object. The engine uses
      // the frozen cell to spawn a fresh cadence-ineligible Crown Star target,
      // preserving both the preview promise and one canonical target identity.
      crownTargetId: null,
      crownCell: futureTarget ? { ...futureTarget.cell } : null,
    };
  }

  failCrownWave(tick: number): boolean {
    const wave = this.state.crownWave;
    if (!wave) return false;
    const current = wave.currentTargetIds.map(
      (targetId) => this.state.targets[targetId]
    );
    if (current.every((target) => target?.lifecycle === 'completed')) {
      return false;
    }
    const trackedIds = new Set([
      ...wave.currentTargetIds,
      ...Object.values(this.state.targets)
        .filter(
          (target) =>
            target.crownRole === 'future' &&
            wave.futureCells.some((cell) => sameCell(cell, target.cell))
        )
        .map((target) => target.targetId),
    ]);
    this.apply(
      { type: 'crown_wave_closed', waveId: wave.waveId, outcome: 'failed' },
      tick
    );
    trackedIds.forEach((targetId) => this.targetProgress.delete(targetId));
    return true;
  }

  hasGene(geneId: GenomeV2ActiveGeneId): boolean {
    return genomeV2HasGene(this.state, geneId);
  }

  hasMechanic(geneId: GenomeV2ActiveGeneId): boolean {
    return genomeV2MechanicEnabled(this.state, geneId);
  }

  hasSplice(spliceId: GenomeV2SpliceId): boolean {
    return genomeV2HasSplice(this.state, spliceId);
  }

  hasLadderTier(strain: StrainId, minimum: 3 | 4 | 5): boolean {
    return genomeV2HasLadderTier(this.state, strain, minimum);
  }

  nextExclusiveContractKind(): GenomeV2ExclusiveTargetKind | null {
    const projection = this.projectNextTarget(true);
    return projection.kind === 'ordinary'
      ? null
      : (projection.kind as GenomeV2ExclusiveTargetKind);
  }
}

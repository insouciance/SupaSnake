import type { DynastyId } from '@/shared/types/game';
import { TRAINING_EXERCISES } from './catalog';
import {
  TRAINING_SCENARIO_VERSION,
  type SandboxScenarioConfig,
  type TrainingCell,
  type TrainingDifficulty,
  type TrainingDirection,
  type TrainingExerciseId,
  type TrainingScenario,
  type TrainingScenarioReference,
} from './types';

const GRID_SIZE = 20;
const TRANSFORM_ORIGIN = 10;

const VECTOR_BY_DIRECTION: Record<TrainingDirection, TrainingCell> = {
  UP: { x: 0, z: -1 },
  DOWN: { x: 0, z: 1 },
  LEFT: { x: -1, z: 0 },
  RIGHT: { x: 1, z: 0 },
};

const TRACE_WAYPOINTS: Record<TrainingDifficulty, TrainingCell[]> = {
  foundation: [
    { x: 10, z: 10 }, { x: 15, z: 10 }, { x: 15, z: 6 },
    { x: 8, z: 6 }, { x: 8, z: 14 }, { x: 14, z: 14 },
  ],
  advanced: [
    { x: 10, z: 10 }, { x: 16, z: 10 }, { x: 16, z: 5 },
    { x: 6, z: 5 }, { x: 6, z: 9 }, { x: 14, z: 9 },
    { x: 14, z: 15 }, { x: 4, z: 15 }, { x: 4, z: 12 },
  ],
  elite: [
    { x: 10, z: 10 }, { x: 16, z: 10 }, { x: 16, z: 4 },
    { x: 5, z: 4 }, { x: 5, z: 8 }, { x: 14, z: 8 },
    { x: 14, z: 13 }, { x: 7, z: 13 }, { x: 7, z: 16 },
    { x: 17, z: 16 }, { x: 17, z: 12 },
  ],
};

const TEMPO_WAYPOINTS: Record<TrainingDifficulty, TrainingCell[]> = {
  foundation: [
    { x: 10, z: 10 }, { x: 15, z: 10 }, { x: 15, z: 7 },
    { x: 11, z: 7 }, { x: 11, z: 13 }, { x: 16, z: 13 },
  ],
  advanced: [
    { x: 10, z: 10 }, { x: 15, z: 10 }, { x: 15, z: 7 },
    { x: 11, z: 7 }, { x: 11, z: 13 }, { x: 7, z: 13 },
    { x: 7, z: 8 }, { x: 4, z: 8 }, { x: 4, z: 15 },
  ],
  elite: [
    { x: 10, z: 10 }, { x: 14, z: 10 }, { x: 14, z: 7 },
    { x: 11, z: 7 }, { x: 11, z: 13 }, { x: 8, z: 13 },
    { x: 8, z: 6 }, { x: 5, z: 6 }, { x: 5, z: 15 },
    { x: 12, z: 15 }, { x: 12, z: 11 }, { x: 17, z: 11 },
  ],
};

const ROUTE_TARGETS: Record<TrainingDifficulty, TrainingCell[]> = {
  foundation: [
    { x: 15, z: 7 }, { x: 7, z: 5 }, { x: 6, z: 14 }, { x: 15, z: 16 },
  ],
  advanced: [
    { x: 16, z: 6 }, { x: 8, z: 4 }, { x: 4, z: 11 },
    { x: 10, z: 16 }, { x: 16, z: 13 },
  ],
  elite: [
    { x: 17, z: 5 }, { x: 10, z: 3 }, { x: 4, z: 6 },
    { x: 3, z: 15 }, { x: 10, z: 17 }, { x: 17, z: 14 },
  ],
};

const TICK_MS: Record<TrainingExerciseId, Record<TrainingDifficulty, number>> = {
  trace: { foundation: 180, advanced: 125, elite: 90 },
  route: { foundation: 180, advanced: 145, elite: 115 },
  tempo: { foundation: 150, advanced: 75, elite: 50 },
  escape: { foundation: 180, advanced: 125, elite: 90 },
};

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededTrainingRandom(seed: string): () => number {
  return mulberry32(hashSeed(seed));
}

function sameCell(a: TrainingCell, b: TrainingCell): boolean {
  return a.x === b.x && a.z === b.z;
}

function directionBetween(from: TrainingCell, to: TrainingCell): TrainingDirection {
  if (to.x === from.x + 1 && to.z === from.z) return 'RIGHT';
  if (to.x === from.x - 1 && to.z === from.z) return 'LEFT';
  if (to.z === from.z + 1 && to.x === from.x) return 'DOWN';
  if (to.z === from.z - 1 && to.x === from.x) return 'UP';
  throw new Error('Training path cells must be orthogonally adjacent');
}

function transformCell(cell: TrainingCell, rotation: number, reflect: boolean): TrainingCell {
  let x = cell.x - TRANSFORM_ORIGIN;
  let z = cell.z - TRANSFORM_ORIGIN;
  if (reflect) x = -x;
  for (let turn = 0; turn < rotation; turn += 1) {
    [x, z] = [-z, x];
  }
  return { x: x + TRANSFORM_ORIGIN, z: z + TRANSFORM_ORIGIN };
}

function transformDirection(
  direction: TrainingDirection,
  rotation: number,
  reflect: boolean
): TrainingDirection {
  const origin = { x: TRANSFORM_ORIGIN, z: TRANSFORM_ORIGIN };
  const delta = VECTOR_BY_DIRECTION[direction];
  const transformedOrigin = transformCell(origin, rotation, reflect);
  const transformedNext = transformCell(
    { x: origin.x + delta.x, z: origin.z + delta.z },
    rotation,
    reflect
  );
  return directionBetween(transformedOrigin, transformedNext);
}

function expandWaypoints(waypoints: TrainingCell[], horizontalFirst = true): TrainingCell[] {
  if (waypoints.length === 0) return [];
  const path: TrainingCell[] = [{ ...waypoints[0] }];
  for (let index = 1; index < waypoints.length; index += 1) {
    const target = waypoints[index];
    const current = path[path.length - 1];
    const axes = horizontalFirst ? ['x', 'z'] as const : ['z', 'x'] as const;
    for (const axis of axes) {
      while (path[path.length - 1][axis] !== target[axis]) {
        const head = path[path.length - 1];
        path.push({
          x: head.x + (axis === 'x' ? Math.sign(target.x - head.x) : 0),
          z: head.z + (axis === 'z' ? Math.sign(target.z - head.z) : 0),
        });
      }
    }
    if (!sameCell(path[path.length - 1], target)) {
      throw new Error(`Could not expand waypoint ${index} from ${current.x}:${current.z}`);
    }
  }
  return path;
}

function checkpointIndices(path: TrainingCell[]): number[] {
  const checkpoints: number[] = [];
  for (let index = 1; index < path.length - 1; index += 1) {
    const before = directionBetween(path[index - 1], path[index]);
    const after = directionBetween(path[index], path[index + 1]);
    if (before !== after) checkpoints.push(index);
  }
  if (path.length > 1) checkpoints.push(path.length - 1);
  return checkpoints;
}

function bodyBehind(
  head: TrainingCell,
  direction: TrainingDirection,
  length: number
): TrainingCell[] {
  const delta = VECTOR_BY_DIRECTION[direction];
  return Array.from({ length }, (_, index) => ({
    x: head.x - delta.x * index,
    z: head.z - delta.z * index,
  }));
}

function transformScenarioCells(
  cells: TrainingCell[],
  rotation: number,
  reflect: boolean
): TrainingCell[] {
  return cells.map((cell) => transformCell(cell, rotation, reflect));
}

function escapeOpening(difficulty: TrainingDifficulty): {
  snake: TrainingCell[];
  direction: TrainingDirection;
  path: TrainingCell[];
} {
  if (difficulty === 'foundation') {
    return {
      snake: Array.from({ length: 8 }, (_, index) => ({ x: 2 + index, z: 10 })),
      direction: 'LEFT',
      path: expandWaypoints([
        { x: 2, z: 10 }, { x: 2, z: 6 }, { x: 8, z: 6 },
      ]),
    };
  }
  if (difficulty === 'advanced') {
    return {
      snake: Array.from({ length: 11 }, (_, index) => ({ x: 1, z: 15 - index })),
      direction: 'DOWN',
      path: expandWaypoints([
        { x: 1, z: 15 }, { x: 6, z: 15 }, { x: 6, z: 8 }, { x: 13, z: 8 },
      ]),
    };
  }
  return {
    snake: [
      { x: 3, z: 3 }, { x: 4, z: 3 }, { x: 5, z: 3 }, { x: 6, z: 3 },
      { x: 7, z: 3 }, { x: 8, z: 3 }, { x: 8, z: 4 }, { x: 8, z: 5 },
      { x: 7, z: 5 }, { x: 6, z: 5 }, { x: 5, z: 5 }, { x: 4, z: 5 },
      { x: 3, z: 5 }, { x: 2, z: 5 }, { x: 2, z: 6 }, { x: 2, z: 7 },
    ],
    direction: 'LEFT',
    path: expandWaypoints([
      { x: 3, z: 3 }, { x: 3, z: 1 }, { x: 11, z: 1 }, { x: 11, z: 9 },
    ]),
  };
}

function assertScenarioGeometry(scenario: TrainingScenario): TrainingScenario {
  const inBounds = (cell: TrainingCell) =>
    Number.isInteger(cell.x) && Number.isInteger(cell.z) &&
    cell.x >= 0 && cell.x < scenario.gridSize && cell.z >= 0 && cell.z < scenario.gridSize;
  if (!scenario.startSnake.every(inBounds) || !scenario.path.every(inBounds) || !scenario.targets.every(inBounds)) {
    throw new Error(`Generated training scenario ${scenario.id} leaves the board`);
  }
  if (!sameCell(scenario.startSnake[0], scenario.path[0])) {
    throw new Error(`Generated training scenario ${scenario.id} must begin at the authored head`);
  }
  const bodyCells = new Set<string>();
  for (let index = 0; index < scenario.startSnake.length; index += 1) {
    const cell = scenario.startSnake[index];
    const key = `${cell.x}:${cell.z}`;
    if (bodyCells.has(key)) {
      throw new Error(`Generated training scenario ${scenario.id} has a crossed starting body`);
    }
    bodyCells.add(key);
    if (index > 0) directionBetween(scenario.startSnake[index - 1], cell);
  }
  if (scenario.targets.some((target) => bodyCells.has(`${target.x}:${target.z}`))) {
    throw new Error('The training finish cannot overlap the starting snake');
  }
  for (let index = 1; index < scenario.path.length; index += 1) {
    directionBetween(scenario.path[index - 1], scenario.path[index]);
  }
  return scenario;
}

export function createTrainingScenario(reference: TrainingScenarioReference): TrainingScenario {
  if (reference.version !== TRAINING_SCENARIO_VERSION) {
    throw new Error('Unsupported training scenario version');
  }
  const rng = seededTrainingRandom(
    `${reference.exercise}:${reference.difficulty}:${reference.seed}:${reference.version}`
  );
  const rotation = Math.floor(rng() * 4);
  const reflect = rng() >= 0.5;
  const dynasty = TRAINING_EXERCISES[reference.exercise].dynasty;
  let path: TrainingCell[];
  let targets: TrainingCell[];
  let startSnake: TrainingCell[];
  let startDirection: TrainingDirection;

  if (reference.exercise === 'escape') {
    const opening = escapeOpening(reference.difficulty);
    path = transformScenarioCells(opening.path, rotation, reflect);
    targets = [{ ...path[path.length - 1] }];
    startSnake = transformScenarioCells(opening.snake, rotation, reflect);
    startDirection = transformDirection(opening.direction, rotation, reflect);
  } else if (reference.exercise === 'route') {
    const start = transformCell({ x: 10, z: 10 }, rotation, reflect);
    targets = transformScenarioCells(ROUTE_TARGETS[reference.difficulty], rotation, reflect);
    path = expandWaypoints([start, ...targets], rng() >= 0.5);
    startDirection = transformDirection('RIGHT', rotation, reflect);
    startSnake = bodyBehind(start, startDirection, 3);
  } else {
    const waypoints = reference.exercise === 'tempo'
      ? TEMPO_WAYPOINTS[reference.difficulty]
      : TRACE_WAYPOINTS[reference.difficulty];
    path = transformScenarioCells(expandWaypoints(waypoints), rotation, reflect);
    targets = [{ ...path[path.length - 1] }];
    startDirection = directionBetween(path[0], path[1]);
    startSnake = bodyBehind(path[0], startDirection, 3);
  }

  const optimalTicks = path.length - 1;
  const allowance = reference.exercise === 'route'
    ? Math.max(20, Math.ceil(optimalTicks * 0.75))
    : reference.exercise === 'escape'
      ? Math.max(10, Math.ceil(optimalTicks * 0.6))
      : Math.max(12, Math.ceil(optimalTicks * 0.45));

  return assertScenarioGeometry({
    id: `${reference.exercise}:${reference.difficulty}:v${reference.version}:${reference.seed}`,
    kind: 'drill',
    reference: { ...reference },
    exercise: reference.exercise,
    difficulty: reference.difficulty,
    seed: reference.seed,
    dynasty,
    gridSize: GRID_SIZE,
    tickMs: TICK_MS[reference.exercise][reference.difficulty],
    maxTicks: optimalTicks + allowance,
    optimalTicks,
    startSnake,
    startDirection,
    path,
    checkpointIndices: checkpointIndices(path),
    targets,
  });
}

function validateSandboxPath(path: TrainingCell[]): TrainingCell[] {
  if (path.length < 5 || path.length > 120) {
    throw new Error('Sandbox paths must contain 5 to 120 cells');
  }
  const seen = new Set<string>();
  for (let index = 0; index < path.length; index += 1) {
    const cell = path[index];
    if (
      !Number.isInteger(cell.x) || !Number.isInteger(cell.z) ||
      cell.x < 0 || cell.x >= GRID_SIZE || cell.z < 0 || cell.z >= GRID_SIZE
    ) {
      throw new Error('Sandbox path cells must be inside the board');
    }
    const key = `${cell.x}:${cell.z}`;
    if (seen.has(key)) throw new Error('Sandbox paths cannot cross themselves');
    seen.add(key);
    if (index > 0) directionBetween(path[index - 1], cell);
  }
  return path.map((cell) => ({ ...cell }));
}

export function createSandboxScenario(config: SandboxScenarioConfig): TrainingScenario {
  const path = validateSandboxPath(config.path);
  const tickMs = Math.max(50, Math.min(250, Math.round(config.tickMs)));
  const startLength = Math.max(3, Math.min(8, Math.round(config.startLength)));
  const startDirection = directionBetween(path[0], path[1]);
  const startSnake = bodyBehind(path[0], startDirection, startLength);
  const dynasty: DynastyId = config.dynasty;
  const scenario: TrainingScenario = {
    id: `sandbox:${dynasty}:${tickMs}:${path.map((cell) => `${cell.x}.${cell.z}`).join('-')}`,
    kind: 'sandbox',
    reference: null,
    exercise: 'trace',
    difficulty: 'foundation',
    seed: 'custom',
    dynasty,
    gridSize: GRID_SIZE,
    tickMs,
    maxTicks: Math.min(240, (path.length - 1) * 2 + 20),
    optimalTicks: path.length - 1,
    startSnake,
    startDirection,
    path,
    checkpointIndices: checkpointIndices(path),
    targets: [{ ...path[path.length - 1] }],
  };
  return assertScenarioGeometry(scenario);
}

export function createCircuitReferences(
  difficulty: TrainingDifficulty,
  seed: string
): TrainingScenarioReference[] {
  return (['trace', 'route', 'tempo', 'escape'] as const).map((exercise, index) => ({
    version: TRAINING_SCENARIO_VERSION,
    exercise,
    difficulty,
    seed: `${seed}-${index + 1}`,
  }));
}

export function newTrainingReference(
  exercise: TrainingExerciseId,
  difficulty: TrainingDifficulty,
  seed: string
): TrainingScenarioReference {
  return { version: TRAINING_SCENARIO_VERSION, exercise, difficulty, seed };
}

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GAME_CONFIG } from '@/shared/config/game';
import { normalizeDynastyName, RULESETS } from '@/shared/game/rulesets';
import {
  StatefulRng,
  type StatefulRngSnapshot,
} from '@/shared/game/statefulRng';
import { sanitizeTraits } from '@/shared/game/traits';
import {
  isMutationId,
  MUTATION_PHYSICS,
  MUTATION_POOL,
} from '@/shared/game/mutations';
import { isGeneId } from '@/shared/game/genes';
import { resolveGrowthProfile } from '@/shared/game/growth';
import { ladderHoldBase, resolveLadderRung } from '@/shared/game/ladder';
import { isAnomalyId } from '@/shared/game/anomalies';
import { sanitizeGenomeCapability } from '@/lib/game/genomeCapability';
import { isStrainId, STRAIN_PHYSICS } from '@/shared/game/strains';
import {
  SNAKE_RULES_VERSION,
  SnakeGameLogic,
  type Direction,
  type GameOverData,
  type Position,
  type SnakeCheckpointV1,
  type SnakeReplayAction,
  type SnakeReplayTrace,
  type SnakeTerminalReplayProof,
} from '@/lib/game/SnakeGameLogic';
import {
  computeLengthTrace,
  fusePicks,
  strainActivations,
  strainTierAtFood,
} from '@/shared/game/genome';
import {
  isChargeExempt,
  type ChargeExemptionFacts,
} from '@/shared/game/energyEnvelope';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

export const RUN_CONTINUITY_VERSION = 1;
export const RUN_CHECKPOINT_MAX_BYTES = 1_048_576;
export const RUN_CHECKPOINT_FOOD_RATE_ALLOWANCE =
  1 + STRAIN_PHYSICS.arcMaxPerEat;
export const RUN_REPLAY_MAX_ACTIONS = 50_000;
export const RUN_REPLAY_MAX_ACTIONS_PER_CHECKPOINT = 512;
export const RUN_REPLAY_MAX_TICKS_PER_CHECKPOINT = 2_048;
export const RUN_TERMINAL_FACTS_MAX_BYTES = 262_144;
const START_REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface StartFingerprintInput {
  mode: 'earn' | 'free' | 'anomaly' | 'signal';
  snakeId: string;
  energyCommitment: number;
  confirmMaxEnergy: boolean;
  signalObjectiveId: string | null;
  ladderRung: number | null;
}

export interface RunStartManifest extends Record<string, unknown> {
  sessionId: string;
}

export interface StoredRunStartIntent extends Record<string, unknown> {
  v: 1;
  startRequestId: string;
  mode: StartFingerprintInput['mode'];
  snakeId: string;
  energyCommitment: number;
  confirmMaxEnergy: boolean;
  signalObjectiveId: string | null;
  ladderRung: number | null;
}

export interface ContinuityRow {
  id: string;
  start_request_id: string | null;
  start_request_fingerprint: string | null;
  continuity_start_intent?: StoredRunStartIntent | null;
  start_manifest: RunStartManifest | null;
  start_manifest_draft: Record<string, unknown> | null;
  continuity_energy_commitment: number | null;
  continuity_exempt: boolean | null;
  continuity_energy_visible: boolean | null;
  continuity_phase: string | null;
  continuity_activated_at: string | null;
  continuity_checkpoint?: SnakeCheckpointV1 | null;
  continuity_checkpoint_revision?: number | null;
  continuity_checkpoint_saved_at?: string | null;
  continuity_checkpoint_digest?: string | null;
  continuity_terminal_facts?: Record<string, unknown> | null;
  continuity_terminal_digest?: string | null;
  continuity_terminal_at?: string | null;
  continuity_lease_hash?: string | null;
  continuity_lease_epoch?: number | null;
  continuity_lease_issued_at?: string | null;
  simulation_rules_version?: string | null;
  dynasty?: string | null;
  started_at: string;
  server_started_at?: string | null;
  simulation_seed?: string | null;
  run_seed?: string | null;
  energy_committed?: number | null;
  ended_at: string | null;
  end_reason: string | null;
}

export interface ActiveRunContract {
  sessionId: string;
  phase: 'preparing' | 'prepared' | 'active' | 'terminal' | 'settling' | 'incompatible' | 'legacy';
  startedAt: string;
  activatedAt: string | null;
  energyCommitted: number;
  canContinue: boolean;
  requiresAbandon: boolean;
  manifest: RunStartManifest | null;
  checkpoint: SnakeCheckpointV1 | null;
  checkpointRevision: number;
  checkpointSavedAt: string | null;
  leaseToken: string | null;
  leaseEpoch: number;
  startIntent: StoredRunStartIntent | null;
}

export class RunContinuityError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | 'invalid_request_id'
      | 'request_conflict'
      | 'active_run'
      | 'insufficient_energy'
      | 'not_found'
      | 'not_prepared'
      | 'invalid_checkpoint'
      | 'checkpoint_conflict'
      | 'lease_conflict'
      | 'unavailable'
  ) {
    super(message);
    this.name = 'RunContinuityError';
  }
}

export function isValidStartRequestId(value: unknown): value is string {
  return typeof value === 'string' && START_REQUEST_ID.test(value);
}

/**
 * Hash only the normalized, player-selected start intent. Server-derived run
 * rules live in the immutable manifest and are never accepted from a client.
 */
export function fingerprintStartRequest(input: StartFingerprintInput): string {
  const canonical = JSON.stringify({
    v: RUN_CONTINUITY_VERSION,
    mode: input.mode,
    snakeId: input.snakeId,
    energyCommitment: input.energyCommitment,
    confirmMaxEnergy: input.confirmMaxEnergy,
    signalObjectiveId: input.signalObjectiveId,
    ladderRung: input.ladderRung,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function isMissingRunContinuityInfra(
  error: SupabaseErrorLike | null | undefined
): boolean {
  if (!error) return false;
  if (['42P01', '42703', '42883', 'PGRST202', 'PGRST204'].includes(error.code ?? '')) {
    return true;
  }
  return /start_request_id|start_request_fingerprint|start_manifest|simulation_rules_version|continuity_phase|continuity_checkpoint|continuity_lease|continuity_terminal|finalize_run_continuity_start|activate_run_continuity|resume_run_continuity|save_run_continuity_checkpoint|stage_run_continuity_terminal|stage_continuity_game_session_end|complete_free_run_continuity|abandon_run_continuity/i.test(
    error.message ?? ''
  );
}

function asManifest(value: unknown): RunStartManifest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return typeof row.sessionId === 'string' ? (row as RunStartManifest) : null;
}

function asPhase(value: unknown): ActiveRunContract['phase'] {
  return value === 'preparing' || value === 'prepared' || value === 'active' || value === 'terminal'
    ? value
    : 'legacy';
}

function activeContract(
  row: ContinuityRow,
  leaseToken: string | null = null
): ActiveRunContract {
  // `completed` + no terminal timestamp is the durable ingress marker for
  // every earning run, including rows created before continuity existed.
  // Treating a legacy pending result as an abandonable legacy run would let
  // the UI erase a secured Victory Lap while its canonical receipt is still
  // being applied.
  const storedPhase = asPhase(row.continuity_phase);
  const phase = row.end_reason === 'completed' && row.ended_at === null
    ? 'settling'
    : storedPhase === 'terminal'
      // Terminal facts are already immutable server truth. A deploy/rules
      // bump may prevent replaying an active checkpoint, but it must never
      // strand or make abandonable an outcome already derived under its
      // stamped engine version.
      ? 'terminal'
    : row.start_request_id !== null &&
        row.simulation_rules_version !== SNAKE_RULES_VERSION
      ? 'incompatible'
      : storedPhase;
  const preparedManifest = asManifest(row.start_manifest);
  const checkpoint =
    (phase === 'active' || phase === 'settling') && row.continuity_checkpoint
      ? row.continuity_checkpoint
      : null;
  const canContinue =
    preparedManifest !== null &&
    (phase === 'prepared' || (phase === 'active' && checkpoint !== null));
  const manifest = canContinue ? preparedManifest : null;
  return {
    sessionId: row.id,
    phase,
    startedAt: row.server_started_at ?? row.started_at,
    activatedAt: row.continuity_activated_at,
    energyCommitted: Math.max(0, Number(row.energy_committed ?? 0)),
    canContinue,
    requiresAbandon: phase !== 'settling' && phase !== 'terminal' && !canContinue,
    manifest,
    checkpoint,
    checkpointRevision: Math.max(
      0,
      Number(row.continuity_checkpoint_revision ?? 0) || 0
    ),
    checkpointSavedAt: row.continuity_checkpoint_saved_at ?? null,
    leaseToken,
    leaseEpoch: Math.max(0, Number(row.continuity_lease_epoch ?? 0) || 0),
    startIntent:
      phase === 'preparing' && row.continuity_start_intent
        ? row.continuity_start_intent
        : null,
  };
}

const CONTINUITY_SELECT =
  'id, dynasty, start_request_id, start_request_fingerprint, continuity_start_intent, start_manifest, start_manifest_draft, continuity_energy_commitment, continuity_exempt, continuity_energy_visible, simulation_seed, run_seed, simulation_rules_version, continuity_phase, continuity_activated_at, continuity_checkpoint, continuity_checkpoint_revision, continuity_checkpoint_saved_at, continuity_checkpoint_digest, continuity_lease_hash, continuity_lease_epoch, continuity_lease_issued_at, continuity_terminal_facts, continuity_terminal_digest, continuity_terminal_at, started_at, server_started_at, energy_committed, ended_at, end_reason';

function createRunLease(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: createHash('sha256').update(token).digest('hex') };
}

function hashMatchesToken(hash: unknown, token: unknown): boolean {
  if (
    typeof hash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(hash) ||
    typeof token !== 'string' ||
    token.length < 32 ||
    token.length > 128
  ) return false;
  const actual = Buffer.from(createHash('sha256').update(token).digest('hex'), 'hex');
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Legacy rows need no lease; every continuity terminal transition does. */
export function assertTerminalRunLease(
  row: Record<string, unknown>,
  token: unknown
): void {
  if (row.start_request_id == null) return;
  if (
    row.continuity_phase !== 'active' ||
    !objectRecord(row.continuity_checkpoint) ||
    safeInteger(row.continuity_checkpoint_revision, 1) === null
  ) {
    throw new RunContinuityError(
      'This run has no secured active checkpoint.',
      'not_prepared'
    );
  }
  if (!hashMatchesToken(row.continuity_lease_hash, token)) {
    throw new RunContinuityError(
      'This run is open in a newer session. Continue it before submitting.',
      'lease_conflict'
    );
  }
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeInteger(value: unknown, minimum = 0): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum
    ? (value as number)
    : null;
}

/** Compare JSON value, not JavaScript realm/prototype identity. */
function jsonEquivalent(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => jsonEquivalent(entry, right[index]));
  }
  const leftObject = objectRecord(left);
  const rightObject = objectRecord(right);
  if (!leftObject || !rightObject) return false;
  const leftKeys = Object.keys(leftObject)
    .filter((key) => leftObject[key] !== undefined)
    .sort();
  const rightKeys = Object.keys(rightObject)
    .filter((key) => rightObject[key] !== undefined)
    .sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        jsonEquivalent(leftObject[key], rightObject[key])
    );
}

function checkpointMetric(
  checkpoint: SnakeCheckpointV1 | null | undefined,
  key: 'foodEaten' | 'score' | 'dnaCollected'
): number {
  const value = checkpoint?.state?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function rejectCheckpoint(message: string): never {
  throw new RunContinuityError(message, 'invalid_checkpoint');
}

function checkpointCell(
  value: unknown,
  gridSize: number,
  label: string
): Position {
  const cell = objectRecord(value);
  const x = safeInteger(cell?.x);
  const z = safeInteger(cell?.z);
  if (x === null || z === null || x >= gridSize || z >= gridSize || cell?.y !== 0) {
    rejectCheckpoint(`Run checkpoint contains an invalid ${label} cell.`);
  }
  return { x, y: 0, z };
}

function cellId(cell: Pick<Position, 'x' | 'z'>): string {
  return `${cell.x}:${cell.z}`;
}

function prefixEqual(previous: unknown, next: unknown): boolean {
  if (!Array.isArray(previous) || !Array.isArray(next) || next.length < previous.length) {
    return false;
  }
  return previous.every((entry, index) => jsonEquivalent(entry, next[index]));
}

function normalizedOpening(checkpoint: SnakeCheckpointV1): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(checkpoint)) as SnakeCheckpointV1;
  clone.state.startTime = null;
  clone.privateState.elapsedMs = 0;
  return clone as unknown as Record<string, unknown>;
}

function deterministicOpening(
  manifest: RunStartManifest,
  checkpoint: SnakeCheckpointV1
): SnakeCheckpointV1 {
  const simulation = objectRecord(manifest.simulation);
  const seed = typeof simulation?.seed === 'string' ? simulation.seed : '';
  const engine = new SnakeGameLogic({
    gridSize: checkpoint.config.gridSize,
    initialLength: checkpoint.config.initialLength,
    ruleset: RULESETS[checkpoint.config.ruleset],
    traits: checkpoint.config.traits,
    mutationPool: checkpoint.config.mutationPool,
    anomaly: checkpoint.config.anomaly,
    genome: checkpoint.config.genome,
    growthProfileId: checkpoint.config.growthProfileId,
    ladderRung: checkpoint.config.ladderRung,
    simulationSeed: seed,
  });
  engine.prepare();
  return engine.exportCheckpoint();
}

function isDirection(value: unknown): value is Direction {
  return ['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(String(value));
}

function parseReplayTrace(value: unknown): SnakeReplayTrace {
  const record = objectRecord(value);
  const ticks = safeInteger(record?.ticks);
  if (
    ticks === null ||
    ticks > 10_000_000 ||
    !Array.isArray(record?.actions) ||
    record.actions.length > RUN_REPLAY_MAX_ACTIONS
  ) {
    rejectCheckpoint('Run checkpoint contains an invalid replay trace.');
  }
  const actions: SnakeReplayAction[] = [];
  let priorTick = 0;
  for (const raw of record.actions) {
    const action = objectRecord(raw);
    const tick = safeInteger(action?.tick);
    if (tick === null || tick < priorTick || tick > ticks) {
      rejectCheckpoint('Run checkpoint contains an out-of-order replay action.');
    }
    priorTick = tick;
    switch (action?.kind) {
      case 'turn':
        if (!isDirection(action.direction)) {
          rejectCheckpoint('Run checkpoint contains an invalid replay turn.');
        }
        actions.push({ tick, kind: 'turn', direction: action.direction });
        break;
      case 'pause':
        if (action.hold !== 'tactical' && action.hold !== 'decision') {
          rejectCheckpoint('Run checkpoint contains an invalid replay hold.');
        }
        actions.push({ tick, kind: 'pause', hold: action.hold });
        break;
      case 'resume':
        actions.push({ tick, kind: 'resume' });
        break;
      case 'mutation':
        if (action.choice !== 0 && action.choice !== 1 && action.choice !== 'decline') {
          rejectCheckpoint('Run checkpoint contains an invalid replay mutation choice.');
        }
        actions.push({ tick, kind: 'mutation', choice: action.choice });
        break;
      case 'portal':
        if (!['bank', 'pass', 'infuse'].includes(String(action.choice))) {
          rejectCheckpoint('Run checkpoint contains an invalid replay portal choice.');
        }
        actions.push({
          tick,
          kind: 'portal',
          choice: action.choice as 'bank' | 'pass' | 'infuse',
        });
        break;
      case 'surge':
        if (!isStrainId(action.strain)) {
          rejectCheckpoint('Run checkpoint contains an invalid replay surge.');
        }
        actions.push({ tick, kind: 'surge', strain: action.strain });
        break;
      default:
        rejectCheckpoint('Run checkpoint contains an unknown replay action.');
    }
  }
  return { ticks, actions };
}

function parseTerminalReplayProof(value: unknown): SnakeTerminalReplayProof {
  const record = objectRecord(value);
  const fromTick = safeInteger(record?.fromTick);
  const toTick = safeInteger(record?.toTick);
  const actionOffset = safeInteger(record?.actionOffset);
  if (
    fromTick === null ||
    toTick === null ||
    toTick < fromTick ||
    toTick - fromTick > RUN_REPLAY_MAX_TICKS_PER_CHECKPOINT ||
    actionOffset === null ||
    !Array.isArray(record?.actions) ||
    record.actions.length > RUN_REPLAY_MAX_ACTIONS_PER_CHECKPOINT
  ) {
    rejectCheckpoint('Terminal replay proof exceeds its safe bounds.');
  }
  // Reuse the complete action sanitizer by treating the suffix as a trace
  // over the terminal tick range. Its ticks remain absolute.
  const parsed = parseReplayTrace({ ticks: toTick, actions: record.actions });
  if (parsed.actions.some((action) => action.tick < fromTick)) {
    rejectCheckpoint('Terminal replay proof predates its checkpoint base.');
  }
  return { fromTick, toTick, actionOffset, actions: parsed.actions };
}

function replayComparable(checkpoint: SnakeCheckpointV1): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(checkpoint)) as SnakeCheckpointV1;
  // Wall time and display-only event timestamps are server-owned on the
  // canonical snapshot. Every gameplay field remains in the comparison.
  clone.state.startTime = null;
  clone.privateState.elapsedMs = 0;
  clone.privateState.runEvents = [];
  clone.privateState.runEventsTruncated = false;
  return clone as unknown as Record<string, unknown>;
}

function replayEngineFromCheckpoint(checkpoint: SnakeCheckpointV1): SnakeGameLogic {
  const engine = new SnakeGameLogic({
    gridSize: checkpoint.config.gridSize,
    initialLength: checkpoint.config.initialLength,
    ruleset: RULESETS[checkpoint.config.ruleset],
    traits: checkpoint.config.traits,
    mutationPool: checkpoint.config.mutationPool,
    anomaly: checkpoint.config.anomaly,
    genome: checkpoint.config.genome,
    growthProfileId: checkpoint.config.growthProfileId,
    ladderRung: checkpoint.config.ladderRung,
    simulationSeed: checkpoint.rng.seed.toString(16),
  });
  // `restoreCheckpoint` replaces every seeded field, including the exact RNG
  // cursor. The constructor seed is only needed to provide a replayable source.
  engine.prepare();
  engine.restoreCheckpoint(checkpoint, Date.now(), {
    replacePreparedOpening: true,
  });
  return engine;
}

function deriveCanonicalReplay(
  proposed: SnakeCheckpointV1,
  previous: SnakeCheckpointV1,
  serverElapsedMs: number
): SnakeCheckpointV1 {
  const trace = parseReplayTrace(proposed.privateState.replay);
  const priorTrace = parseReplayTrace(previous.privateState.replay);
  if (
    trace.ticks < priorTrace.ticks ||
    trace.ticks - priorTrace.ticks > RUN_REPLAY_MAX_TICKS_PER_CHECKPOINT ||
    trace.actions.length < priorTrace.actions.length ||
    trace.actions.length - priorTrace.actions.length >
      RUN_REPLAY_MAX_ACTIONS_PER_CHECKPOINT ||
    !jsonEquivalent(
      trace.actions.slice(0, priorTrace.actions.length),
      priorTrace.actions
    )
  ) {
    rejectCheckpoint('Run checkpoint forks its accepted replay history.');
  }
  const engine = replayEngineFromCheckpoint(previous);
  try {
    engine.applyReplayTrace(trace, priorTrace.actions.length);
  } catch {
    rejectCheckpoint('Run checkpoint contains an impossible replay transition.');
  }
  if (engine.getState().isGameOver) {
    rejectCheckpoint('A terminal replay cannot be stored as a live checkpoint.');
  }
  const canonical = engine.exportCheckpoint();
  canonical.state.startTime = null;
  canonical.privateState.elapsedMs = serverElapsedMs;
  if (!jsonEquivalent(replayComparable(proposed), replayComparable(canonical))) {
    rejectCheckpoint('Run checkpoint does not equal its deterministic replay.');
  }
  return canonical;
}

function validateCheckpointBoard(
  checkpoint: SnakeCheckpointV1,
  previous: SnakeCheckpointV1 | null,
  dynasty: keyof typeof RULESETS
): void {
  const { state } = checkpoint;
  const gridSize = checkpoint.config.gridSize;
  const snake = state.snake.map((cell, index) =>
    checkpointCell(cell, gridSize, `snake[${index}]`)
  );
  const torus = RULESETS[dynasty].torus === true;
  for (let index = 1; index < snake.length; index += 1) {
    const prior = snake[index - 1];
    const current = snake[index];
    const rawX = Math.abs(prior.x - current.x);
    const rawZ = Math.abs(prior.z - current.z);
    const dx = torus ? Math.min(rawX, gridSize - rawX) : rawX;
    const dz = torus ? Math.min(rawZ, gridSize - rawZ) : rawZ;
    // Growth duplicates the tail cell. Every other pair must be one cardinal
    // move apart (including the COSMIC wrap edge).
    if (!((dx === 0 && dz === 0) || dx + dz === 1)) {
      rejectCheckpoint('Run checkpoint contains a disconnected snake body.');
    }
  }

  if (!Array.isArray(state.foods) || state.foods.length > 12) {
    rejectCheckpoint('Run checkpoint contains an invalid food wave.');
  }
  const foods = state.foods.map((cell, index) =>
    checkpointCell(cell, gridSize, `foods[${index}]`)
  );
  const primary = checkpointCell(state.food, gridSize, 'primary food');
  if (foods.length > 0 && !jsonEquivalent(primary, foods[0])) {
    rejectCheckpoint('Run checkpoint primary food disagrees with its wave.');
  }
  const foodIds = new Set(foods.map(cellId));
  if (foodIds.size !== foods.length) {
    rejectCheckpoint('Run checkpoint contains duplicate food cells.');
  }

  if (!Array.isArray(state.terrain) || state.terrain.length > gridSize * gridSize) {
    rejectCheckpoint('Run checkpoint contains invalid terrain.');
  }
  const terrain = state.terrain.map((raw, index) => {
    const block = objectRecord(raw);
    const cell = checkpointCell({ ...block, y: 0 }, gridSize, `terrain[${index}]`);
    const formingTicks = safeInteger(block?.formingTicks);
    const formingTotal = safeInteger(block?.formingTotal);
    if (
      !block ||
      !['cyber', 'fortress', 'cosmic', 'ladder'].includes(String(block.source)) ||
      formingTicks === null ||
      formingTotal === null ||
      formingTicks > formingTotal ||
      typeof block.solid !== 'boolean'
    ) {
      rejectCheckpoint('Run checkpoint contains malformed terrain.');
    }
    return {
      ...cell,
      source: String(block.source),
      formingTicks,
      formingTotal,
      solid: block.solid as boolean,
    };
  });
  const terrainByCell = new Map(terrain.map((block) => [cellId(block), block]));
  if (terrainByCell.size !== terrain.length) {
    rejectCheckpoint('Run checkpoint contains duplicate terrain cells.');
  }
  const snakeIds = new Set(snake.map(cellId));
  for (const block of terrain) {
    if (block.solid === true && snakeIds.has(cellId(block))) {
      rejectCheckpoint('Run checkpoint overlaps the snake with solid terrain.');
    }
  }
  for (const food of foods) {
    const id = cellId(food);
    if (snakeIds.has(id) || terrainByCell.get(id)?.solid === true) {
      rejectCheckpoint('Run checkpoint places food in an occupied cell.');
    }
  }

  for (const [label, value] of [
    ['exit', state.exitTile],
    ['second exit', state.exitTile2],
    ['gene offer', state.mutationTile],
  ] as const) {
    if (value === null) continue;
    const cell = checkpointCell(value, gridSize, label);
    if (terrainByCell.get(cellId(cell))?.solid === true) {
      rejectCheckpoint(`Run checkpoint places the ${label} in solid terrain.`);
    }
  }

  if (previous) {
    const currentTerrain = terrainByCell;
    for (const rawPrevious of previous.state.terrain) {
      const prior = objectRecord(rawPrevious)!;
      const current = currentTerrain.get(`${prior.x}:${prior.z}`);
      if (
        !current ||
        current.source !== prior.source ||
        current.formingTotal !== prior.formingTotal ||
        (prior.solid === true && current.solid !== true) ||
        (prior.solid !== true && current.solid !== true &&
          Number(current.formingTicks) > Number(prior.formingTicks))
      ) {
        rejectCheckpoint('Run checkpoint rewrites permanent terrain history.');
      }
    }
  }
}

function validateCheckpointGenome(
  checkpoint: SnakeCheckpointV1,
  previous: SnakeCheckpointV1 | null,
  foodEaten: number
): void {
  const { state, privateState, config } = checkpoint;
  if (privateState.drivenRun !== false || !Array.isArray(state.lossEvents) || state.lossEvents.length > 0) {
    rejectCheckpoint('Run checkpoint contains an unsupported authored or length-loss state.');
  }
  if (
    !Array.isArray(state.heldMutations) ||
    state.heldMutations.length > (config.genome ? 6 : 4) ||
    !state.heldMutations.every((pick) =>
      (config.genome ? isGeneId(pick?.id) : isMutationId(pick?.id)) &&
      safeInteger(pick?.atFood) !== null &&
      pick.atFood <= foodEaten
    ) ||
    new Set(state.heldMutations.map((pick) => pick.id)).size !== state.heldMutations.length
  ) {
    rejectCheckpoint('Run checkpoint contains impossible held genes.');
  }
  for (const [label, entries] of [
    ['infuse', state.infuses],
    ['surge', state.surges],
    ['pressure', state.pressureEvents],
  ] as const) {
    if (!Array.isArray(entries) || entries.length > foodEaten + 1) {
      rejectCheckpoint(`Run checkpoint contains impossible ${label} history.`);
    }
  }
  if (
    !state.infuses.every((entry) => safeInteger(entry?.atFood) !== null && entry.atFood <= foodEaten) ||
    !state.surges.every((entry) =>
      typeof entry?.strain === 'string' && safeInteger(entry.atFood) !== null && entry.atFood <= foodEaten
    ) ||
    !state.pressureEvents.every((entry) =>
      ['thick_hide', 'ouroboros'].includes(String(entry?.source)) &&
      safeInteger(entry?.atFood) !== null && entry.atFood <= foodEaten
    )
  ) {
    rejectCheckpoint('Run checkpoint contains malformed genome event history.');
  }
  const tierCap = config.genome?.ftue?.expressionsUnlocked === false
    ? 1
    : config.genome?.ftue?.apexesUnlocked === false
      ? 2
      : 3;
  const view = !config.genome
    ? { loose: [], splices: [] }
    : config.genome.ftue?.splicesUnlocked === false
      ? { loose: [...state.heldMutations], splices: [] }
      : fusePicks(state.heldMutations);
  const lengthView = config.genome
    ? view
    : { loose: [...state.heldMutations], splices: [] };
  const activations = config.genome
    ? strainActivations(
        state.heldMutations,
        config.genome.heirloom ?? {},
        state.surges,
        tierCap,
        config.genome.suppressedStrains ?? [],
        config.genome.strainThresholdDelta ?? {}
      )
    : strainActivations([], {});
  if (
    !jsonEquivalent(privateState.fusedView, view) ||
    !jsonEquivalent(privateState.activations, config.genome ? activations : null)
  ) {
    rejectCheckpoint('Run checkpoint rewrites derived genome state.');
  }
  const trace = computeLengthTrace(
    lengthView,
    foodEaten + 1,
    activations,
    {
      infuses: state.infuses,
      lossEvents: [],
      pressureEvents: state.pressureEvents,
      revive: state.revive,
      growthProfileId: config.growthProfileId,
      ladderRung: config.ladderRung,
    },
    config.anomaly,
    config.ruleset
  );
  const settledTrace = computeLengthTrace(
    lengthView,
    foodEaten,
    activations,
    {
      infuses: state.infuses,
      lossEvents: [],
      pressureEvents: state.pressureEvents,
      revive: state.revive,
      growthProfileId: config.growthProfileId,
      ladderRung: config.ladderRung,
    },
    config.anomaly,
    config.ruleset
  );
  const petrified = settledTrace.petrifyEvents.reduce(
    (total, event) => total + event.segments,
    0
  );
  const modeledLength = trace.lengthAtEat[foodEaten + 1];
  if (
    privateState.petrified !== petrified ||
    state.snake.length + petrified !== modeledLength ||
    !jsonEquivalent(privateState.lengthTrace, settledTrace)
  ) {
    rejectCheckpoint('Run checkpoint rewrites the monotonic body-length history.');
  }

  // Speed is deterministic from the immutable dynasty curve plus the held
  // Time Dilation gene and the server-derived VOLT tier. Restoring a claimed
  // interval here would otherwise let a competitive run resume in slow motion.
  const voltTier = config.genome
    ? Math.min(
        tierCap,
        strainTierAtFood(activations.VOLT, foodEaten + 0.5)
      )
    : 0;
  const hasTimeDilation = state.heldMutations.some(
    (pick) => pick.id === 'time_dilation'
  );
  let speedOffset = 0;
  let speedSlowMs = 0;
  if (hasTimeDilation) {
    speedOffset += MUTATION_PHYSICS.timeDilationCyberFoodOffset;
    speedSlowMs += MUTATION_PHYSICS.timeDilationSlowMs;
  }
  if (voltTier >= 1) {
    speedOffset += STRAIN_PHYSICS.tempoCyberFoodOffset;
    speedSlowMs += STRAIN_PHYSICS.tempoSlowMs;
  }
  const ruleset = RULESETS[config.ruleset];
  let expectedSpeed = config.ruleset === 'CYBER'
    ? ruleset.speedForFood(Math.max(0, foodEaten - speedOffset))
    : ruleset.speedForFood(foodEaten) + speedSlowMs;
  if (voltTier >= 3) {
    expectedSpeed = Math.max(
      STRAIN_PHYSICS.tickFloorMs,
      Math.floor(
        expectedSpeed * STRAIN_PHYSICS.overclockedRealityTickFactor
      )
    );
  }
  if (privateState.speed !== expectedSpeed) {
    rejectCheckpoint('Run checkpoint rewrites the authoritative tick speed.');
  }

  // Tactical pauses are earned from one published profile and modeled body
  // length. Accepting an arbitrary counter would turn a scarce Cosmic planning
  // resource into unlimited pauses after recovery.
  const holdProfile = config.ruleset === 'COSMIC'
    ? GAME_CONFIG.session.holds.cosmic
    : {
        base: GAME_CONFIG.session.holds.base,
        bonusAtLengths: GAME_CONFIG.session.holds.bonusAtLengths,
        bonusPerThreshold: 1,
      };
  const expectedHoldBudget = holdProfile.bonusAtLengths.reduce(
    (budget, threshold) =>
      budget + (modeledLength >= threshold ? holdProfile.bonusPerThreshold : 0),
    ladderHoldBase(holdProfile.base, config.ladderRung)
  );
  if (state.holdBudget !== expectedHoldBudget) {
    rejectCheckpoint('Run checkpoint rewrites the tactical hold budget.');
  }

  const integerCounters = [
    state.holdsUsed,
    state.holdBudget,
    privateState.portalIndex,
    privateState.portalsMet,
    privateState.offerIndex,
    privateState.petrified,
    privateState.ouroborosBites,
    privateState.warpSkinLastRecharge,
    privateState.pocketRiftLastRecharge,
    privateState.lastSingularityPullAtFood,
  ];
  if (
    integerCounters.some((value) => safeInteger(value) === null) ||
    state.holdsUsed > state.holdBudget ||
    privateState.portalsMet > privateState.portalIndex ||
    privateState.warpSkinLastRecharge > foodEaten ||
    privateState.pocketRiftLastRecharge > foodEaten ||
    privateState.lastSingularityPullAtFood > foodEaten
  ) {
    rejectCheckpoint('Run checkpoint contains impossible run counters.');
  }

  if (previous) {
    if (
      !prefixEqual(previous.state.heldMutations, state.heldMutations) ||
      !prefixEqual(previous.state.infuses, state.infuses) ||
      !prefixEqual(previous.state.surges, state.surges) ||
      !prefixEqual(previous.state.pressureEvents, state.pressureEvents) ||
      (previous.state.revive !== null && !jsonEquivalent(previous.state.revive, state.revive)) ||
      state.holdsUsed < previous.state.holdsUsed ||
      state.holdBudget < previous.state.holdBudget ||
      privateState.portalIndex < previous.privateState.portalIndex ||
      privateState.portalsMet < previous.privateState.portalsMet ||
      privateState.offerIndex < previous.privateState.offerIndex ||
      privateState.petrified < previous.privateState.petrified ||
      privateState.ouroborosBites < previous.privateState.ouroborosBites ||
      privateState.warpSkinLastRecharge < previous.privateState.warpSkinLastRecharge ||
      privateState.pocketRiftLastRecharge < previous.privateState.pocketRiftLastRecharge ||
      privateState.lastSingularityPullAtFood < previous.privateState.lastSingularityPullAtFood
    ) {
      rejectCheckpoint('Run checkpoint rewinds accepted genome or resource history.');
    }
  }
}

/**
 * Validate a browser checkpoint as a bounded continuation proposal.
 *
 * The checkpoint never becomes payout authority: settlement still recomputes
 * harvest from the immutable session and its bounded end facts. This gate binds
 * the proposal to the server-issued simulation, refuses physical/time rewinds,
 * and stores only a live, size-bounded state. Once accepted, the server copy is
 * the sole resumable truth returned to clients.
 *
 * Residual boundary: this is deep invariant validation, not a server replay of
 * every turn between checkpoints. It proves deterministic opening/cursor
 * binding, physical and monotonic state shape, and bounded elapsed progress;
 * it cannot prove the exact intermediate steering path. Consequently a
 * checkpoint is continuity authority only. Terminal payout remains the
 * independently recomputed, server-validated session result.
 */
export function validateRunCheckpoint(
  value: unknown,
  context: {
    manifest: RunStartManifest;
    startedAt: string;
    now?: number;
    previous?: SnakeCheckpointV1 | null;
    opening?: boolean;
    rulesVersion?: string | null;
  }
): SnakeCheckpointV1 {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new RunContinuityError('Run checkpoint is not serializable.', 'invalid_checkpoint');
  }
  if (!encoded || Buffer.byteLength(encoded, 'utf8') > RUN_CHECKPOINT_MAX_BYTES) {
    throw new RunContinuityError('Run checkpoint is too large.', 'invalid_checkpoint');
  }

  const checkpoint = objectRecord(value);
  const config = objectRecord(checkpoint?.config);
  const state = objectRecord(checkpoint?.state);
  const privateState = objectRecord(checkpoint?.privateState);
  const rng = objectRecord(checkpoint?.rng);
  if (
    checkpoint?.version !== 1 ||
    checkpoint.engineVersion !== 'snake-engine-v1' ||
    checkpoint.rulesVersion !== SNAKE_RULES_VERSION ||
    !config ||
    !state ||
    !privateState ||
    !rng ||
    state.isPlaying !== true ||
    state.isGameOver === true ||
    state.isDeathSequence === true
  ) {
    throw new RunContinuityError('Run checkpoint is not a live resolved state.', 'invalid_checkpoint');
  }

  const simulation = objectRecord(context.manifest.simulation);
  const runSnake = objectRecord(context.manifest.runSnake);
  const simulationSeed = simulation?.version === 1 && typeof simulation.seed === 'string'
    ? simulation.seed
    : null;
  const manifestRulesVersion = typeof simulation?.rulesVersion === 'string'
    ? simulation.rulesVersion
    : null;
  if (
    !simulationSeed ||
    manifestRulesVersion !== SNAKE_RULES_VERSION ||
    (context.rulesVersion != null && context.rulesVersion !== SNAKE_RULES_VERSION)
  ) {
    throw new RunContinuityError('Run has no resumable simulation.', 'invalid_checkpoint');
  }
  const expectedRngSeed = StatefulRng.fromSeed(simulationSeed).snapshot().seed;
  if (
    rng.version !== 1 ||
    rng.algorithm !== 'mulberry32' ||
    safeInteger(rng.seed) !== expectedRngSeed ||
    safeInteger(rng.state) === null ||
    safeInteger(rng.draws) === null
  ) {
    throw new RunContinuityError('Run checkpoint does not match its simulation.', 'invalid_checkpoint');
  }
  try {
    // Seed + draw count uniquely determine Mulberry32's internal cursor. This
    // prevents a client from retaining its progress while choosing a more
    // favorable future random stream.
    StatefulRng.restore(rng as unknown as StatefulRngSnapshot);
  } catch {
    throw new RunContinuityError('Run checkpoint does not match its simulation.', 'invalid_checkpoint');
  }

  const expectedDynasty = normalizeDynastyName(
    typeof runSnake?.dynasty === 'string' ? runSnake.dynasty : 'PRIMAL'
  );
  const ladder = objectRecord(context.manifest.ladder);
  const anomaly = objectRecord(context.manifest.anomaly);
  const expectedTraits = sanitizeTraits(context.manifest.traits);
  const suppliedMutationPool = Array.isArray(context.manifest.mutationPool)
    ? context.manifest.mutationPool.filter(isMutationId)
    : [];
  const expectedMutationPool = suppliedMutationPool.length > 0
    ? suppliedMutationPool
    : [...MUTATION_POOL];
  const expectedGrowth = resolveGrowthProfile(context.manifest.growthProfile);
  const expectedLadderRung = resolveLadderRung(ladder?.rung);
  const expectedAnomaly = isAnomalyId(context.manifest.condition)
    ? context.manifest.condition
    : isAnomalyId(anomaly?.id)
      ? anomaly.id
      : null;
  const expectedGenome = sanitizeGenomeCapability(context.manifest.genome);
  if (
    config.ruleset !== expectedDynasty ||
    safeInteger(config.gridSize, 4) !== GAME_CONFIG.board.gridSize ||
    safeInteger(config.initialLength, 1) !== expectedGrowth.initialLength ||
    config.growthProfileId !== expectedGrowth.id ||
    safeInteger(config.ladderRung) !== expectedLadderRung ||
    config.anomaly !== expectedAnomaly ||
    !jsonEquivalent(config.traits, expectedTraits) ||
    !jsonEquivalent(config.mutationPool, expectedMutationPool) ||
    !jsonEquivalent(config.genome ?? null, expectedGenome)
  ) {
    throw new RunContinuityError('Run checkpoint does not match its start manifest.', 'invalid_checkpoint');
  }

  const elapsedMs = safeInteger(privateState.elapsedMs);
  const foodEaten = safeInteger(state.foodEaten);
  const score = safeInteger(state.score);
  const dnaCollected = safeInteger(state.dnaCollected);
  const rngDraws = safeInteger(rng.draws);
  const snake = Array.isArray(state.snake) ? state.snake : null;
  if (
    elapsedMs === null ||
    foodEaten === null ||
    score === null ||
    dnaCollected === null ||
    !snake ||
    snake.length === 0 ||
    snake.length > 25_000 ||
    rngDraws === null
  ) {
    throw new RunContinuityError('Run checkpoint contains invalid progress facts.', 'invalid_checkpoint');
  }
  if (
    typeof privateState.speed !== 'number' ||
    !Number.isFinite(privateState.speed) ||
    privateState.speed < 20 ||
    privateState.speed > 10_000 ||
    score > 2_147_483_647 ||
    dnaCollected > 2_147_483_647
  ) {
    rejectCheckpoint('Run checkpoint contains impossible simulation counters.');
  }

  const startedAt = Date.parse(context.startedAt);
  const serverElapsedMs = Math.max(0, (context.now ?? Date.now()) - startedAt);
  const maxCheckpointFoods = Math.ceil(
    (elapsedMs / 1_000) *
      RULESETS[expectedDynasty].validation.maxFoodPerSecond *
      RUN_CHECKPOINT_FOOD_RATE_ALLOWANCE
  ) + RUN_CHECKPOINT_FOOD_RATE_ALLOWANCE;
  if (
    !Number.isFinite(startedAt) ||
    elapsedMs > serverElapsedMs + 10_000 ||
    foodEaten > maxCheckpointFoods
  ) {
    throw new RunContinuityError('Run checkpoint exceeds its server time bound.', 'invalid_checkpoint');
  }

  if (context.previous) {
    const previousElapsed = context.previous.privateState.elapsedMs;
    const elapsedDelta = elapsedMs - previousElapsed;
    const foodDelta = foodEaten - checkpointMetric(context.previous, 'foodEaten');
    const drawDelta = rngDraws - context.previous.rng.draws;
    if (
      elapsedMs < previousElapsed ||
      foodEaten < checkpointMetric(context.previous, 'foodEaten') ||
      score < checkpointMetric(context.previous, 'score') ||
      dnaCollected < checkpointMetric(context.previous, 'dnaCollected') ||
      drawDelta < 0
    ) {
      throw new RunContinuityError('Run checkpoint would rewind accepted progress.', 'invalid_checkpoint');
    }
    // Deliberately generous for crowded seeded placement, but finite: a
    // client cannot jump arbitrarily through the stream to shop future boards.
    const maxDrawAdvance =
      2_000 + foodDelta * 20_000 + Math.ceil(elapsedDelta / 10) * 100;
    if (drawDelta > maxDrawAdvance) {
      rejectCheckpoint('Run checkpoint jumps beyond its deterministic RNG budget.');
    }
  }

  const typed = value as SnakeCheckpointV1;

  if (context.opening === true) {
    if (foodEaten !== 0 || score !== 0 || dnaCollected !== 0 || elapsedMs !== 0) {
      rejectCheckpoint('Run activation must begin from the seeded opening.');
    }
    let expected: SnakeCheckpointV1;
    try {
      expected = deterministicOpening(context.manifest, typed);
    } catch {
      rejectCheckpoint('Run opening could not be reproduced from its manifest.');
    }
    if (!jsonEquivalent(normalizedOpening(typed), normalizedOpening(expected!))) {
      rejectCheckpoint('Run activation checkpoint is not the seeded opening.');
    }
    expected!.state.startTime = null;
    expected!.privateState.elapsedMs = 0;
    validateCheckpointBoard(expected!, null, expectedDynasty);
    validateCheckpointGenome(expected!, null, 0);
    return expected!;
  }

  if (!context.previous) {
    rejectCheckpoint('Run checkpoint has no canonical replay base.');
  }
  const canonical = deriveCanonicalReplay(
    typed,
    context.previous!,
    serverElapsedMs
  );
  const canonicalFood = canonical.state.foodEaten;
  validateCheckpointBoard(canonical, context.previous!, expectedDynasty);
  validateCheckpointGenome(canonical, context.previous!, canonicalFood);
  return canonical;
}

export async function findRunByStartRequest(
  supabase: SupabaseClient,
  playerId: string,
  startRequestId: string
): Promise<ContinuityRow | null> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select(CONTINUITY_SELECT)
    .eq('player_id', playerId)
    .eq('start_request_id', startRequestId)
    .maybeSingle();

  if (error) {
    throw new RunContinuityError(
      isMissingRunContinuityInfra(error)
        ? 'Run continuity is being prepared.'
        : 'Could not read the start request.',
      'unavailable'
    );
  }
  return (data as ContinuityRow | null) ?? null;
}

export async function readActiveRun(
  supabase: SupabaseClient,
  playerId: string
): Promise<ActiveRunContract | null> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select(CONTINUITY_SELECT)
    .eq('player_id', playerId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new RunContinuityError(
      isMissingRunContinuityInfra(error)
        ? 'Run continuity is being prepared.'
        : 'Could not read the active run.',
      'unavailable'
    );
  }
  return data ? activeContract(data as ContinuityRow) : null;
}

export function resolveExistingStart(
  row: ContinuityRow,
  fingerprint: string
): RunStartManifest | null {
  if (row.start_request_fingerprint !== fingerprint) {
    throw new RunContinuityError(
      'This start request ID was already used for different run settings.',
      'request_conflict'
    );
  }
  return asManifest(row.start_manifest);
}

export async function stageRunStartFinalization(
  supabase: SupabaseClient,
  input: {
    playerId: string;
    sessionId: string;
    requestedCommitment: number;
    exempt: boolean;
    energyVisible: boolean;
    manifestBase: Record<string, unknown>;
  }
): Promise<void> {
  const reserved = ['sessionId', 'energy', 'charge', 'clanBattle'];
  if (reserved.some((key) => Object.prototype.hasOwnProperty.call(input.manifestBase, key))) {
    throw new RunContinuityError('Start manifest contains a reserved field.', 'unavailable');
  }

  const { data, error } = await supabase
    .from('game_sessions')
    .update({
      start_manifest_draft: input.manifestBase,
      continuity_energy_commitment: input.exempt ? 0 : input.requestedCommitment,
      continuity_exempt: input.exempt,
      continuity_energy_visible: input.energyVisible,
    })
    .eq('id', input.sessionId)
    .eq('player_id', input.playerId)
    .eq('continuity_phase', 'preparing')
    .is('start_manifest', null)
    .is('ended_at', null)
    .is('end_reason', null)
    .select('id');

  if (error) {
    throw new RunContinuityError(
      isMissingRunContinuityInfra(error)
        ? 'Run continuity is being prepared.'
        : 'Could not stage the run start.',
      'unavailable'
    );
  }
  if (!Array.isArray(data) || data.length !== 1) {
    throw new RunContinuityError('Run start changed before it was secured.', 'unavailable');
  }
}

export async function resumePreparingRunStart(
  supabase: SupabaseClient,
  playerId: string,
  row: ContinuityRow
): Promise<RunStartManifest | null> {
  if (
    row.continuity_phase !== 'preparing' ||
    row.start_request_id === null ||
    row.start_request_fingerprint === null ||
    row.start_manifest_draft === null ||
    row.continuity_energy_commitment === null ||
    row.continuity_exempt === null ||
    row.continuity_energy_visible === null
  ) {
    return null;
  }
  return finalizeRunStart(supabase, {
    playerId,
    sessionId: row.id,
    startRequestId: row.start_request_id,
    fingerprint: row.start_request_fingerprint,
    requestedCommitment: row.continuity_energy_commitment,
    exemptionFacts: {
      rewardless: row.continuity_exempt,
      signalObjectiveRunId: null,
      serpentWeekId: null,
    },
    energyVisible: row.continuity_energy_visible,
    manifestBase: row.start_manifest_draft,
  });
}

export async function finalizeRunStart(
  supabase: SupabaseClient,
  input: {
    playerId: string;
    sessionId: string;
    startRequestId: string;
    fingerprint: string;
    requestedCommitment: number;
    exemptionFacts: ChargeExemptionFacts;
    energyVisible: boolean;
    manifestBase: Record<string, unknown>;
  }
): Promise<RunStartManifest> {
  const energy = GAME_CONFIG.economy.energy;
  const battle = GAME_CONFIG.economy.clanBattle;
  const { data, error } = await supabase.rpc('finalize_run_continuity_start', {
    p_player_id: input.playerId,
    p_session_id: input.sessionId,
    p_start_request_id: input.startRequestId,
    p_start_request_fingerprint: input.fingerprint,
    p_manifest_base: input.manifestBase,
    p_energy_visible: input.energyVisible,
    p_commitment: isChargeExempt(input.exemptionFacts)
      ? 0
      : input.requestedCommitment,
    p_exempt: isChargeExempt(input.exemptionFacts),
    p_capacity: energy.capacity,
    p_recovery_interval_seconds: energy.recoveryIntervalSeconds,
    p_commitment_multipliers_bps: [...energy.commitmentMultipliersBps],
    p_battle_epoch: battle.epochUtc,
    p_battle_active_seconds: battle.activeDurationSeconds,
    p_battle_intermission_seconds: battle.intermissionDurationSeconds,
    p_battle_best_count: battle.contributingRunsPerMember,
  });

  if (error) {
    const message = error.message ?? '';
    if (/insufficient_energy/i.test(message)) {
      throw new RunContinuityError('Not enough recovered Energy.', 'insufficient_energy');
    }
    if (/start_request_conflict/i.test(message)) {
      throw new RunContinuityError(
        'This start request ID was already used for different run settings.',
        'request_conflict'
      );
    }
    if (/active_run_exists|duplicate key.*game_sessions_one_open/i.test(message)) {
      throw new RunContinuityError('Another run is already in progress.', 'active_run');
    }
    if (/session_not_found/i.test(message)) {
      throw new RunContinuityError('Run session not found.', 'not_found');
    }
    if (isMissingRunContinuityInfra(error)) {
      throw new RunContinuityError('Run continuity is being prepared.', 'unavailable');
    }
    throw new RunContinuityError('Could not secure the run start.', 'unavailable');
  }

  const manifest = asManifest(data);
  if (!manifest) {
    throw new RunContinuityError('Run start returned no manifest.', 'unavailable');
  }
  return manifest;
}

export async function activateRun(
  supabase: SupabaseClient,
  playerId: string,
  sessionId: string,
  openingCheckpoint: unknown,
  now = Date.now()
): Promise<ActiveRunContract> {
  const { data: rowData, error: rowError } = await supabase
    .from('game_sessions')
    .select(CONTINUITY_SELECT)
    .eq('id', sessionId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (rowError) {
    throw new RunContinuityError(
      isMissingRunContinuityInfra(rowError)
        ? 'Run continuity is being prepared.'
        : 'Could not inspect the prepared run.',
      'unavailable'
    );
  }
  const row = rowData as ContinuityRow | null;
  if (!row || row.ended_at !== null || row.end_reason !== null) {
    throw new RunContinuityError('Run session not found.', 'not_found');
  }
  const manifest = asManifest(row.start_manifest);
  if (row.continuity_phase !== 'prepared' || !manifest) {
    throw new RunContinuityError('The run is not ready to activate.', 'not_prepared');
  }
  const checkpoint = validateRunCheckpoint(openingCheckpoint, {
    manifest,
    startedAt: row.server_started_at ?? row.started_at,
    now,
    opening: true,
    rulesVersion: row.simulation_rules_version,
  });
  const checkpointDigest = createHash('sha256')
    .update(JSON.stringify(checkpoint))
    .digest('hex');
  const lease = createRunLease();
  const { data, error } = await supabase.rpc('activate_run_continuity', {
    p_player_id: playerId,
    p_session_id: sessionId,
    p_checkpoint: checkpoint,
    p_checkpoint_digest: checkpointDigest,
    p_lease_hash: lease.hash,
    p_rules_version: SNAKE_RULES_VERSION,
    p_max_bytes: RUN_CHECKPOINT_MAX_BYTES,
  });
  if (error) {
    const message = error.message ?? '';
    if (/session_not_found/i.test(message)) {
      throw new RunContinuityError('Run session not found.', 'not_found');
    }
    if (/run_not_prepared/i.test(message)) {
      throw new RunContinuityError('The run is not ready to activate.', 'not_prepared');
    }
    if (/run_rules_version_mismatch|invalid_checkpoint/i.test(message)) {
      throw new RunContinuityError('The run opening was rejected.', 'invalid_checkpoint');
    }
    throw new RunContinuityError('Could not activate the run.', 'unavailable');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new RunContinuityError('Run activation returned no state.', 'unavailable');
  }
  return activeContract(data as ContinuityRow, lease.token);
}

export async function resumeRun(
  supabase: SupabaseClient,
  playerId: string,
  sessionId: string
): Promise<ActiveRunContract> {
  const lease = createRunLease();
  const { data, error } = await supabase.rpc('resume_run_continuity', {
    p_player_id: playerId,
    p_session_id: sessionId,
    p_lease_hash: lease.hash,
    p_rules_version: SNAKE_RULES_VERSION,
  });
  if (error) {
    const message = error.message ?? '';
    if (/session_not_found/i.test(message)) {
      throw new RunContinuityError('Run session not found.', 'not_found');
    }
    if (/run_not_resumable/i.test(message)) {
      throw new RunContinuityError('The run has no secured checkpoint.', 'not_prepared');
    }
    throw new RunContinuityError('Could not resume the run.', 'unavailable');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new RunContinuityError('Run resume returned no state.', 'unavailable');
  }
  return activeContract(data as ContinuityRow, lease.token);
}

export interface SavedRunCheckpoint {
  revision: number;
  savedAt: string;
  digest: string;
}

function savedCheckpoint(value: unknown): SavedRunCheckpoint | null {
  const row = objectRecord(value);
  const revision = safeInteger(row?.revision, 1);
  return revision !== null && typeof row?.savedAt === 'string' &&
    typeof row.digest === 'string'
    ? { revision, savedAt: row.savedAt, digest: row.digest }
    : null;
}

/**
 * Accept one monotonic checkpoint through a row-locked, idempotent RPC.
 * The database is the recovery authority; this function never caches the
 * accepted state in process or browser memory as a source of truth.
 */
export async function saveRunCheckpoint(
  supabase: SupabaseClient,
  input: {
    playerId: string;
    sessionId: string;
    expectedRevision: number;
    checkpoint: unknown;
    leaseToken: string;
    now?: number;
  }
): Promise<SavedRunCheckpoint> {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new RunContinuityError('Invalid checkpoint revision.', 'invalid_checkpoint');
  }

  const { data: rowData, error: rowError } = await supabase
    .from('game_sessions')
    .select(CONTINUITY_SELECT)
    .eq('id', input.sessionId)
    .eq('player_id', input.playerId)
    .maybeSingle();
  if (rowError) {
    throw new RunContinuityError(
      isMissingRunContinuityInfra(rowError)
        ? 'Run checkpoints are being prepared.'
        : 'Could not inspect the active run.',
      'unavailable'
    );
  }
  const row = rowData as ContinuityRow | null;
  if (!row || row.ended_at !== null || row.end_reason !== null) {
    throw new RunContinuityError('Run session not found.', 'not_found');
  }
  if (row.continuity_phase !== 'active') {
    throw new RunContinuityError('The run is not active.', 'not_prepared');
  }
  if (!hashMatchesToken(row.continuity_lease_hash, input.leaseToken)) {
    throw new RunContinuityError(
      'This run is open in a newer session.',
      'lease_conflict'
    );
  }
  const manifest = asManifest(row.start_manifest);
  if (!manifest) {
    throw new RunContinuityError('The run has no secured start manifest.', 'not_prepared');
  }

  const checkpoint = validateRunCheckpoint(input.checkpoint, {
    manifest,
    startedAt:
      row.continuity_activated_at ?? row.server_started_at ?? row.started_at,
    now: input.now,
    previous: row.continuity_checkpoint ?? null,
    rulesVersion: row.simulation_rules_version,
  });
  // Wall-clock elapsed and display-event timestamps advance between an
  // accepted write and a lost-response retry. Digest the deterministic replay
  // state instead, so the exact same proposal has one stable idempotency key
  // while server-side duration bounds are still rechecked on every request.
  const digest = createHash('sha256')
    .update(JSON.stringify(replayComparable(checkpoint)))
    .digest('hex');
  const { data, error } = await supabase.rpc('save_run_continuity_checkpoint', {
    p_player_id: input.playerId,
    p_session_id: input.sessionId,
    p_expected_revision: input.expectedRevision,
    p_checkpoint: checkpoint,
    p_checkpoint_digest: digest,
    p_lease_hash: createHash('sha256').update(input.leaseToken).digest('hex'),
    p_max_bytes: RUN_CHECKPOINT_MAX_BYTES,
  });
  if (error) {
    const message = error.message ?? '';
    if (/run_lease_conflict/i.test(message)) {
      throw new RunContinuityError(
        'This run is open in a newer session.',
        'lease_conflict'
      );
    }
    if (/checkpoint_revision_conflict/i.test(message)) {
      throw new RunContinuityError(
        'A newer run checkpoint already exists.',
        'checkpoint_conflict'
      );
    }
    if (/session_not_found/i.test(message)) {
      throw new RunContinuityError('Run session not found.', 'not_found');
    }
    if (/run_not_active|invalid_checkpoint/i.test(message)) {
      throw new RunContinuityError('Run checkpoint was rejected.', 'invalid_checkpoint');
    }
    if (isMissingRunContinuityInfra(error)) {
      throw new RunContinuityError('Run checkpoints are being prepared.', 'unavailable');
    }
    throw new RunContinuityError('Could not secure the run checkpoint.', 'unavailable');
  }
  const accepted = savedCheckpoint(data);
  if (!accepted) {
    throw new RunContinuityError('Checkpoint save returned no receipt.', 'unavailable');
  }
  return accepted;
}

export interface TerminalRunIntent {
  facts: {
    score: number;
    dna_earned: number;
    duration_seconds: number;
    food_count: number;
    extracted: boolean;
    died: boolean;
    victory: false;
    mutations: GameOverData['mutations'];
    phoenix_triggered_at_food: number | null;
    genome: GameOverData['genome'];
    death_cause: GameOverData['deathCause'];
    run_events: ReturnType<SnakeGameLogic['getRunEvents']>;
  };
  digest: string;
}

function deriveTerminalIntent(
  row: ContinuityRow,
  proofValue: unknown,
  now = Date.now()
): TerminalRunIntent {
  const checkpoint = row.continuity_checkpoint;
  const activatedAt = Date.parse(row.continuity_activated_at ?? '');
  if (!checkpoint || !Number.isFinite(activatedAt)) {
    throw new RunContinuityError('The run has no canonical terminal base.', 'not_prepared');
  }
  const priorTrace = parseReplayTrace(checkpoint.privateState.replay);
  const proof = parseTerminalReplayProof(proofValue);
  const overlapCount = priorTrace.actions.length - proof.actionOffset;
  if (
    proof.fromTick > priorTrace.ticks ||
    proof.toTick < priorTrace.ticks ||
    proof.actionOffset > priorTrace.actions.length ||
    overlapCount < 0 ||
    overlapCount > proof.actions.length ||
    !jsonEquivalent(
      proof.actions.slice(0, overlapCount),
      priorTrace.actions.slice(proof.actionOffset)
    )
  ) {
    throw new RunContinuityError('Terminal replay is not based on the accepted checkpoint.', 'checkpoint_conflict');
  }
  const trace: SnakeReplayTrace = {
    ticks: proof.toTick,
    actions: [...priorTrace.actions, ...proof.actions.slice(overlapCount)],
  };
  const elapsedMs = Math.max(0, now - activatedAt);
  const maxTicks = Math.ceil(elapsedMs / 20) + 16;
  if (
    trace.ticks < priorTrace.ticks ||
    trace.ticks > maxTicks ||
    trace.ticks - priorTrace.ticks > RUN_REPLAY_MAX_TICKS_PER_CHECKPOINT ||
    trace.actions.length - priorTrace.actions.length >
      RUN_REPLAY_MAX_ACTIONS_PER_CHECKPOINT
  ) {
    throw new RunContinuityError('Terminal replay forks accepted history.', 'invalid_checkpoint');
  }
  const engine = replayEngineFromCheckpoint(checkpoint);
  try {
    engine.applyReplayTrace(trace, priorTrace.actions.length);
  } catch {
    throw new RunContinuityError('Terminal replay is not physically possible.', 'invalid_checkpoint');
  }
  const result = engine.getTerminalResult();
  if (!result || !engine.getState().isGameOver) {
    throw new RunContinuityError('Terminal replay did not end the run.', 'invalid_checkpoint');
  }
  const facts: TerminalRunIntent['facts'] = {
    score: result.score,
    dna_earned: result.dnaCollected,
    duration_seconds: Math.floor(elapsedMs / 1_000),
    food_count: result.foodEaten,
    extracted: result.extracted,
    died: !result.extracted,
    victory: false,
    mutations: result.mutations,
    phoenix_triggered_at_food: result.phoenixTriggeredAtFood,
    genome: result.genome,
    death_cause: result.deathCause,
    run_events: engine.getRunEvents(),
  };
  if (Buffer.byteLength(JSON.stringify(facts), 'utf8') > RUN_TERMINAL_FACTS_MAX_BYTES) {
    throw new RunContinuityError('Terminal settlement facts exceed their safe bound.', 'invalid_checkpoint');
  }
  const replayDigest = createHash('sha256')
    .update(JSON.stringify(trace))
    .digest('hex');
  return {
    facts,
    // Bind the accepted terminal path without duplicating its potentially
    // large cumulative transcript in the terminal row. The canonical
    // checkpoint already retains the replay prefix under its own size cap.
    digest: createHash('sha256')
      .update(JSON.stringify({
        checkpointRevision: row.continuity_checkpoint_revision,
        replayDigest,
        facts,
      }))
      .digest('hex'),
  };
}

/**
 * Derive and durably lock a terminal outcome under the current lease. Once
 * this returns, resume/checkpoint/abandon are impossible even if settlement
 * validation or the browser process stops immediately afterwards.
 */
export async function stageRunTerminalIntent(
  supabase: SupabaseClient,
  input: {
    playerId: string;
    sessionId: string;
    expectedRevision: number;
    leaseToken: unknown;
    replay: unknown;
    now?: number;
  }
): Promise<TerminalRunIntent> {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw new RunContinuityError('Invalid terminal checkpoint revision.', 'invalid_checkpoint');
  }
  const { data: rowData, error: rowError } = await supabase
    .from('game_sessions')
    .select(CONTINUITY_SELECT)
    .eq('id', input.sessionId)
    .eq('player_id', input.playerId)
    .maybeSingle();
  if (rowError) {
    throw new RunContinuityError('Could not inspect the terminal run.', 'unavailable');
  }
  const row = rowData as ContinuityRow | null;
  if (!row || row.ended_at !== null) {
    throw new RunContinuityError('Run session not found.', 'not_found');
  }
  if (row.continuity_phase !== 'active' && row.continuity_phase !== 'terminal') {
    throw new RunContinuityError('The run cannot accept a terminal result.', 'not_prepared');
  }
  if (!hashMatchesToken(row.continuity_lease_hash, input.leaseToken)) {
    throw new RunContinuityError('This run is open in a newer session.', 'lease_conflict');
  }
  if (row.continuity_phase === 'terminal') {
    const storedFacts = objectRecord(row.continuity_terminal_facts);
    const storedDigest = row.continuity_terminal_digest;
    if (!storedFacts || typeof storedDigest !== 'string') {
      throw new RunContinuityError('The secured run outcome is incomplete.', 'unavailable');
    }
    return {
      facts: storedFacts as unknown as TerminalRunIntent['facts'],
      digest: storedDigest,
    };
  }
  const currentRevision = Number(row.continuity_checkpoint_revision);
  if (
    !Number.isSafeInteger(currentRevision) ||
    currentRevision < input.expectedRevision
  ) {
    throw new RunContinuityError('The terminal checkpoint revision is invalid.', 'checkpoint_conflict');
  }
  const intent = deriveTerminalIntent(row, input.replay, input.now);
  const { data, error } = await supabase.rpc('stage_run_continuity_terminal', {
    p_player_id: input.playerId,
    p_session_id: input.sessionId,
    // A checkpoint response may be lost after PostgreSQL commits. The proof
    // is safely rebased above against the newer canonical prefix under the
    // unchanged lease, then the row-locked RPC binds the actual revision.
    p_expected_revision: currentRevision,
    p_lease_hash: leaseHash(input.leaseToken),
    p_terminal_facts: intent.facts,
    p_terminal_digest: intent.digest,
  });
  if (error) throw terminalError(error);
  const receipt = objectRecord(data);
  if (receipt?.accepted !== true) {
    throw new RunContinuityError('Terminal intent returned no receipt.', 'unavailable');
  }
  return intent;
}

export function terminalFactsFromRow(row: Record<string, unknown>): Record<string, unknown> | null {
  return objectRecord(row.continuity_terminal_facts);
}

function terminalError(error: SupabaseErrorLike): RunContinuityError {
  const message = error.message ?? '';
  if (/run_lease_conflict/i.test(message)) {
    return new RunContinuityError(
      'This run is open in a newer session.',
      'lease_conflict'
    );
  }
  if (/run_not_terminalizable/i.test(message)) {
    return new RunContinuityError(
      'This run is not in a terminalizable state.',
      'not_prepared'
    );
  }
  if (/checkpoint_revision_conflict/i.test(message)) {
    return new RunContinuityError(
      'A newer run checkpoint already exists.',
      'checkpoint_conflict'
    );
  }
  if (/invalid_terminal_intent|terminal_intent_conflict/i.test(message)) {
    return new RunContinuityError(
      'The terminal run result was rejected.',
      'invalid_checkpoint'
    );
  }
  if (/session_not_found/i.test(message)) {
    return new RunContinuityError('Run session not found.', 'not_found');
  }
  return new RunContinuityError(
    isMissingRunContinuityInfra(error)
      ? 'Run continuity is being prepared.'
      : 'Could not secure the run outcome.',
    'unavailable'
  );
}

function leaseHash(token: unknown): string {
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
    throw new RunContinuityError('This run has no active lease.', 'lease_conflict');
  }
  return createHash('sha256').update(token).digest('hex');
}

/** Atomically validates the current lease and stages an earning settlement. */
export async function stageContinuityRunEnd(
  supabase: SupabaseClient,
  input: {
    userId: string;
    playerId: string;
    sessionId: string;
    leaseToken: unknown;
    terminalized?: boolean;
    envelope: Record<string, unknown>;
  }
): Promise<unknown> {
  const { data, error } = await supabase.rpc('stage_continuity_game_session_end', {
    p_user_id: input.userId,
    p_player_id: input.playerId,
    p_session_id: input.sessionId,
    p_lease_hash: input.terminalized === true ? null : leaseHash(input.leaseToken),
    p_envelope: input.envelope,
  });
  if (error) throw terminalError(error);
  return data;
}

/** Atomically validates the current lease and records a rewardless result. */
export async function completeFreeContinuityRun(
  supabase: SupabaseClient,
  input: {
    playerId: string;
    sessionId: string;
    leaseToken: unknown;
    terminalized?: boolean;
    facts: Record<string, unknown>;
  }
): Promise<unknown> {
  const { data, error } = await supabase.rpc('complete_free_run_continuity', {
    p_player_id: input.playerId,
    p_session_id: input.sessionId,
    p_lease_hash: input.terminalized === true ? null : leaseHash(input.leaseToken),
    p_facts: input.facts,
  });
  if (error) throw terminalError(error);
  return data;
}

/**
 * Explicitly abandon a prepared or active continuity run. Prepared sessions
 * have no lease; active sessions require the current one.
 */
export async function abandonContinuityRun(
  supabase: SupabaseClient,
  input: {
    playerId: string;
    sessionId: string;
    phase: unknown;
    leaseToken: unknown;
  }
): Promise<unknown> {
  if (input.phase === 'settling') {
    throw new RunContinuityError(
      'A secured result cannot be abandoned.',
      'not_prepared'
    );
  }
  const doesNotUseLease =
    input.phase === 'preparing' ||
    input.phase === 'prepared' ||
    input.phase === 'incompatible';
  const { data, error } = await supabase.rpc('abandon_run_continuity', {
    p_player_id: input.playerId,
    p_session_id: input.sessionId,
    p_lease_hash: doesNotUseLease ? null : leaseHash(input.leaseToken),
    p_rules_version: SNAKE_RULES_VERSION,
  });
  if (error) throw terminalError(error);
  return data;
}

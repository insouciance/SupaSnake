/**
 * Contracts API utilities - pure mapping/decision logic
 *
 * Design v2 section 7.3: each day the player is offered 3 contracts from
 * the pool and picks 2. All state lives server-side (player_contracts +
 * the offer/pick/claim RPCs in migration 015); these helpers only map RPC
 * rows to the API shape and mirror the deterministic offer selection for
 * tests.
 */

import { createHash } from 'crypto';

export interface ContractProgress {
  current: number;
  target: number;
}

export interface ContractView {
  contractId: string;
  contractType: string;
  name: string;
  description: string;
  params: Record<string, unknown>;
  rewardDna: number;
  rewardEnergy: number;
  rewardXp: number;
  offeredSlot: number;
  picked: boolean;
  progress: ContractProgress;
  completed: boolean;
  claimed: boolean;
}

export interface ContractClaimResult {
  contractId: string;
  dnaGranted: number;
  energyGranted: number;
  xpGranted: number;
}

/** Raw row shape returned by the offer/pick RPCs (migration 015) */
export interface ContractRpcRow {
  contract_id: string;
  contract_type: string;
  name: string;
  description: string;
  params: Record<string, unknown> | null;
  reward_dna: number;
  reward_energy: number;
  reward_xp: number;
  offered_slot: number;
  picked: boolean;
  progress: { current?: number; target?: number } | null;
  completed_at: string | null;
  claimed_at: string | null;
}

/** Map an offer/pick RPC row (snake_case) to the API shape */
export function mapContractRow(row: ContractRpcRow): ContractView {
  return {
    contractId: row.contract_id,
    contractType: row.contract_type,
    name: row.name,
    description: row.description,
    params: row.params ?? {},
    rewardDna: row.reward_dna,
    rewardEnergy: row.reward_energy,
    rewardXp: row.reward_xp,
    offeredSlot: row.offered_slot,
    picked: row.picked,
    progress: {
      current: row.progress?.current ?? 0,
      target: row.progress?.target ?? 0,
    },
    completed: row.completed_at !== null,
    claimed: row.claimed_at !== null,
  };
}

/** Picks remaining today: 2 per day, cumulative and irreversible */
export function computePicksRemaining(contracts: Pick<ContractView, 'picked'>[]): number {
  const picked = contracts.filter((c) => c.picked).length;
  return Math.max(0, 2 - picked);
}

/** Map a claim_contract RPC row (snake_case) to the API shape */
export function mapClaimRow(row: {
  contract_id: string;
  dna_granted: number;
  energy_granted: number;
  xp_granted: number;
}): ContractClaimResult {
  return {
    contractId: row.contract_id,
    dnaGranted: row.dna_granted,
    energyGranted: row.energy_granted,
    xpGranted: row.xp_granted,
  };
}

/**
 * Map pick_contracts RPC errors to HTTP status codes.
 * The RPC raises exceptions with descriptive messages.
 */
export function mapPickErrorStatus(message: string | null | undefined): number {
  const msg = (message || '').toLowerCase();
  if (msg.includes('pick limit reached')) return 409;
  if (msg.includes('not offered today')) return 404;
  if (msg.includes('player not found')) return 404;
  return 400;
}

/**
 * Map claim_contract RPC errors to HTTP status codes.
 * Already-claimed and not-complete are conflicts with current server
 * state (retryable after play), not malformed requests.
 */
export function mapClaimErrorStatus(message: string | null | undefined): number {
  const msg = (message || '').toLowerCase();
  if (msg.includes('already claimed')) return 409;
  if (msg.includes('not complete')) return 409;
  if (msg.includes('not offered today')) return 404;
  if (msg.includes('player not found')) return 404;
  if (msg.includes('not picked')) return 400;
  return 400;
}

/**
 * Deterministic daily offer selection - exact TS mirror of the SQL in
 * offer_daily_contracts (migration 015):
 *
 *   ORDER BY md5(player_id || date || contract_id), contract_id LIMIT 3
 *
 * Same player + same UTC date always yields the same 3 offers, with no
 * stored seed; different players/days shuffle independently. Keep the two
 * implementations in lockstep - the tests assert the mirror's properties.
 */
export function selectDailyOffers(
  playerId: string,
  date: string,
  activePool: readonly string[],
  count = 3
): string[] {
  return [...activePool]
    .map((id) => ({
      id,
      key: createHash('md5').update(`${playerId}${date}${id}`).digest('hex'),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.id < b.id ? -1 : 1))
    .slice(0, count)
    .map((entry) => entry.id);
}

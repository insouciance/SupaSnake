/**
 * Energy envelope — server authority (Constitution §8.6, Rule 11).
 *
 * The only code in the product that may write the charge ledger. Reads are
 * pure and lazy: `readChargeStatus` never writes, so a GET can never advance
 * a clock. The single write is `consumeRunCharge`, which delegates to the
 * `consume_run_charge` RPC (migration 039) so that the read-modify-write is
 * atomic under a row lock — two concurrent run starts can never both take
 * the last charge.
 *
 * PRE-MIGRATION-039 SAFE: until 039 applies, the ledger columns and the RPC
 * do not exist. Every helper degrades to a full, unconsumed day — a missing
 * migration must never make a player's runs settle lean (Rule 5: absence is
 * never destructive, and a deploy gap is the operator's absence, not the
 * player's).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { GAME_CONFIG } from '@/shared/config/game';
import {
  isChargeExempt,
  resolveChargeStatus,
  type ChargeExemptionFacts,
  type ChargeLedger,
  type ChargeState,
  type ChargeStatus,
} from '@/shared/game/energyEnvelope';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * True when the error just means migration 039 has not been applied yet:
 * missing column (42703), missing RPC (42883 / PostgREST PGRST202), missing
 * relation (42P01), or a message naming the envelope objects.
 */
export function isMissingEnvelopeInfra(
  error: SupabaseErrorLike | null | undefined
): boolean {
  if (!error) return false;
  if (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === '42883' ||
    error.code === 'PGRST202'
  ) {
    return true;
  }
  return /charges_day|charges_used|consume_run_charge|charge_state/i.test(
    error.message || ''
  );
}

/** A day that has consumed nothing — the safe degradation for every path. */
const FULL_DAY_LEDGER: ChargeLedger = { chargesDay: null, chargesUsed: 0 };

/**
 * Read the player's charge status without writing anything.
 *
 * Never fails the caller: a missing ledger (pre-039, or a brand-new row)
 * reads as a full day, which is exactly what it is.
 */
export async function readChargeStatus(
  supabase: SupabaseClient,
  playerId: string,
  now: Date | number = Date.now()
): Promise<ChargeStatus> {
  const { data, error } = await supabase
    .from('players')
    .select('charges_day, charges_used')
    .eq('id', playerId)
    .single();

  if (error) {
    if (!isMissingEnvelopeInfra(error)) {
      console.error('Charge ledger read failed:', { playerId, error });
      Sentry.captureException(
        new Error(`readChargeStatus failed: ${error.message}`),
        { extra: { playerId, code: error.code } }
      );
    }
    return resolveChargeStatus(FULL_DAY_LEDGER, now);
  }

  return resolveChargeStatus(
    {
      chargesDay: (data?.charges_day as string | null) ?? null,
      chargesUsed: (data?.charges_used as number | null) ?? 0,
    },
    now
  );
}

export interface ConsumeChargeResult {
  /** How this run settles. Stamp it on the session row. */
  state: ChargeState;
  /** The status AFTER this run's consumption, for the response/HUD. */
  status: ChargeStatus;
}

/**
 * Decide and record how a starting run settles against the envelope.
 *
 * Order matters: exemption is checked FIRST, so a Signal objective run or a
 * Serpent attempt never touches the ledger even when charges are available
 * (§8.6 — "the rituals are always full-fat"). Only a non-exempt run reaches
 * the RPC, and only the RPC can move `charges_used`.
 *
 * A run is NEVER blocked. When the day's allotment is empty the RPC reports
 * `charged: false` and the run starts anyway, settling lean.
 */
export async function consumeRunCharge(
  supabase: SupabaseClient,
  playerId: string,
  facts: ChargeExemptionFacts,
  now: Date | number = Date.now()
): Promise<ConsumeChargeResult> {
  if (isChargeExempt(facts)) {
    return { state: 'exempt', status: await readChargeStatus(supabase, playerId, now) };
  }

  const { data, error } = await supabase.rpc('consume_run_charge', {
    p_player_id: playerId,
    p_charges_per_day: GAME_CONFIG.economy.energy.chargesPerDay,
  });

  if (error) {
    // The envelope is a pacing layer, never a gate. If the ledger is
    // unreachable the run still starts and — deliberately — settles at FULL
    // strength: a server fault must not quietly cut a player's harvest to a
    // quarter. Under-charging on an outage is the honest failure direction.
    if (!isMissingEnvelopeInfra(error)) {
      console.error('consume_run_charge RPC failed:', { playerId, error });
      Sentry.captureException(
        new Error(`consume_run_charge failed: ${error.message}`),
        { extra: { playerId, code: error.code } }
      );
    }
    return { state: 'charged', status: resolveChargeStatus(FULL_DAY_LEDGER, now) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { charged?: boolean; charges_day?: string; charges_used?: number }
    | null;

  const status = resolveChargeStatus(
    {
      chargesDay: row?.charges_day ?? null,
      chargesUsed: row?.charges_used ?? 0,
    },
    now
  );

  return { state: row?.charged === true ? 'charged' : 'lean', status };
}

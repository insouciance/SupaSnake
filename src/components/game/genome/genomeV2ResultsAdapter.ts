import { GENOME_V2_GENES } from '@/shared/game/genes';
import {
  GENOME_RULES_V2,
  GENOME_V2_SPLICES,
  type GenomeV2RunRecord,
  type GenomeV2SettlementBreakdown,
} from '@/shared/game/genomeV2';
import type {
  GenomeYieldRecapModel,
  GenomeYieldRecapRow,
} from './GenomeYieldRecap';
import { genomeV2PresentationFormat } from './genomeV2PresentationAdapter';

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** A display boundary only. Server validation remains settlement authority. */
export function parseGenomeV2RunRecord(value: unknown): GenomeV2RunRecord | null {
  const raw = record(value);
  const settlement = record(raw?.settlement);
  if (
    raw?.v !== GENOME_RULES_V2 ||
    !['PRIMAL', 'CYBER', 'COSMIC'].includes(String(raw.dynasty)) ||
    !Array.isArray(raw.slots) ||
    raw.slots.length !== 6 ||
    !record(raw.instances) ||
    !Array.isArray(raw.activeSplices) ||
    !settlement ||
    settlement.v !== GENOME_RULES_V2 ||
    !['bank', 'crash'].includes(String(settlement.terminal))
  ) {
    return null;
  }
  const integerFields = [
    'baseYield',
    'exclusiveTargetDelta',
    'continuousDelta',
    'loanEscrowDeposited',
    'loanEscrowReleased',
    'loanEscrowForfeited',
    'bankableBeforeOutcome',
    'bondCount',
    'bondBonus',
    'mirrorRawDiverted',
    'mirrorStakeFrozen',
    'mirrorStakePaid',
    'mirrorStakeForfeited',
    'carryPasses',
    'carryMultiplierBps',
    'carryYield',
    'genomeYield',
    'harvestEligibleYield',
  ];
  if (integerFields.some((field) => !Number.isSafeInteger(settlement[field]))) return null;
  return raw as unknown as GenomeV2RunRecord;
}

function signedScaled(value: number): string {
  if (value === 0) return '0 Yield';
  const absolute = genomeV2PresentationFormat.scaledYield(value);
  return value > 0 ? `+${absolute}` : absolute;
}

/**
 * Whole Yield units for the numeric fallback. Rounds, so it agrees with the
 * rounded `amountLabel` rendered beside it.
 */
function integerFallback(value: number): number {
  return Math.round(value / 10_000);
}

function row(
  id: string,
  label: string,
  amount: number,
  detail: string,
  tone: GenomeYieldRecapRow['tone'] = amount < 0 ? 'forfeit' : amount > 0 ? 'gain' : 'neutral'
): GenomeYieldRecapRow {
  return {
    id,
    label,
    amount: integerFallback(amount),
    amountLabel: signedScaled(amount),
    detail,
    tone,
  };
}

function settlementRows(settlement: GenomeV2SettlementBreakdown): GenomeYieldRecapRow[] {
  const expanded = settlement as GenomeV2SettlementBreakdown & Partial<{
    ladderDividendBonus: number;
    loomBondBonus: number;
    treasuryReserve: number;
    treasuryPaid: number;
    treasuryForfeited: number;
    crownBondReserve: number;
    crownBondPaid: number;
    crownBondForfeited: number;
    ashenStakeReserve: number;
    ashenStakePaid: number;
    ashenStakeForfeited: number;
    covenantShieldPaid: number;
  }>;
  return [
    row('exclusive-targets', 'Exclusive target execution', settlement.exclusiveTargetDelta, 'Only one target identity resolves at a time.'),
    row('continuous', 'Continuous Genome rules', settlement.continuousDelta, 'Pressure-scaled and other continuous effects.'),
    row('loan-release', 'Loan Escrow released', settlement.loanEscrowReleased, 'Completed contract value returned to the run.'),
    row('loan-forfeit', 'Loan Escrow forfeited', -settlement.loanEscrowForfeited, 'Incomplete contract value did not enter settlement.'),
    row('bonds', `BANK Bonds (${settlement.bondCount})`, settlement.bondBonus, 'Prospective Bonds pay only on BANK.'),
    row('ladder-dividend', 'AURUM execution dividend', expanded.ladderDividendBonus ?? 0, 'A visible ladder dividend paid only on BANK.'),
    row('loom-bond', 'Loom Bond matured', expanded.loomBondBonus ?? 0, 'A pinned gene matured into a BANK-only Genome bonus.'),
    row('treasury-paid', 'Treasury reserve paid', expanded.treasuryPaid ?? 0, `${genomeV2PresentationFormat.scaledYield(expanded.treasuryReserve ?? 0)} was exposed in Treasury.`),
    row('treasury-forfeit', 'Treasury reserve forfeited', -(expanded.treasuryForfeited ?? 0), 'Crash forfeited this visible deferred reserve.'),
    row('crown-bond-paid', 'Crown Bond paid', expanded.crownBondPaid ?? 0, `${genomeV2PresentationFormat.scaledYield(expanded.crownBondReserve ?? 0)} was exposed in the Crown Bond.`),
    row('crown-bond-forfeit', 'Crown Bond forfeited', -(expanded.crownBondForfeited ?? 0), 'Crash forfeited this visible Splice reserve.'),
    row('ashen-stake-paid', 'Ashen Stake paid', expanded.ashenStakePaid ?? 0, `${genomeV2PresentationFormat.scaledYield(expanded.ashenStakeReserve ?? 0)} was exposed in the Ashen Stake.`),
    row('ashen-stake-forfeit', 'Ashen Stake forfeited', -(expanded.ashenStakeForfeited ?? 0), 'Crash forfeited this visible survival reserve.'),
    row('covenant-shield', 'Covenant crash shield', expanded.covenantShieldPaid ?? 0, 'A bounded shield recovered part of visible forfeitable risk.'),
    row('mirror-paid', 'Mirror Stake paid', settlement.mirrorStakePaid, 'Frozen Stake doubled at BANK.'),
    row('mirror-forfeit', 'Mirror Stake forfeited', -settlement.mirrorStakeForfeited, 'Crash removes the Stake, not ordinary salvage.'),
    row('carry', `Carry ${genomeV2PresentationFormat.bps(settlement.carryMultiplierBps)}`, settlement.carryYield, `${settlement.carryPasses} portal CONTINUE action${settlement.carryPasses === 1 ? '' : 's'}.`),
  ].filter((entry) => entry.amountLabel !== '0 Yield');
}

export function buildGenomeV2YieldRecap(
  value: GenomeV2RunRecord
): GenomeYieldRecapModel | null {
  const settlement = value.settlement;
  if (!settlement) return null;
  const activeGenes = Object.values(value.instances)
    .filter((instance) => instance.status === 'active')
    .sort((left, right) => left.acquisitionOrdinal - right.acquisitionOrdinal)
    .map((instance) => ({
      id: instance.instanceId,
      name: GENOME_V2_GENES[instance.geneId].name,
      strains: GENOME_V2_GENES[instance.geneId].strains,
    }));
  const completed = Object.values(value.targets).filter((target) => target.lifecycle === 'completed').length;
  const burnt = Object.values(value.targets).filter((target) => target.lifecycle === 'burnt').length;
  const delta = settlement.genomeYield - settlement.baseYield;
  return {
    rulesVersion: 2,
    baseYield: integerFallback(settlement.baseYield),
    genomeYield: integerFallback(settlement.genomeYield),
    genomeDelta: integerFallback(delta),
    baseYieldLabel: genomeV2PresentationFormat.scaledYield(settlement.baseYield),
    genomeYieldLabel: genomeV2PresentationFormat.scaledYield(settlement.genomeYield),
    genomeDeltaLabel: signedScaled(delta),
    factorLabel: 'Genome v2',
    activeGenes,
    activeSplices: value.activeSplices.map((id) => ({ id, name: GENOME_V2_SPLICES[id].name })),
    rows: settlementRows(settlement),
    executionSummary: `${completed} transformed target${completed === 1 ? '' : 's'} completed · ${burnt} burnt or missed.`,
    bankCrashSummary: settlement.terminal === 'bank'
      ? `BANK applied Bonds, eligible Stake, and Carry ${genomeV2PresentationFormat.bps(settlement.carryMultiplierBps)} in the authoritative fold.`
      : `Crash forfeited incomplete Escrow and Stake, then applied ordinary Carry salvage ${genomeV2PresentationFormat.bps(settlement.carryMultiplierBps)}.`,
  };
}

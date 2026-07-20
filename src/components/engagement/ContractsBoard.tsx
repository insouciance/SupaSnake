'use client';

/**
 * ContractsBoard - Daily Contracts (pick 2 of 3; SupaSnake Premium picks
 * all 3 - picksRemaining arrives server-computed from /api/contracts)
 *
 * Design v2 section 7.3: the daily modal IS the contract board now. Each
 * day the player is offered 3 contracts and picks 2 - objectives about
 * *how* you play, not *that* you showed up. Cards show the objective,
 * reward and (once picked) a live progress bar with a claim button when
 * complete. The login streak line survives from the old calendar.
 *
 * Styled to match the engagement modal family (WelcomeBackModal lineage):
 * elevated void panel, pop-in entrance, emissive card glow.
 */

import { useState } from 'react';
import {
  IconGift,
  IconDna,
  IconBolt,
  IconCheck,
  IconShield,
  IconSnake,
  IconEgg,
  IconFlame,
  IconTrophy,
} from '@/components/ui/icons';

export interface ContractProgress {
  current: number;
  target: number;
}

/** API shape of one contract on today's board (see /api/contracts) */
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

export interface ContractClaimOutcome {
  contractId: string;
  dnaGranted: number;
  energyGranted: number;
  xpGranted: number;
}

export type ContractCardState = 'offer' | 'selected' | 'picked' | 'complete' | 'claimed';

/** Visual state of a card given board data + local selection */
export function getContractCardState(
  contract: Pick<ContractView, 'picked' | 'completed' | 'claimed'>,
  isSelected: boolean
): ContractCardState {
  if (contract.claimed) return 'claimed';
  if (contract.picked && contract.completed) return 'complete';
  if (contract.picked) return 'picked';
  return isSelected ? 'selected' : 'offer';
}

/** Board summary for the home mission line: "Contracts: 1/2 complete" */
export function summarizeContracts(contracts: Pick<ContractView, 'picked' | 'completed' | 'claimed'>[]) {
  const picked = contracts.filter((c) => c.picked);
  return {
    pickedCount: picked.length,
    completedCount: picked.filter((c) => c.completed).length,
    claimable: picked.some((c) => c.completed && !c.claimed),
  };
}

function ContractIcon({ type, size }: { type: string; size: number }) {
  const props = { size, 'aria-hidden': true as const };
  switch (type) {
    case 'extract_n':
      return <IconShield {...props} />;
    case 'food_n_single_run':
      return <IconSnake {...props} />;
    case 'extract_tier':
      return <IconBolt {...props} />;
    case 'food_total':
      return <IconEgg {...props} />;
    case 'extract_fast':
      return <IconFlame {...props} />;
    case 'extract_nth_portal':
      return <IconTrophy {...props} />;
    default:
      return <IconGift {...props} />;
  }
}

interface ContractsBoardProps {
  /** Whether to show the board */
  isVisible: boolean;
  /** Today's 3 offered contracts (server-ordered by slot) */
  contracts: ContractView[];
  /** Picks left today (2 per day, cumulative) */
  picksRemaining: number;
  /** Current login streak (kept from the calendar era) */
  streak?: { current: number; multiplier: number } | null;
  /** Persists picks (POST pick); resolves false on failure */
  onPick: (contractIds: string[]) => Promise<boolean>;
  /** Claims one completed contract (POST claim) */
  onClaim: (contractId: string) => Promise<ContractClaimOutcome | null>;
  /** Called when the user closes the board */
  onDismiss: () => void;
}

function ContractCard({
  contract,
  state,
  selectable,
  onToggle,
  onClaim,
  claiming,
}: {
  contract: ContractView;
  state: ContractCardState;
  selectable: boolean;
  onToggle: () => void;
  onClaim: () => void;
  claiming: boolean;
}) {
  const { progress } = contract;
  const pct =
    progress.target > 0
      ? Math.min(100, Math.round((progress.current / progress.target) * 100))
      : 0;

  const stateClasses =
    state === 'claimed'
      ? 'bg-void-deep/60 border-scale-blue-light/40 opacity-60'
      : state === 'complete'
        ? 'bg-venom-orange/15 border-venom-orange shadow-glow-sm shadow-venom-orange/50'
        : state === 'picked'
          ? 'bg-scale-blue/30 border-cyber/60'
          : state === 'selected'
            ? 'bg-venom-orange/10 border-venom-orange'
            : 'bg-scale-blue/30 border-scale-blue-light/30';

  const body = (
    <>
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 ${state === 'complete' ? 'text-venom-orange' : 'text-cyber'}`}
        >
          <ContractIcon type={contract.contractType} size={22} />
        </span>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center justify-between gap-2">
            <span className="font-body font-semibold text-bone-white">
              {contract.name}
            </span>
            <span className="flex items-center gap-1 text-rarity-uncommon font-mono font-bold text-sm shrink-0">
              <IconDna size={14} aria-hidden />
              {contract.rewardDna}
            </span>
          </div>
          <p className="text-beige/70 text-xs font-body">{contract.description}</p>

          {/* Progress bar once the contract is picked */}
          {(state === 'picked' || state === 'complete' || state === 'claimed') && (
            <div className="mt-2">
              <div
                className="h-1.5 rounded-full bg-void-deep/70 overflow-hidden"
                role="progressbar"
                aria-valuenow={progress.current}
                aria-valuemin={0}
                aria-valuemax={progress.target}
                aria-label={`${contract.name} progress`}
              >
                <div
                  className={`h-full rounded-full transition-all ${
                    state === 'picked' ? 'bg-cyber' : 'bg-venom-orange'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-beige/60">
                {progress.current}/{progress.target}
              </span>
            </div>
          )}
        </div>
        {(state === 'claimed' || state === 'selected') && (
          <span
            className={state === 'claimed' ? 'text-rarity-uncommon' : 'text-venom-orange'}
            role="img"
            aria-label={state === 'claimed' ? 'claimed' : 'selected'}
          >
            <IconCheck size={16} />
          </span>
        )}
      </div>

      {state === 'complete' && (
        <button
          data-testid={`contract-claim-${contract.contractId}`}
          onClick={onClaim}
          disabled={claiming}
          className="btn-go w-full py-2 mt-3 text-sm"
        >
          {claiming ? 'Claiming...' : `Claim ${contract.rewardDna} DNA`}
        </button>
      )}
    </>
  );

  const shared = {
    'data-testid': `contract-card-${contract.contractId}`,
    'data-state': state,
    className: `relative rounded-arcade border p-3 w-full transition-colors ${stateClasses}`,
  };

  // Offer-phase cards toggle selection; picked/claimed cards are static
  if (selectable) {
    return (
      <button type="button" onClick={onToggle} aria-pressed={state === 'selected'} {...shared}>
        {body}
      </button>
    );
  }
  return <div {...shared}>{body}</div>;
}

export function ContractsBoard({
  isVisible,
  contracts,
  picksRemaining,
  streak,
  onPick,
  onClaim,
  onDismiss,
}: ContractsBoardProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [isPicking, setIsPicking] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  if (!isVisible || contracts.length === 0) {
    return null;
  }

  const pickPhase = picksRemaining > 0 && contracts.some((c) => !c.picked);

  const toggleSelect = (contractId: string) => {
    setSelected((prev) => {
      if (prev.includes(contractId)) return prev.filter((id) => id !== contractId);
      if (prev.length >= picksRemaining) return prev;
      return [...prev, contractId];
    });
  };

  const handleConfirmPicks = async () => {
    if (isPicking || selected.length === 0) return;
    setIsPicking(true);
    try {
      const ok = await onPick(selected);
      if (ok) setSelected([]);
    } finally {
      setIsPicking(false);
    }
  };

  const handleClaim = async (contractId: string) => {
    if (claimingId) return;
    setClaimingId(contractId);
    try {
      await onClaim(contractId);
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void-deep/85 backdrop-blur-sm">
      <div
        data-testid="contracts-board"
        className="panel-glow animate-pop-in p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        style={{ '--glow': '#22d3ee' } as React.CSSProperties}
      >
        <div className="text-center mb-4">
          <IconGift size={44} className="mx-auto mb-3 text-venom-orange" />
          <h2 className="heading-display text-2xl text-bone-white mb-1">Daily Contracts</h2>
          <p className="text-beige/70 text-sm font-body">
            {pickPhase ? (
              <>
                Pick <span className="text-bone-white font-semibold">{picksRemaining}</span>{' '}
                of {contracts.filter((c) => !c.picked).length} - new contracts daily
              </>
            ) : (
              'Complete your contracts, then claim'
            )}
            {streak && streak.current > 0 && (
              <>
                {' '}
                &middot;{' '}
                <span className="text-venom-orange">
                  {streak.current}-day streak (x{streak.multiplier})
                </span>
              </>
            )}
          </p>
        </div>

        <div className="space-y-2.5 mb-6">
          {contracts.map((contract) => {
            const state = getContractCardState(contract, selected.includes(contract.contractId));
            return (
              <ContractCard
                key={contract.contractId}
                contract={contract}
                state={state}
                selectable={pickPhase && !contract.picked}
                onToggle={() => toggleSelect(contract.contractId)}
                onClaim={() => handleClaim(contract.contractId)}
                claiming={claimingId === contract.contractId}
              />
            );
          })}
        </div>

        <div className="space-y-3">
          {pickPhase && (
            <button
              data-testid="contracts-confirm"
              onClick={handleConfirmPicks}
              disabled={isPicking || selected.length === 0}
              className="btn-go w-full py-3"
            >
              {isPicking
                ? 'Signing...'
                : selected.length === 0
                  ? 'Select Contracts'
                  : `Start ${selected.length} Contract${selected.length > 1 ? 's' : ''}`}
            </button>
          )}
          <button
            onClick={onDismiss}
            className="w-full py-2 text-beige/60 hover:text-beige text-sm font-body transition-colors"
          >
            {pickPhase ? 'Maybe Later' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ContractsBoard;

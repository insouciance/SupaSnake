'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CHOICE_INPUT_LOCK_MS } from '@/components/game/MutationChoiceOverlay';
import { StrainChip } from '@/components/traits/StrainChip';
import {
  STRAIN_ECONOMICS,
  STRAIN_PHYSICS,
  type StrainId,
} from '@/shared/game/strains';
import {
  carryBankMultiplier,
  carrySalvageMultiplier,
  type PortalCadence,
} from '@/shared/game/portals';
import { ladderSalvageFloor } from '@/shared/game/ladder';
import { useDialogFocusTrap } from '@/hooks/useDialogFocusTrap';
import { FunnelStages, trackFunnelStageOnce } from '@/lib/analytics/funnel';
import { TacticalLoomDecision } from '@/components/game/genome/TacticalLoomDecision';
import type { TacticalLoomDecisionModel } from '@/components/game/genome/tacticalLoomPresentation';

export interface PortalUnlockState {
  unlocked: boolean;
  /** Server-authored player-facing reason; never reconstructed from counters. */
  reason?: string;
  progress?: string;
}

export interface PortalCarryProjection {
  bankCurrent: string;
  bankNext: string;
  salvageCurrent: string;
  salvageNext: string;
}

export interface PortalMutationTerms {
  mode: 'mutate' | 'recode';
  growthCost: number;
  actionOrdinal: number;
  actionLimit: number;
  detail: string;
}

export interface PortalMutationLoom {
  /** Immutable candidate projection stamped when this portal opened. */
  model: TacticalLoomDecisionModel;
  /** The only callback that consumes the v2 portal mutation. */
  onCommit: (candidateIndex: 0 | 1, replacementSlot?: number) => void;
}

interface PortalChoiceOverlayProps {
  canInfuse: boolean;
  infusesUsed: number;
  snakeLength: number;
  bankDna: number;
  crashDna: number;
  /** Exact authoritative/projector labels override legacy client previews. */
  bankOutcomeLabel?: string;
  crashOutcomeLabel?: string;
  outcomeUnitLabel?: string;
  doorsPassed: number;
  cadence: PortalCadence;
  ladderRung?: number;
  rulesVersion?: 1 | 2;
  continueState?: PortalUnlockState;
  mutateState?: PortalUnlockState;
  carryProjection?: PortalCarryProjection;
  mutationTerms?: PortalMutationTerms;
  mutationLoom?: PortalMutationLoom;
  mirrorChoice?: {
    available: boolean;
    detail: string;
  };
  onBank: () => void;
  onPass: (activateMirror?: boolean) => void;
  onInfuse?: () => void;
}

function multiplierLabel(value: number): string {
  return `×${value}`;
}

export function PortalChoiceOverlay({
  canInfuse,
  infusesUsed,
  snakeLength,
  bankDna,
  crashDna,
  bankOutcomeLabel,
  crashOutcomeLabel,
  outcomeUnitLabel,
  doorsPassed,
  cadence,
  ladderRung = 0,
  rulesVersion = 1,
  continueState = { unlocked: true },
  mutateState,
  carryProjection,
  mutationTerms,
  mutationLoom,
  mirrorChoice,
  onBank,
  onPass,
  onInfuse,
}: PortalChoiceOverlayProps) {
  const salvageFloor = ladderSalvageFloor(ladderRung);
  const carry = carryProjection ?? {
    bankCurrent: multiplierLabel(carryBankMultiplier(doorsPassed)),
    bankNext: multiplierLabel(carryBankMultiplier(doorsPassed + 1)),
    salvageCurrent: multiplierLabel(carrySalvageMultiplier(doorsPassed, salvageFloor)),
    salvageNext: multiplierLabel(carrySalvageMultiplier(doorsPassed + 1, salvageFloor)),
  };
  const legacyMutationTerms: PortalMutationTerms = {
    mode: 'mutate',
    growthCost: STRAIN_PHYSICS.infuseGrowth,
    actionOrdinal: infusesUsed + 1,
    actionLimit: STRAIN_PHYSICS.infuseMaxPerRun,
    detail: `Gene offer · BANK +${STRAIN_ECONOMICS.infuseBankDelta}`,
  };
  const mutation = mutationTerms ?? legacyMutationTerms;
  const physicalReason = snakeLength < STRAIN_PHYSICS.infuseMinLength
    ? `Needs length ${STRAIN_PHYSICS.infuseMinLength}`
    : `${rulesVersion === 2 ? 'Mutation' : 'Infuse'} limit reached`;
  const mutationUnlock = mutateState ?? {
    unlocked: canInfuse,
    reason: canInfuse ? undefined : physicalReason,
  };

  const [locked, setLocked] = useState(true);
  const [inspectingMutation, setInspectingMutation] = useState(false);
  const [activateMirror, setActivateMirror] = useState(false);
  const lockedRef = useRef(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef, !locked);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      lockedRef.current = false;
      setLocked(false);
    }, CHOICE_INPUT_LOCK_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const bank = useCallback(() => {
    onBank();
    trackFunnelStageOnce(FunnelStages.ACTIVATE, {
      ...(rulesVersion === 1 ? { bank_dna: bankDna } : {}),
      ...(bankOutcomeLabel ? { bank_outcome: bankOutcomeLabel } : {}),
    });
  }, [bankDna, bankOutcomeLabel, onBank, rulesVersion]);
  const inspectMutation = useCallback(() => {
    if (rulesVersion === 2 && mutationLoom) {
      setInspectingMutation(true);
      return;
    }
    onInfuse?.();
  }, [mutationLoom, onInfuse, rulesVersion]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      // Once MUTATE opens the Loom, the parent portal shortcuts must become
      // inert. Otherwise the Loom's "1" preview key could BANK the run under
      // the nested decision surface.
      if (lockedRef.current || inspectingMutation) return;
      const key = event.key.toLowerCase();
      if (key === '1' || key === 'b') bank();
      else if ((key === '2' || key === 'c' || key === 'p') && continueState.unlocked) onPass(activateMirror);
      else if ((key === '3' || key === 'm' || key === 'i') && mutationUnlock.unlocked) inspectMutation();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [activateMirror, bank, continueState.unlocked, inspectMutation, inspectingMutation, mutationUnlock.unlocked, onPass]);

  const continueLabel = rulesVersion === 2 ? 'CONTINUE' : 'PASS';
  const mutateLabel = rulesVersion === 2 ? 'MUTATE' : 'INFUSE';
  const option = 'min-h-11 rounded-[12px] border p-3 text-left transition-colors sm:p-4';

  if (inspectingMutation && mutationLoom) {
    return (
      <TacticalLoomDecision
        model={mutationLoom.model}
        locked={locked}
        onBack={() => setInspectingMutation(false)}
        onDecline={() => setInspectingMutation(false)}
        onChoose={(candidateIndex, replacementSlot) => {
          mutationLoom.onCommit(candidateIndex, replacementSlot);
        }}
      />
    );
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="portal-choice-title"
      tabIndex={-1}
      className="absolute inset-0 z-30 flex items-end justify-center bg-gradient-to-t from-void-deep/40 via-void-deep/10 to-transparent sm:items-stretch sm:justify-end sm:bg-gradient-to-l"
      data-testid="portal-choice-overlay"
      data-rules-version={rulesVersion}
    >
      <div className="panel-elevated flex h-[min(58dvh,560px)] w-full flex-col overflow-hidden rounded-b-none border-b-0 p-3 [--glow:#22d3ee] animate-pop-in sm:ml-auto sm:h-full sm:max-h-none sm:w-[min(42rem,52vw)] sm:rounded-l-[20px] sm:rounded-r-none sm:border-b sm:border-r-0 sm:p-5">
        <header className="shrink-0 border-b border-scale-blue-light/20 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-body text-[10px] font-bold uppercase tracking-[0.18em] text-[#7df9ff]">Simulation held · Extraction</p>
              <h2 id="portal-choice-title" className="heading-display text-xl text-[#7df9ff] text-glow sm:text-2xl">Portal Decision</h2>
            </div>
            <p className="text-right font-body text-[10px] text-beige/50">{doorsPassed} continued · {mutation.actionOrdinal - 1}/{mutation.actionLimit} Genome actions</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-[12px] border border-scale-blue-light/25 bg-void-deep/40 p-2" data-testid="portal-current-stake">
            <div>
              <p className="font-body text-[10px] uppercase tracking-[0.1em] text-beige/45">Secure now</p>
              <p className="font-mono text-base font-bold text-rarity-uncommon">{bankOutcomeLabel ?? `${bankDna.toLocaleString()} DNA`}</p>
            </div>
            <div className="text-right">
              <p className="font-body text-[10px] uppercase tracking-[0.1em] text-beige/45">Crash now</p>
              <p className="font-mono text-base font-bold text-strike-red">{crashOutcomeLabel ?? `${crashDna.toLocaleString()} DNA`}</p>
            </div>
          </div>
          {outcomeUnitLabel ? (
            <p className="mt-1 text-center font-body text-[9px] leading-snug text-beige/45" data-testid="portal-outcome-unit">
              {outcomeUnitLabel}
            </p>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3 [touch-action:pan-y]" data-testid="portal-scroll-region">
          <div className="grid gap-2 sm:grid-cols-3" data-testid="portal-choice-rail" data-responsive-composition="portrait-bottom landscape-side">
            <button
              type="button"
              disabled={locked}
              onClick={bank}
              aria-keyshortcuts="1 B"
              data-testid="portal-bank"
              className={`${option} border-rarity-uncommon/60 bg-rarity-uncommon/10 disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7df9ff]`}
            >
              <span className="font-display text-sm text-rarity-uncommon">1 · BANK</span>
              <p className="mt-1 font-body text-xs text-beige">Secure {bankOutcomeLabel ?? `${bankDna.toLocaleString()} DNA`} and end this run.</p>
              <p className="mt-2 font-mono text-[10px] text-beige/55" data-testid="portal-bank-carry">Carry {carry.bankCurrent}{doorsPassed > 0 ? ` · ${doorsPassed} continued` : ''}</p>
            </button>

            <button
              type="button"
              disabled={locked || !continueState.unlocked}
              onClick={() => onPass(activateMirror)}
              aria-keyshortcuts="2 C P"
              data-testid="portal-pass"
              className={`${option} border-scale-blue-light/55 bg-void/55 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7df9ff]`}
            >
              <span className="font-display text-sm text-bone-white">2 · {continueLabel}</span>
              <p className="mt-1 font-body text-xs text-beige">Next portal in {cadence.intervalBase}±{cadence.intervalJitter} foods.</p>
              <p className="mt-2 font-mono text-[10px] text-beige/55" data-testid="portal-pass-carry">
                BANK {carry.bankCurrent} → <b className="text-rarity-uncommon">{carry.bankNext}</b><br />
                crash {carry.salvageCurrent} → <b className="text-strike-red">{carry.salvageNext}</b>
              </p>
              {!continueState.unlocked ? <p className="mt-2 font-body text-[10px] leading-snug text-venom-orange" data-testid="portal-continue-lock">Locked · {continueState.reason}{continueState.progress ? ` · ${continueState.progress}` : ''}</p> : null}
            </button>

            <button
              type="button"
              disabled={locked || !mutationUnlock.unlocked}
              onClick={inspectMutation}
              aria-keyshortcuts="3 M I"
              data-testid="portal-infuse"
              className={`${option} border-cosmic/55 bg-cosmic/10 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7df9ff]`}
            >
              <span className="font-display text-sm text-cosmic">3 · {mutateLabel}</span>
              <p className="mt-1 font-body text-xs text-beige">
                +{mutation.growthCost} permanent growth · {mutation.mode === 'recode' ? 'Recode one locus' : mutation.detail}
              </p>
              <p className="mt-2 font-mono text-[10px] text-beige/55">
                Action {mutation.actionOrdinal}/{mutation.actionLimit}{mutation.mode === 'recode' ? ` · ${mutation.detail}` : ''}
              </p>
              {rulesVersion === 2 && mutationLoom ? (
                <div className="mt-2 space-y-1 border-t border-cosmic/20 pt-2" data-testid="portal-mutate-preview">
                  {mutationLoom.model.candidates.map((candidate) => (
                    <p key={candidate.geneId} className="truncate font-body text-[10px] text-cosmic/80" title={`${candidate.name} · ${candidate.category}`}>
                      {candidate.action} · {candidate.name} · {candidate.category}
                    </p>
                  ))}
                  <p className="font-body text-[9px] text-beige/45">Inspect both paths before committing.</p>
                </div>
              ) : null}
              {!mutationUnlock.unlocked ? <p className="mt-2 font-body text-[10px] leading-snug text-venom-orange" data-testid="portal-mutate-lock">Locked · {mutationUnlock.reason}{mutationUnlock.progress ? ` · ${mutationUnlock.progress}` : ''}</p> : null}
            </button>
          </div>

          {rulesVersion === 2 && mirrorChoice?.available ? (
            <section className="mt-3 rounded-[10px] border border-cosmic/30 bg-cosmic/5 p-3" data-testid="portal-mirror-wager">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-display text-xs uppercase tracking-[0.1em] text-cosmic">Mirror Wager · next leg</p>
                  <p className="mt-1 font-body text-[10px] leading-snug text-beige/60">{mirrorChoice.detail}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={activateMirror}
                  disabled={locked || !continueState.unlocked}
                  onClick={() => setActivateMirror((active) => !active)}
                  className={`min-h-11 min-w-[7.5rem] rounded-[10px] border px-3 font-display text-xs ${
                    activateMirror
                      ? 'border-cosmic bg-cosmic/15 text-cosmic'
                      : 'border-scale-blue-light/35 bg-void/50 text-beige/65'
                  } disabled:opacity-45`}
                  data-testid="portal-mirror-toggle"
                >
                  {activateMirror ? 'ARMED' : 'LEAVE INACTIVE'}
                </button>
              </div>
            </section>
          ) : null}

          <p className="mt-3 rounded-[10px] border border-scale-blue-light/20 bg-void-deep/35 px-3 py-2 font-body text-[11px] leading-snug text-beige/60">
            BANK secures this run. {continueLabel} raises future Carry and lowers crash recovery. {mutateLabel} keeps the run alive while converting permanent body growth and spatial pressure into build power.
          </p>
        </div>
      </div>
    </div>
  );
}

interface StrainSurgeOverlayProps {
  strains: readonly StrainId[];
  onChoose: (strain: StrainId) => void;
}

export function StrainSurgeOverlay({ strains, onChoose }: StrainSurgeOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef);
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="surge-choice-title" tabIndex={-1} className="absolute inset-0 z-30 flex items-end justify-center bg-gradient-to-t from-void-deep/40 to-transparent sm:items-center" data-testid="surge-choice-overlay">
      <div className="panel-elevated w-full max-w-md rounded-b-none p-5 [--glow:#a855f7] animate-pop-in sm:rounded-[18px]">
        <h2 id="surge-choice-title" className="heading-display text-center text-2xl text-cosmic">Strain Surge</h2>
        <p className="mb-4 text-center text-sm font-body text-beige/70">Gene cap reached — add one point to a held strain.</p>
        <div className="flex flex-wrap justify-center gap-3">
          {strains.map((strain) => (
            <button key={strain} type="button" onClick={() => onChoose(strain)} data-testid={`surge-${strain}`} className="min-h-[44px] rounded-arcade border border-scale-blue-light/50 bg-void/60 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7df9ff]">
              <StrainChip strain={strain} points={1} size="md" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PortalChoiceOverlay;

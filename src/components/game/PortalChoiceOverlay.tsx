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
import { formatAmount } from '@/shared/format/amount';
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
    detail: `Power offer · BANK +${STRAIN_ECONOMICS.infuseBankDelta}`,
  };
  const mutation = mutationTerms ?? legacyMutationTerms;
  const physicalReason = snakeLength < STRAIN_PHYSICS.infuseMinLength
    ? `Needs length ${STRAIN_PHYSICS.infuseMinLength}`
    : 'Trade-up limit reached';
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
      // Once TRADE UP opens the Drop, the parent portal shortcuts must become
      // inert. Otherwise the Drop's "1" preview key could BANK the run under
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

  // One word at every rules version. The panel used to say CONTINUE on v2 and
  // PASS on v1 while the pre-run hint said PASS to both — the same button with
  // two names is the thing this deletes, not a rollout branch worth keeping.
  const continueLabel = 'RIDE ON';
  const mutateLabel = 'TRADE UP';
  /*
   * THE THREE CARDS ARE PRINTED OBJECTS (90S-PATH).
   *
   * Each option used to be a translucent wash behind a 60%-alpha hairline in
   * its own hue - the pale-keyline pattern the global law retires, wearing
   * three different colours. The hue moves OFF the line and INTO the fill,
   * where it is the thing being read, and the line becomes the one contour
   * the product draws. A hard block underneath makes the three read as cards
   * lying on the dock rather than regions cut out of it.
   */
  const option =
    'ink-outline-2 min-h-11 rounded-[var(--radius-card)] p-3 text-left shadow-[var(--ink-drop-void-2)] transition-colors sm:p-4';

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
      className="modal-scrim absolute inset-0 z-30 flex items-end justify-center p-2 sm:items-center sm:p-4"
      data-testid="portal-choice-overlay"
      data-rules-version={rulesVersion}
    >
      {/* ONE TRAY, ONE OUTLINE. This was a flush-edged sheet - bottom on
          phones, right on desktop - which by construction has no line on the
          edge it is flush against, so it could never wear a card outline. It
          is a floating tray now in both paths, at the shared `--tray-w`
          measure, and the cockpit dock's own centring override agrees with it
          instead of contradicting it. */}
      <div className="panel-elevated modal-frame modal-tray flex max-h-full flex-col overflow-hidden p-3 [--glow:#f2a03f] animate-pop-in sm:h-[min(72dvh,45rem)] sm:p-5">
        <header className="shrink-0 border-b-[length:var(--ink-w-1)] border-b-[color:var(--void-stroke)] pb-3">
          <div className="flex items-start justify-between gap-3">
            {/* `min-w-0` on both children: without it a flex item refuses to
                shrink below its longest word, and this row is the one piece
                of the panel that cannot scroll. */}
            <div className="min-w-0">
              <p className="font-body text-sm font-bold uppercase tracking-[0.18em] text-[#7df9ff]">Paused for your choice</p>
              <h2 id="portal-choice-title" className="heading-display heading-ink text-xl text-[#7df9ff] sm:text-2xl">Portal Decision</h2>
            </div>
            <p className="min-w-0 text-right font-body text-sm text-beige/50">{doorsPassed} ridden · {mutation.actionOrdinal - 1}/{mutation.actionLimit} trades</p>
          </div>
          {/* A REGION, NOT A SECOND TRAY: fill and radius, no border. The
              single bold outline belongs to the panel around all of this. */}
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-[var(--radius-card)] bg-[#132234] p-2" data-testid="portal-current-stake">
            <div className="min-w-0">
              <p className="font-body text-sm uppercase tracking-[0.1em] text-beige/45">Secure now</p>
              <p className="truncate font-mono text-base font-bold text-rarity-uncommon">{bankOutcomeLabel ?? `${formatAmount(bankDna)} DNA`}</p>
            </div>
            <div className="min-w-0 text-right">
              <p className="font-body text-sm uppercase tracking-[0.1em] text-beige/45">Crash now</p>
              <p className="truncate font-mono text-base font-bold text-strike-red">{crashOutcomeLabel ?? `${formatAmount(crashDna)} DNA`}</p>
            </div>
          </div>
          {outcomeUnitLabel ? (
            <p className="mt-1 text-center font-body text-sm leading-snug text-beige/45" data-testid="portal-outcome-unit">
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
              className={`${option} bg-[#17402f] disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7df9ff]`}
            >
              <span className="font-display text-sm text-rarity-uncommon">1 · BANK</span>
              <p className="mt-1 font-body text-sm text-beige">Secure {bankOutcomeLabel ?? `${formatAmount(bankDna)} DNA`} and end this run.</p>
              <p className="mt-2 font-mono text-sm text-beige/55" data-testid="portal-bank-carry">Streak {carry.bankCurrent}{doorsPassed > 0 ? ` · ${doorsPassed} ridden` : ''}</p>
            </button>

            <button
              type="button"
              disabled={locked || !continueState.unlocked}
              onClick={() => onPass(activateMirror)}
              aria-keyshortcuts="2 C P"
              data-testid="portal-pass"
              className={`${option} bg-[#132234] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7df9ff]`}
            >
              <span className="font-display text-sm text-bone-white">2 · {continueLabel}</span>
              <p className="mt-1 font-body text-sm text-beige">Next portal in {cadence.intervalBase}±{cadence.intervalJitter} foods.</p>
              <p className="mt-2 font-mono text-sm text-beige/55" data-testid="portal-pass-carry">
                BANK {carry.bankCurrent} → <b className="text-rarity-uncommon">{carry.bankNext}</b><br />
                crash {carry.salvageCurrent} → <b className="text-strike-red">{carry.salvageNext}</b>
              </p>
              {!continueState.unlocked ? <p className="mt-2 font-body text-sm leading-snug text-venom-orange" data-testid="portal-continue-lock">Locked · {continueState.reason}{continueState.progress ? ` · ${continueState.progress}` : ''}</p> : null}
            </button>

            <button
              type="button"
              disabled={locked || !mutationUnlock.unlocked}
              onClick={inspectMutation}
              aria-keyshortcuts="3 M I"
              data-testid="portal-infuse"
              className={`${option} bg-[#2f2352] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7df9ff]`}
            >
              <span className="font-display text-sm text-cosmic">3 · {mutateLabel}</span>
              <p className="mt-1 font-body text-sm text-beige">
                +{mutation.growthCost} permanent growth · {mutation.mode === 'recode' ? 'Swap one slot' : mutation.detail}
              </p>
              <p className="mt-2 font-mono text-sm text-beige/55">
                Trade {mutation.actionOrdinal}/{mutation.actionLimit}{mutation.mode === 'recode' ? ` · ${mutation.detail}` : ''}
              </p>
              {rulesVersion === 2 && mutationLoom ? (
                <div className="mt-2 space-y-1 border-t border-cosmic/20 pt-2" data-testid="portal-mutate-preview">
                  {mutationLoom.model.candidates.map((candidate) => (
                    <p key={candidate.geneId} className="truncate font-body text-sm text-cosmic/80" title={`${candidate.name} · ${candidate.category}`}>
                      {candidate.action} · {candidate.name} · {candidate.category}
                    </p>
                  ))}
                  <p className="font-body text-sm text-beige/45">Look at both before you commit.</p>
                </div>
              ) : null}
              {!mutationUnlock.unlocked ? <p className="mt-2 font-body text-sm leading-snug text-venom-orange" data-testid="portal-mutate-lock">Locked · {mutationUnlock.reason}{mutationUnlock.progress ? ` · ${mutationUnlock.progress}` : ''}</p> : null}
            </button>
          </div>

          {rulesVersion === 2 && mirrorChoice?.available ? (
            <section className="mt-3 rounded-[10px] bg-cosmic/8 p-3" data-testid="portal-mirror-wager">
              {/* `flex-wrap` + `min-w-0`: the toggle is a fixed 7.5rem and the
                  copy beside it is server-authored, so at 320px the row has to
                  be allowed to become two rows rather than push the panel. */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-display text-sm uppercase tracking-[0.1em] text-cosmic">Split Bet · next stretch</p>
                  <p className="mt-1 font-body text-sm leading-snug text-beige/60">{mirrorChoice.detail}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={activateMirror}
                  disabled={locked || !continueState.unlocked}
                  onClick={() => setActivateMirror((active) => !active)}
                  className={`min-h-11 min-w-[7.5rem] rounded-[10px] border px-3 font-display text-sm ${
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

          {/* R15. This line used to end "{mutateLabel} buys a power with body
              length", which prices the power in body the player GIVES UP.
              TRADE UP does the opposite: `SnakeGameLogic.performInfuse` pushes
              `infuseGrowth` segments onto the tail, because under Rule 15
              length is the difficulty clock and removing it would be a second
              reward, not a cost. The copy now says which way the body moves. */}
          <p className="mt-3 rounded-[var(--radius-card)] bg-[#132234] px-3 py-2 font-body text-sm leading-snug text-beige/60">
            BANK ends the run and pays out. {continueLabel} keeps playing — the payout grows, but crashing keeps less. {mutateLabel} takes a power and grows you to carry it.
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
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="surge-choice-title" tabIndex={-1} className="modal-scrim absolute inset-0 z-30 flex items-end justify-center p-2 sm:items-center sm:p-4" data-testid="surge-choice-overlay">
      <div className="panel-elevated modal-frame modal-tray-narrow p-5 [--glow:#a855f7] animate-pop-in">
        <h2 id="surge-choice-title" className="heading-display text-center text-2xl text-cosmic">Path Surge</h2>
        <p className="mb-4 text-center text-sm font-body text-beige/70">No slots left — add one point to a Path you already hold.</p>
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

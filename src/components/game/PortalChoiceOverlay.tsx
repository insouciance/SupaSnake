'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CHOICE_INPUT_LOCK_MS } from '@/components/game/MutationChoiceOverlay';
import { StrainChip } from '@/components/traits/StrainChip';
import {
  STRAIN_ECONOMICS,
  STRAIN_PHYSICS,
  type StrainId,
} from '@/shared/game/strains';
import { useDialogFocusTrap } from '@/hooks/useDialogFocusTrap';
import { FunnelStages, trackFunnelStageOnce } from '@/lib/analytics/funnel';

interface PortalChoiceOverlayProps {
  canInfuse: boolean;
  infusesUsed: number;
  snakeLength: number;
  bankDna: number;
  crashDna: number;
  onBank: () => void;
  onPass: () => void;
  onInfuse: () => void;
}

export function PortalChoiceOverlay({
  canInfuse,
  infusesUsed,
  snakeLength,
  bankDna,
  crashDna,
  onBank,
  onPass,
  onInfuse,
}: PortalChoiceOverlayProps) {
  const [locked, setLocked] = useState(true);
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

  // Activate (§11.5): the aha is the first BANKED extraction — the moment
  // the game's thesis lands. Recorded once per browser and strictly as a
  // side effect: the run's own decision runs first and is never gated on it.
  const bank = useCallback(() => {
    onBank();
    trackFunnelStageOnce(FunnelStages.ACTIVATE, { bank_dna: bankDna });
  }, [bankDna, onBank]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (lockedRef.current) return;
      const key = event.key.toLowerCase();
      if (key === '1' || key === 'b') bank();
      else if (key === '2' || key === 'p') onPass();
      else if ((key === '3' || key === 'i') && canInfuse) onInfuse();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [bank, canInfuse, onInfuse, onPass]);

  const option = 'rounded-arcade border p-4 text-left transition-all min-h-[44px]';
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="portal-choice-title" tabIndex={-1} className="absolute inset-0 z-30 flex items-center justify-center bg-void-deep/80 p-4 backdrop-blur-sm" data-testid="portal-choice-overlay">
      <div className="panel-elevated w-full max-w-xl p-6 [--glow:#22d3ee] animate-pop-in">
        <h2 id="portal-choice-title" className="heading-display text-center text-2xl text-[#7df9ff] text-glow">Exit Portal</h2>
        <p className="mb-5 text-center text-sm font-body text-beige/70">Cash out, keep growing, or turn body into build power.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button type="button" disabled={locked} onClick={bank} aria-keyshortcuts="1 B" data-testid="portal-bank" className={`${option} border-rarity-uncommon/60 bg-rarity-uncommon/10 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7df9ff]`}>
            <span className="heading-display text-rarity-uncommon">1 · BANK</span>
            <p className="mt-1 text-sm font-body text-beige">End the run for <b>{bankDna} DNA</b></p>
          </button>
          <button type="button" disabled={locked} onClick={onPass} aria-keyshortcuts="2 P" data-testid="portal-pass" className={`${option} border-scale-blue-light/60 bg-void/60 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7df9ff]`}>
            <span className="heading-display text-bone-white">2 · PASS</span>
            <p className="mt-1 text-sm font-body text-beige">Next door in 12±4 foods</p>
          </button>
          <button type="button" disabled={locked || !canInfuse} onClick={onInfuse} aria-keyshortcuts="3 I" data-testid="portal-infuse" className={`${option} border-cosmic/60 bg-cosmic/10 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7df9ff]`}>
            <span className="heading-display text-cosmic">3 · INFUSE</span>
            {/*
              WP-3.05: this line read "−4 tail" while the engine grew the body
              by +8 - a twelve-segment error pointing the wrong way, advertising
              a reward where the code charges a cost. It described
              `infuseSegmentCost: 4`, which Rule 15 DELETED (`rule15.test.ts`
              asserts the field is gone); the overlay was never updated and no
              test read this string.

              So every number here is now INTERPOLATED from the constant that
              governs it. Copy that restates a dial in a literal is copy that
              goes stale silently, and this one sat in front of the game's most
              consequential decision.
            */}
            <p className="mt-1 text-sm font-body text-beige">+{STRAIN_PHYSICS.infuseGrowth} length · gene offer · bank +{STRAIN_ECONOMICS.infuseBankDelta}</p>
            <p className="mt-1 text-xs font-body text-beige/50">{canInfuse ? `${infusesUsed}/${STRAIN_PHYSICS.infuseMaxPerRun} used · crash ${crashDna}` : snakeLength < STRAIN_PHYSICS.infuseMinLength ? `Needs length ${STRAIN_PHYSICS.infuseMinLength}` : 'Infuse cap reached'}</p>
          </button>
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
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="surge-choice-title" tabIndex={-1} className="absolute inset-0 z-30 flex items-center justify-center bg-void-deep/80 p-4 backdrop-blur-sm" data-testid="surge-choice-overlay">
      <div className="panel-elevated w-full max-w-md p-6 [--glow:#a855f7] animate-pop-in">
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

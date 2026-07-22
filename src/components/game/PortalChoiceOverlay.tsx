'use client';

import { useEffect, useRef, useState } from 'react';
import { CHOICE_INPUT_LOCK_MS } from '@/components/game/MutationChoiceOverlay';
import { StrainChip } from '@/components/traits/StrainChip';
import type { StrainId } from '@/shared/game/strains';

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
  useEffect(() => {
    const timer = window.setTimeout(() => {
      lockedRef.current = false;
      setLocked(false);
    }, CHOICE_INPUT_LOCK_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (lockedRef.current) return;
      const key = event.key.toLowerCase();
      if (key === '1' || key === 'b') onBank();
      else if (key === '2' || key === 'p') onPass();
      else if ((key === '3' || key === 'i') && canInfuse) onInfuse();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [canInfuse, onBank, onInfuse, onPass]);

  const option = 'rounded-arcade border p-4 text-left transition-all min-h-[44px]';
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-void-deep/80 p-4 backdrop-blur-sm" data-testid="portal-choice-overlay">
      <div className="panel-elevated w-full max-w-xl p-6 [--glow:#22d3ee] animate-pop-in">
        <h2 className="heading-display text-center text-2xl text-[#7df9ff] text-glow">Exit Portal</h2>
        <p className="mb-5 text-center text-sm font-body text-beige/70">Cash out, keep growing, or turn body into build power.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button disabled={locked} onClick={onBank} data-testid="portal-bank" className={`${option} border-rarity-uncommon/60 bg-rarity-uncommon/10 disabled:opacity-60`}>
            <span className="heading-display text-rarity-uncommon">1 · BANK</span>
            <p className="mt-1 text-sm font-body text-beige">End the run for <b>{bankDna} DNA</b></p>
          </button>
          <button disabled={locked} onClick={onPass} data-testid="portal-pass" className={`${option} border-scale-blue-light/60 bg-void/60 disabled:opacity-60`}>
            <span className="heading-display text-bone-white">2 · PASS</span>
            <p className="mt-1 text-sm font-body text-beige">Next door in 12±4 foods</p>
          </button>
          <button disabled={locked || !canInfuse} onClick={onInfuse} data-testid="portal-infuse" className={`${option} border-cosmic/60 bg-cosmic/10 disabled:cursor-not-allowed disabled:opacity-45`}>
            <span className="heading-display text-cosmic">3 · INFUSE</span>
            <p className="mt-1 text-sm font-body text-beige">−4 tail · gene offer · bank +0.05</p>
            <p className="mt-1 text-xs font-body text-beige/50">{canInfuse ? `${infusesUsed}/3 used · crash ${crashDna}` : snakeLength < 8 ? 'Needs length 8' : 'Infuse cap reached'}</p>
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
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-void-deep/80 p-4 backdrop-blur-sm" data-testid="surge-choice-overlay">
      <div className="panel-elevated w-full max-w-md p-6 [--glow:#a855f7] animate-pop-in">
        <h2 className="heading-display text-center text-2xl text-cosmic">Strain Surge</h2>
        <p className="mb-4 text-center text-sm font-body text-beige/70">Gene cap reached — add one point to a held strain.</p>
        <div className="flex flex-wrap justify-center gap-3">
          {strains.map((strain) => (
            <button key={strain} type="button" onClick={() => onChoose(strain)} data-testid={`surge-${strain}`} className="min-h-[44px] rounded-arcade border border-scale-blue-light/50 bg-void/60 px-3 py-2">
              <StrainChip strain={strain} points={1} size="md" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PortalChoiceOverlay;

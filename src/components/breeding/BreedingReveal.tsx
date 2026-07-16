'use client';

/**
 * BreedingReveal - Full-screen offspring reveal after a successful breeding.
 * Pure CSS keyframe sequence (no animation libraries):
 *   1. gather - two parent orbs converge on the center
 *   2. flash  - white burst at the moment of fusion
 *   3. reveal - the offspring card scales in with a glow
 */

import React from 'react';
import { SnakeArt } from '@/components/lab/SnakeArt';
import { dynastyThemes } from '@/hooks/useDynastyTheme';
import type { BredOffspring } from '@/lib/stores/breedingStore';

export interface BreedingRevealProps {
  offspring: BredOffspring;
  onClose: () => void;
}

export function BreedingReveal({
  offspring,
  onClose,
}: BreedingRevealProps): React.ReactElement<any> {
  const theme = dynastyThemes[offspring.dynastyName ?? ''] ?? dynastyThemes.CYBER;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.92)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Breeding result"
      data-testid="breeding-reveal"
    >
      {/* Stage 1: parent orbs gather */}
      <div className="breeding-orb breeding-orb-left" style={{ backgroundColor: theme.primary }} aria-hidden="true" />
      <div className="breeding-orb breeding-orb-right" style={{ backgroundColor: theme.secondary }} aria-hidden="true" />

      {/* Stage 2: fusion flash */}
      <div className="breeding-flash" aria-hidden="true" />

      {/* Stage 3: offspring card reveal */}
      <div className="breeding-card flex flex-col items-center gap-4">
        <div
          className="relative w-56 rounded-lg overflow-hidden"
          style={{
            aspectRatio: '3 / 4',
            border: `2px solid ${theme.primary}`,
            boxShadow: `0 0 40px ${theme.primary}`,
          }}
        >
          <SnakeArt
            seed={offspring.snakeVariantId}
            name={offspring.variantName}
            dynasty={offspring.dynastyName ?? 'CYBER'}
            primaryColor={theme.primary}
            secondaryColor={theme.secondary}
            rarity={offspring.rarity ?? 'common'}
            className="w-full h-full"
          />
        </div>

        <div className="text-center">
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#8892b0' }}>
            New Snake Bred!
          </p>
          <h2 className="text-2xl font-bold" style={{ color: theme.primary }}>
            {offspring.variantName}
          </h2>
          <p className="text-sm mt-1" style={{ color: '#8892b0' }}>
            Generation {offspring.generation}
            {offspring.rarity ? ` · ${offspring.rarity.toUpperCase()}` : ''}
          </p>
          {offspring.dnaCost !== null && (
            <p className="text-xs mt-1" style={{ color: '#8892b0' }}>
              -{offspring.dnaCost} <span role="img" aria-label="DNA">💎</span>
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="px-8 py-3 rounded-lg font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{
            backgroundColor: theme.primary,
            color: theme.textOnPrimary,
            minHeight: '44px',
          }}
          data-testid="breeding-reveal-continue"
        >
          Continue
        </button>
      </div>

      {/* CSS animation sequence */}
      <style jsx>{`
        /* Stage 1: orbs gather toward center (0 - 0.7s) */
        .breeding-orb {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 40px;
          height: 40px;
          margin: -20px 0 0 -20px;
          border-radius: 9999px;
          filter: blur(4px);
          opacity: 0;
          animation: gather 0.7s ease-in forwards;
        }
        .breeding-orb-left {
          --from-x: -140px;
        }
        .breeding-orb-right {
          --from-x: 140px;
        }
        @keyframes gather {
          0% {
            transform: translateX(var(--from-x)) scale(1);
            opacity: 0.9;
          }
          80% {
            opacity: 1;
          }
          100% {
            transform: translateX(0) scale(0.4);
            opacity: 0;
          }
        }

        /* Stage 2: fusion flash (0.65s - 1.05s) */
        .breeding-flash {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, rgba(255, 255, 255, 0.95) 0%, transparent 60%);
          opacity: 0;
          animation: flash 0.4s ease-out 0.65s forwards;
          pointer-events: none;
        }
        @keyframes flash {
          0% {
            opacity: 0;
          }
          30% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }

        /* Stage 3: card reveal (from 0.9s) */
        .breeding-card {
          opacity: 0;
          transform: scale(0.7);
          animation: reveal 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.9s forwards;
        }
        @keyframes reveal {
          from {
            opacity: 0;
            transform: scale(0.7);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}

export default BreedingReveal;

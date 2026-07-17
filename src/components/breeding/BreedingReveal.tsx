'use client';

/**
 * BreedingReveal - Full-screen offspring reveal after a successful breeding.
 * Pure CSS keyframe sequence (no animation libraries):
 *   1. gather - two parent orbs converge on the center
 *   2. flash  - dynasty-tinted burst at the moment of fusion
 *   3. reveal - the offspring card pops in with a rarity glow
 * Staged over the void backdrop, glowing in the offspring's dynasty color.
 */

import React from 'react';
import { SnakeArt } from '@/components/lab/SnakeArt';
import { IconDna } from '@/components/ui/icons';
import { dynastyThemes } from '@/hooks/useDynastyTheme';
import { RARITY_STYLE } from '@/components/lab/VariantCard';
import type { BredOffspring } from '@/lib/stores/breedingStore';

export interface BreedingRevealProps {
  offspring: BredOffspring;
  onClose: () => void;
}

function hexToRgba(hex: string, opacity: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function BreedingReveal({
  offspring,
  onClose,
}: BreedingRevealProps): React.ReactElement<any> {
  const theme = dynastyThemes[offspring.dynastyName ?? ''] ?? dynastyThemes.CYBER;
  const rarity = RARITY_STYLE[offspring.rarity ?? 'common'] ?? RARITY_STYLE.common;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background:
          'radial-gradient(ellipse 120% 80% at 50% -20%, rgba(58, 71, 80, 0.25) 0%, transparent 60%), linear-gradient(180deg, rgba(10,14,18,0.97) 0%, rgba(5,5,8,0.98) 100%)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Breeding result"
      data-testid="breeding-reveal"
    >
      {/* Stage 1: parent orbs gather (emissive dynasty colors) */}
      <div
        className="breeding-orb breeding-orb-left"
        style={{
          backgroundColor: theme.glow,
          boxShadow: `0 0 24px 6px ${hexToRgba(theme.glow, 0.6)}`,
        }}
        aria-hidden="true"
      />
      <div
        className="breeding-orb breeding-orb-right"
        style={{
          backgroundColor: theme.secondary,
          boxShadow: `0 0 24px 6px ${hexToRgba(theme.secondary, 0.6)}`,
        }}
        aria-hidden="true"
      />

      {/* Stage 2: fusion flash - white core with a dynasty glow halo */}
      <div
        className="breeding-flash"
        style={{
          background: `radial-gradient(circle at center, rgba(230, 237, 243, 0.95) 0%, ${hexToRgba(theme.glow, 0.55)} 30%, transparent 62%)`,
        }}
        aria-hidden="true"
      />

      {/* Stage 3: offspring card reveal - rarity glow frame */}
      <div className="breeding-card flex flex-col items-center gap-4">
        <div
          className="relative w-56 rounded-arcade overflow-hidden border-2 bg-panel-gradient"
          style={{
            aspectRatio: '3 / 4',
            borderColor: rarity.color,
            boxShadow: `0 0 ${24 + rarity.glowSpread}px -2px ${hexToRgba(rarity.color, 0.85)}, 0 0 48px -8px ${hexToRgba(theme.glow, 0.7)}`,
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
          <p className="label-arcade mb-1">
            New Snake Bred!
          </p>
          <h2
            className="heading-display text-2xl"
            style={{
              color: theme.glow,
              textShadow: `0 0 18px ${hexToRgba(theme.glow, 0.6)}`,
            }}
          >
            {offspring.variantName}
          </h2>
          <p className="text-sm mt-1 font-body text-beige/70">
            Generation {offspring.generation}
            {offspring.rarity ? (
              <>
                {' · '}
                <span
                  style={{
                    color: rarity.color,
                    textShadow:
                      rarity.glowSpread > 0
                        ? `0 0 10px ${hexToRgba(rarity.color, 0.6)}`
                        : undefined,
                  }}
                >
                  {offspring.rarity.toUpperCase()}
                </span>
              </>
            ) : (
              ''
            )}
          </p>
          {offspring.dnaCost !== null && (
            <p className="text-xs mt-1 font-mono text-beige/60 inline-flex items-center gap-1">
              -{offspring.dnaCost}
              <IconDna size={12} aria-label="DNA" aria-hidden={false} role="img" />
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="btn-go px-8 py-3 min-h-[44px]"
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

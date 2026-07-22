'use client';

/**
 * BreedingReveal - Full-screen offspring reveal after a successful breeding.
 * Pure CSS keyframe sequence (no animation libraries):
 *   1. gather - two parent orbs converge on the center
 *   2. flash  - dynasty-tinted burst at the moment of fusion
 *   3. reveal - the offspring card pops in with a rarity glow
 * Staged over the void backdrop, glowing in the offspring's dynasty color.
 */

import React, { useCallback, useState } from 'react';
import { SnakeArt } from '@/components/lab/SnakeArt';
import { IconDna } from '@/components/ui/icons';
import { dynastyThemes } from '@/hooks/useDynastyTheme';
import { RARITY_STYLE } from '@/components/lab/VariantCard';
import { TraitChip, EmptyTraitSlot } from '@/components/traits/TraitChip';
import { StrainChip } from '@/components/traits/StrainChip';
import { TRAITS, type TraitId } from '@/shared/game/traits';
import type { BredOffspring } from '@/lib/stores/breedingStore';

/** Result of a confirmed reroll (null = failed, keep current state). */
export interface RerollResult {
  traits: string[];
  rerollTokens: number;
}

export interface BreedingRevealProps {
  offspring: BredOffspring;
  onClose: () => void;
  /** Reroll tokens available (Design v2 section 6.3 crafting loop). */
  rerollTokens?: number;
  /**
   * Reroll one trait slot (1-based) via POST /api/breeding/reroll.
   * Omitted = the reroll flow is hidden (e.g. tokenless sessions).
   */
  onReroll?: (slot: number) => Promise<RerollResult | null>;
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
  rerollTokens = 0,
  onReroll,
}: BreedingRevealProps): React.ReactElement<any> {
  const theme = dynastyThemes[offspring.dynastyName ?? ''] ?? dynastyThemes.CYBER;
  const rarity = RARITY_STYLE[offspring.rarity ?? 'common'] ?? RARITY_STYLE.common;

  // Trait state is local so a reroll updates the reveal in place
  const [traits, setTraits] = useState<string[]>(offspring.traits ?? []);
  const [tokens, setTokens] = useState(rerollTokens);
  const [confirmSlot, setConfirmSlot] = useState<number | null>(null);
  const [isRerolling, setIsRerolling] = useState(false);
  const [rerolledSlot, setRerolledSlot] = useState<number | null>(null);
  const [rerollError, setRerollError] = useState<string | null>(null);

  const slotCount = Math.max(offspring.traitSlots ?? traits.length, traits.length);

  const handleConfirmReroll = useCallback(async () => {
    if (confirmSlot === null || !onReroll || isRerolling) return;
    setIsRerolling(true);
    setRerollError(null);
    try {
      const result = await onReroll(confirmSlot);
      if (result) {
        setTraits(result.traits);
        setTokens(result.rerollTokens);
        setRerolledSlot(confirmSlot);
      } else {
        setRerollError('Reroll failed — token not spent');
      }
    } catch {
      setRerollError('Reroll failed — token not spent');
    } finally {
      setIsRerolling(false);
      setConfirmSlot(null);
    }
  }, [confirmSlot, onReroll, isRerolling]);

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

        {offspring.lineage && (
          <div className="w-full max-w-xs text-center space-y-2" data-testid="reveal-lineage">
            <p className="label-arcade">Lineage</p>
            <div className="flex justify-center items-center gap-2 flex-wrap">
              {offspring.lineage.strains.map((strain, index) => (
                <span
                  key={strain}
                  className="animate-pop-in"
                  style={{
                    animationDelay: `${1.05 + index * 0.12}s`,
                    animationFillMode: 'backwards',
                  }}
                >
                  <StrainChip
                    strain={strain}
                    size="md"
                    emphasis
                    points={offspring.lineage?.strength}
                  />
                </span>
              ))}
            </div>
            {offspring.lineage.strains.length === 2 &&
              offspring.lineage.strength > 0 &&
              !offspring.lineage.primary && (
                <p className="text-xs font-body text-beige/60">
                  Dual lineage — choose its primary before the next run.
                </p>
              )}
          </div>
        )}

        {/* Inherited traits (Design v2 section 6.3): one roll from each
            parent's pool. Each rolled chip pops in on its own beat; the
            reroll flow (token count, confirm, result) lives right here -
            "breed toward the pair you want, token the miss". */}
        {slotCount > 0 && (
          <div
            className="w-full max-w-xs text-center space-y-2"
            data-testid="reveal-traits"
          >
            <p className="label-arcade">Inherited Traits</p>
            <div className="flex justify-center items-center gap-2 flex-wrap">
              {traits.map((traitId, i) => {
                const slot = i + 1;
                const def = TRAITS[traitId as TraitId];
                return (
                  <span
                    key={`${traitId}-${slot}`}
                    className="inline-flex flex-col items-center gap-1 animate-pop-in"
                    style={{ animationDelay: `${1.1 + i * 0.15}s`, animationFillMode: 'backwards' }}
                  >
                    <TraitChip
                      traitId={traitId as TraitId}
                      size="md"
                      emphasis={rerolledSlot === slot}
                    />
                    {onReroll && tokens > 0 && (
                      <button
                        type="button"
                        onClick={() => setConfirmSlot(slot)}
                        disabled={isRerolling}
                        className="text-[10px] font-mono underline text-beige/60 hover:text-bone-white transition-colors disabled:opacity-50"
                        aria-label={`Reroll ${def?.name ?? traitId}`}
                        data-testid={`reroll-slot-${slot}`}
                      >
                        Reroll
                      </button>
                    )}
                  </span>
                );
              })}
              {Array.from({ length: slotCount - traits.length }).map((_, i) => (
                <EmptyTraitSlot key={`empty-${i}`} size="md" />
              ))}
            </div>
            {traits.length === 0 && (
              <p className="text-xs font-body text-beige/60" data-testid="reveal-no-traits">
                No traits inherited — traitless parents pass nothing on.
              </p>
            )}
            {onReroll && (
              <p className="text-xs font-mono text-beige/60" data-testid="reroll-token-count">
                Reroll tokens: {tokens}
              </p>
            )}
            {rerollError && (
              <p className="text-xs font-body text-strike-red" data-testid="reroll-error">
                {rerollError}
              </p>
            )}
            {confirmSlot !== null && (
              <div
                className="panel px-3 py-2 space-y-2"
                data-testid="reroll-confirm"
              >
                <p className="text-xs font-body text-beige/80">
                  Spend 1 token to reroll{' '}
                  <span style={{ color: theme.glow }}>
                    {TRAITS[traits[confirmSlot - 1] as TraitId]?.name ??
                      traits[confirmSlot - 1]}
                  </span>
                  ? Redraws from the combined parent pool.
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmReroll}
                    disabled={isRerolling}
                    className="btn-go px-4 py-1.5 text-xs min-h-[32px]"
                    data-testid="reroll-confirm-yes"
                  >
                    {isRerolling ? 'Rerolling…' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmSlot(null)}
                    disabled={isRerolling}
                    className="btn-neutral px-4 py-1.5 text-xs min-h-[32px]"
                    data-testid="reroll-confirm-no"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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

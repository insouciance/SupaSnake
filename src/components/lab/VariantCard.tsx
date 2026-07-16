'use client';

/**
 * VariantCard - Collection grid card for snake variants
 * Displays owned (full color) or locked (dimmed) state
 * 3:4 aspect ratio, dynasty-themed styling
 */

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import type { DynastyTheme } from '@/hooks/useDynastyTheme';
import type { SnakeVariant, OwnedSnake } from '@/shared/types/snake-data-model';
import { SnakeArt } from '@/components/lab/SnakeArt';

export interface VariantCardProps {
  variant: SnakeVariant;
  owned: OwnedSnake | null;
  dynastyTheme: DynastyTheme;
  onTap: () => void;
  isEquipped?: boolean;
}

/**
 * Convert hex color to rgba with opacity
 */
function hexToRgba(hex: string, opacity: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Lock Icon SVG Component
 */
function LockIcon({ color }: { color: string }): React.ReactElement<any> {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"
        fill={color}
      />
    </svg>
  );
}

/**
 * Checkmark Icon SVG Component (for equipped indicator)
 */
function CheckmarkIcon({ color }: { color: string }): React.ReactElement<any> {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
        fill={color}
      />
    </svg>
  );
}

/**
 * VariantCard Component
 *
 * Displays a snake variant in the collection grid.
 * Two states: owned (full color) or locked (dimmed with lock overlay).
 * Includes tap animation (scale 95% -> 100% on press/release).
 */
export function VariantCard({
  variant,
  owned,
  dynastyTheme,
  onTap,
  isEquipped = false,
}: VariantCardProps): React.ReactElement<any> {
  const [isPressed, setIsPressed] = useState(false);

  const isOwned = owned !== null;
  const primaryColor = dynastyTheme.primary;
  const secondaryColor = dynastyTheme.secondary;

  // Card background - slightly darker for contrast
  const cardBackground = `linear-gradient(135deg, ${hexToRgba(primaryColor, 0.15)} 0%, ${hexToRgba(secondaryColor, 0.15)} 100%)`;

  const handlePointerDown = useCallback(() => {
    setIsPressed(true);
  }, []);

  const handlePointerUp = useCallback(() => {
    setIsPressed(false);
  }, []);

  const handlePointerLeave = useCallback(() => {
    setIsPressed(false);
  }, []);

  const handleClick = useCallback(() => {
    onTap();
  }, [onTap]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onTap();
      }
    },
    [onTap]
  );

  return (
    <button
      type="button"
      className="relative flex flex-col rounded-lg overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{
        aspectRatio: '3 / 4',
        minHeight: '44px',
        minWidth: '44px',
        border: `2px solid ${primaryColor}`,
        background: cardBackground,
        transform: isPressed ? 'scale(0.95)' : 'scale(1)',
        transition: 'transform 150ms ease-out',
        // Focus ring color matches dynasty theme
        // @ts-expect-error CSS custom property for focus ring
        '--tw-ring-color': primaryColor,
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={
        isOwned
          ? `${variant.name}, Generation ${owned.generation}${isEquipped ? ', Equipped' : ''}`
          : `${variant.name}, Locked, ${variant.unlockCostDna} DNA to unlock`
      }
      data-testid={`variant-card-${variant.id}`}
    >
      {/* Art container - takes most of the card space */}
      <div
        className="relative flex-1 w-full"
        style={{
          opacity: isOwned ? 1 : 0.4,
        }}
      >
        {variant.artUrl ? (
          <Image
            src={variant.artUrl}
            alt={`${variant.name} artwork`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
        ) : (
          <SnakeArt
            seed={variant.id}
            name={variant.name}
            dynasty={variant.name.split(' ')[0]}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            rarity={variant.rarity}
            className="absolute inset-0 w-full h-full"
          />
        )}

        {/* Lock overlay for locked variants */}
        {!isOwned && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            data-testid="lock-icon"
          >
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: '56px',
                height: '56px',
                backgroundColor: hexToRgba('#000000', 0.6),
              }}
            >
              <LockIcon color={primaryColor} />
            </div>
          </div>
        )}

        {/* Equipped indicator (top-right corner) */}
        {isOwned && isEquipped && (
          <div
            className="absolute top-2 right-2 flex items-center justify-center rounded-full"
            style={{
              width: '28px',
              height: '28px',
              backgroundColor: primaryColor,
            }}
            aria-label="Equipped"
          >
            <CheckmarkIcon color={dynastyTheme.textOnPrimary} />
          </div>
        )}
      </div>

      {/* Info bar at bottom */}
      <div
        className="w-full px-2 py-1.5 flex items-center justify-between"
        style={{
          backgroundColor: hexToRgba('#000000', 0.5),
          minHeight: '36px',
        }}
      >
        {/* Variant name - truncate with ellipsis */}
        <span
          className="text-xs font-medium text-white truncate flex-1 text-left"
          style={{
            maxWidth: isOwned ? 'calc(100% - 40px)' : 'calc(100% - 50px)',
          }}
          title={variant.name}
        >
          {variant.name}
        </span>

        {/* Badge: Generation for owned, DNA cost for locked */}
        {isOwned ? (
          <span
            className="text-xs font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
            style={{
              backgroundColor: hexToRgba(primaryColor, 0.3),
              color: primaryColor,
            }}
          >
            Gen {owned.generation}
          </span>
        ) : (
          <span
            className="text-xs font-semibold px-1.5 py-0.5 rounded whitespace-nowrap flex items-center gap-0.5"
            style={{
              backgroundColor: hexToRgba(primaryColor, 0.3),
              color: primaryColor,
            }}
          >
            {variant.unlockCostDna}
            <span role="img" aria-label="DNA">
              💎
            </span>
          </span>
        )}
      </div>
    </button>
  );
}

export default VariantCard;

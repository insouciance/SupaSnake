'use client';

/**
 * Virtual D-Pad - Touch Controls for Mobile
 * AAA 2026 Standard: Mobile-first touch input
 */

import { useCallback, useState } from 'react';
import type { Direction } from '@/lib/game/SnakeGameLogic';
import { haptics } from '@/lib/effects/Haptics';

interface VirtualDPadProps {
  onDirectionChange: (direction: Direction) => void;
  disabled?: boolean;
  className?: string;
  /** Compact 44px targets for the reserved cockpit input dock. */
  density?: 'standard' | 'cockpit';
}

interface ButtonState {
  UP: boolean;
  DOWN: boolean;
  LEFT: boolean;
  RIGHT: boolean;
}

export function VirtualDPad({
  onDirectionChange,
  disabled = false,
  className = '',
  density = 'standard',
}: VirtualDPadProps) {
  const [pressed, setPressed] = useState<ButtonState>({
    UP: false,
    DOWN: false,
    LEFT: false,
    RIGHT: false,
  });

  const handlePress = useCallback((direction: Direction) => {
    if (disabled) return;

    haptics.light();
    setPressed(prev => ({ ...prev, [direction]: true }));
    onDirectionChange(direction);
  }, [disabled, onDirectionChange]);

  const handleRelease = useCallback((direction: Direction) => {
    setPressed(prev => ({ ...prev, [direction]: false }));
  }, []);

  const targetSize = density === 'cockpit'
    ? 'w-11 h-11'
    : 'w-16 h-16 sm:w-20 sm:h-20';
  const centerSize = density === 'cockpit'
    ? 'w-11 h-11'
    : 'w-16 h-16 sm:w-20 sm:h-20';
  const arrowSize = density === 'cockpit' ? 22 : 32;

  const buttonClass = (dir: Direction) => `
    flex items-center justify-center
    ${targetSize}
    rounded-arcade
    border backdrop-blur-sm
    transition-all duration-75
    select-none touch-none
    ${pressed[dir]
      ? 'bg-venom-orange/25 border-venom-orange/70 shadow-glow-sm shadow-venom-orange/60 scale-95'
      : 'bg-void/50 border-scale-blue-light/40 hover:bg-void/70 active:bg-venom-orange/20'
    }
    ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
  `;

  const arrowSvg = (rotation: number) => (
    <svg
      width={arrowSize}
      height={arrowSize}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${rotation}deg)` }}
      className="text-bone-white/80"
    >
      <path d="M12 5v14M5 12l7-7 7 7" />
    </svg>
  );

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      {/* UP Button */}
      <button
        className={buttonClass('UP')}
        onTouchStart={(e) => { e.preventDefault(); handlePress('UP'); }}
        onTouchEnd={() => handleRelease('UP')}
        onMouseDown={() => handlePress('UP')}
        onMouseUp={() => handleRelease('UP')}
        onMouseLeave={() => handleRelease('UP')}
        disabled={disabled}
        aria-label="Move Up"
      >
        {arrowSvg(0)}
      </button>

      {/* LEFT - CENTER - RIGHT Row */}
      <div className="flex gap-1">
        <button
          className={buttonClass('LEFT')}
          onTouchStart={(e) => { e.preventDefault(); handlePress('LEFT'); }}
          onTouchEnd={() => handleRelease('LEFT')}
          onMouseDown={() => handlePress('LEFT')}
          onMouseUp={() => handleRelease('LEFT')}
          onMouseLeave={() => handleRelease('LEFT')}
          disabled={disabled}
          aria-label="Move Left"
        >
          {arrowSvg(-90)}
        </button>

        {/* Center spacer */}
        <div className={`${centerSize} rounded-arcade bg-void/30`} aria-hidden="true" />

        <button
          className={buttonClass('RIGHT')}
          onTouchStart={(e) => { e.preventDefault(); handlePress('RIGHT'); }}
          onTouchEnd={() => handleRelease('RIGHT')}
          onMouseDown={() => handlePress('RIGHT')}
          onMouseUp={() => handleRelease('RIGHT')}
          onMouseLeave={() => handleRelease('RIGHT')}
          disabled={disabled}
          aria-label="Move Right"
        >
          {arrowSvg(90)}
        </button>
      </div>

      {/* DOWN Button */}
      <button
        className={buttonClass('DOWN')}
        onTouchStart={(e) => { e.preventDefault(); handlePress('DOWN'); }}
        onTouchEnd={() => handleRelease('DOWN')}
        onMouseDown={() => handlePress('DOWN')}
        onMouseUp={() => handleRelease('DOWN')}
        onMouseLeave={() => handleRelease('DOWN')}
        disabled={disabled}
        aria-label="Move Down"
      >
        {arrowSvg(180)}
      </button>
    </div>
  );
}

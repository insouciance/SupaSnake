'use client';

/**
 * LabHeader - Top header for Lab screen
 * Displays title, energy status, and DNA balance
 * Mobile-first with sticky positioning
 */

interface LabHeaderProps {
  /** Current energy amount */
  energy: number;
  /** Maximum energy capacity */
  maxEnergy: number;
  /** Current DNA balance */
  dna: number;
}

/**
 * Format a number with comma separators
 * @param num - Number to format
 * @returns Formatted string (e.g., 2450 -> "2,450")
 */
function formatWithCommas(num: number): string {
  return num.toLocaleString('en-US');
}

export function LabHeader({ energy, maxEnergy, dna }: LabHeaderProps) {
  // Calculate energy percentage for potential visual indicator
  const energyPercent = Math.round((energy / maxEnergy) * 100);

  return (
    <header
      className="sticky top-0 z-40 w-full h-[60px] bg-[#1a1a2e] border-b border-scale-blue-light/30 backdrop-blur-sm"
      role="banner"
      aria-label="Lab header with resources"
    >
      <div className="h-full px-4 flex items-center justify-between max-w-6xl mx-auto">
        {/* Title - Left side */}
        <h1 className="font-display uppercase tracking-arcade text-bone-white text-lg sm:text-xl">
          SupaSnake Lab
        </h1>

        {/* Resources - Right side */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Energy Display */}
          <div
            className="flex items-center gap-1.5"
            aria-label={`Energy: ${energy} of ${maxEnergy}`}
            title={`Energy: ${energy}/${maxEnergy} (${energyPercent}%)`}
          >
            <span
              className="text-base sm:text-lg"
              role="img"
              aria-hidden="true"
            >
              {/* Battery icon with color based on energy level */}
              <span className={energyPercent > 20 ? 'opacity-100' : 'opacity-50'}>
                {energyPercent > 75 ? '🔋' : energyPercent > 25 ? '🔋' : '🪫'}
              </span>
            </span>
            <span className="font-mono font-bold text-bone-white text-sm sm:text-base">
              {energy}
            </span>
          </div>

          {/* DNA Display */}
          <div
            className="flex items-center gap-1.5"
            aria-label={`DNA balance: ${formatWithCommas(dna)}`}
            title={`DNA: ${formatWithCommas(dna)}`}
          >
            <span
              className="text-base sm:text-lg"
              role="img"
              aria-hidden="true"
            >
              {/* Diamond/gem icon for DNA */}
              💎
            </span>
            <span className="font-mono font-bold text-bone-white text-sm sm:text-base">
              {formatWithCommas(dna)}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default LabHeader;

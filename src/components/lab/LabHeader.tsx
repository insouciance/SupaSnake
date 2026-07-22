'use client';

/**
 * LabHeader - Top header for Lab screen
 * Displays title, energy status, and DNA balance
 * Mobile-first with sticky positioning (sits below the fixed global nav)
 */

import Link from 'next/link';
import { IconBolt, IconDna } from '@/components/ui/icons';

interface LabHeaderProps {
  /** Current energy amount */
  energy: number;
  /** Maximum energy capacity */
  maxEnergy: number;
  /** Current DNA balance */
  dna: number;
  /** Server-derived FTUE gate; the Codex stays invisible before 15 banks. */
  codexUnlocked?: boolean;
}

/**
 * Format a number with comma separators
 * @param num - Number to format
 * @returns Formatted string (e.g., 2450 -> "2,450")
 */
function formatWithCommas(num: number): string {
  return num.toLocaleString('en-US');
}

export function LabHeader({ energy, maxEnergy, dna, codexUnlocked = false }: LabHeaderProps) {
  // Calculate energy percentage for potential visual indicator
  const energyPercent = Math.round((energy / maxEnergy) * 100);

  return (
    <header
      className="sticky top-0 z-40 w-full border-b border-scale-blue-light/40 bg-void/85 backdrop-blur-sm"
      role="banner"
      aria-label="Lab header with resources"
    >
      <div className="h-[60px] px-4 flex items-center justify-between max-w-6xl mx-auto">
        {/* Title - Left side */}
        <div className="flex items-center gap-3">
          <h1 className="heading-display text-glow-orange text-bone-white text-lg sm:text-xl">
            Supasnake <span className="text-venom-orange">Lab</span>
          </h1>
          {codexUnlocked && (
            <Link
              href="/codex"
              className="hidden sm:inline-flex text-xs font-display uppercase tracking-wide text-cyber hover:text-bone-white"
            >
              Genome Codex
            </Link>
          )}
        </div>

        {/* Resources - Right side */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Energy Display */}
          <div
            className="panel flex items-center gap-1.5 px-2.5 py-1.5"
            aria-label={`Energy: ${energy} of ${maxEnergy}`}
            title={`Energy: ${energy}/${maxEnergy} (${energyPercent}%)`}
          >
            <IconBolt
              size={16}
              className={energyPercent > 20 ? 'text-venom-orange' : 'text-venom-orange/50'}
            />
            <span className="font-mono font-bold text-bone-white text-sm sm:text-base">
              {energy}
            </span>
          </div>

          {/* DNA Display */}
          <div
            className="panel flex items-center gap-1.5 px-2.5 py-1.5"
            aria-label={`DNA balance: ${formatWithCommas(dna)}`}
            title={`DNA: ${formatWithCommas(dna)}`}
          >
            <IconDna size={16} className="text-cyber" />
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

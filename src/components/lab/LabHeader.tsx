'use client';

/**
 * LabHeader - Top header for Lab screen
 * Displays title, recovering Energy status, and DNA balance
 * Mobile-first with sticky positioning (sits below the fixed global nav)
 */

import Link from 'next/link';
import { IconBolt, IconDna, IconHome } from '@/components/ui/icons';
import type { ChargeStatus } from '@/shared/game/energyEnvelope';

interface LabHeaderProps {
  /** Recovering Energy (§8.6); null hides the readout. */
  charge: ChargeStatus | null;
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

/**
 * WP-2.07a removed the `codexUnlocked` prop. The Codex is a lexicon now —
 * it explains the game's own vocabulary — so hiding the way to it until 15
 * banked runs hid the explanations from exactly the players who needed
 * them. The discovery archive inside it is still progressive; the door is
 * not.
 */
export function LabHeader({ charge, dna }: LabHeaderProps) {

  return (
    <header
      className="sticky top-0 z-40 w-full border-b border-scale-blue-light/40 bg-void/85 backdrop-blur-sm"
      role="banner"
      aria-label="Lab header with resources"
    >
      <div className="h-[60px] px-4 flex items-center justify-between max-w-6xl mx-auto">
        {/* Title - Left side */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-arcade text-beige transition-colors hover:bg-bone-white/10 hover:text-bone-white focus:outline-none focus-visible:ring-2 focus-visible:ring-venom-orange"
            aria-label="Back Home"
          >
            <IconHome size={19} />
          </Link>
          <h1 className="heading-display text-glow-orange text-bone-white text-lg sm:text-xl">
            Supasnake <span className="text-venom-orange">Lab</span>
          </h1>
          <Link
            href="/codex"
            className="hidden sm:inline-flex text-xs font-display uppercase tracking-wide text-cyber hover:text-bone-white"
          >
            Genome Codex
          </Link>
        </div>

        {/* Resources - Right side */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Recovered Energy (§8.6). Absent until the server syncs. */}
          {charge && (
            <div
              className="panel flex items-center gap-1.5 px-2.5 py-1.5"
              aria-label={`Energy: ${charge.available} of ${charge.capacity}`}
              title={`Energy: ${charge.available}/${charge.capacity}`}
            >
              <IconBolt
                size={16}
                className={charge.available > 0 ? 'text-venom-orange' : 'text-venom-orange/50'}
              />
              <span className="font-mono font-bold text-bone-white text-sm sm:text-base">
                {charge.available}
              </span>
            </div>
          )}

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

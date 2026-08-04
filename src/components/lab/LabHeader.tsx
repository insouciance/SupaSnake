'use client';

/**
 * LabHeader - Top header for Lab screen
 * Displays title, recovering Energy status, and DNA balance
 * Mobile-first with sticky positioning (sits below the fixed global nav)
 */

import Link from 'next/link';
import { IconArrowRight, IconBolt, IconDna, IconFlask } from '@/components/ui/icons';
import type { ChargeStatus } from '@/shared/game/energyEnvelope';
import { NotificationBadge } from '@/components/ui/NotificationBadge';
import {
  destinationBadge,
  recognitionHref,
  useNotificationStore,
} from '@/lib/stores/notificationStore';
import { resolveSafeRunSetupReturnPath } from '@/lib/game/runSetupDraft';
import { formatAmount as formatWithCommas } from '@/shared/format/amount';

interface LabHeaderProps {
  /** Recovering Energy (§8.6); null hides the readout. */
  charge: ChargeStatus | null;
  /** Current DNA balance */
  dna: number;
  /** Untrusted route context. Only the exact Run Setup route is accepted. */
  returnTo?: string | null;
}

export function resolveLabBackLink(returnTo: string | null | undefined): {
  href: string;
  label: 'Back to Setup' | 'Back Home';
} {
  const safeSetupPath = resolveSafeRunSetupReturnPath(returnTo);
  return safeSetupPath
    ? { href: safeSetupPath, label: 'Back to Setup' }
    : { href: '/', label: 'Back Home' };
}

/**
 * WP-2.07a removed the `codexUnlocked` prop. The Codex is a lexicon now —
 * it explains the game's own vocabulary — so hiding the way to it until 15
 * banked runs hid the explanations from exactly the players who needed
 * them. The discovery archive inside it is still progressive; the door is
 * not.
 */
export function LabHeader({ charge, dna, returnTo = null }: LabHeaderProps) {
  const notifications = useNotificationStore((state) => state.notifications);
  const backLink = resolveLabBackLink(returnTo);
  const codexBadge = destinationBadge(notifications, 'codex');
  const codexHref = codexBadge.kind === 'dot'
    ? recognitionHref(notifications, 'codex') ?? '/codex'
    : '/codex';

  return (
    <header
      className="sticky top-0 z-40 w-full bg-void/80 backdrop-blur-md"
      role="banner"
      aria-label="Lab header with resources"
    >
      <div className="mx-auto flex h-[62px] max-w-6xl items-center justify-between gap-2 px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <Link
            href={backLink.href}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-beige/70 transition-colors hover:bg-bone-white/10 hover:text-bone-white focus:outline-none focus-visible:ring-2 focus-visible:ring-venom-orange"
            aria-label={backLink.label}
          >
            <IconArrowRight size={19} className="rotate-180" />
          </Link>
          <h1 className="heading-display truncate text-base text-bone-white sm:text-xl">
            Snake <span className="text-cyber text-glow">Lab</span>
          </h1>
          <Link
            href={codexHref}
            className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-cosmic-glow transition-[color,background-color] hover:bg-cosmic/10 hover:text-bone-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cosmic"
            aria-label="Genome Research"
            title="Open Genome Workbench"
          >
            <IconFlask size={18} />
            <NotificationBadge
              kind={codexBadge.kind}
              count={codexBadge.count}
              label="New Genome discovery"
              className="absolute right-1 top-1"
            />
          </Link>
        </div>

        {/* Resources - Right side */}
        <div
          className="flex min-h-9 shrink-0 items-center overflow-hidden rounded-full border border-scale-blue-light/40 bg-void-deep/60 px-2.5 shadow-panel"
          aria-label="Lab wallet"
        >
          <div
            className="flex items-center gap-1"
            aria-label={`DNA balance: ${formatWithCommas(dna)}`}
            title={`DNA: ${formatWithCommas(dna)}`}
          >
            <IconDna size={14} className="text-rarity-uncommon" />
            <span className="whitespace-nowrap font-mono text-[10px] font-bold text-bone-white sm:text-xs">
              {formatWithCommas(dna)}
            </span>
          </div>
          {charge && (
            <>
              <span className="mx-2 h-4 w-px bg-scale-blue-light/55" aria-hidden="true" />
              <div
                className="flex items-center gap-1"
                aria-label={`Energy: ${charge.available} of ${charge.capacity}`}
                title={`Energy: ${charge.available}/${charge.capacity}`}
              >
                <IconBolt
                  size={14}
                  className={charge.available > 0 ? 'text-venom-orange' : 'text-venom-orange/50'}
                />
                <span className="whitespace-nowrap font-mono text-[10px] font-bold text-bone-white sm:text-xs">
                  {charge.available}/{charge.capacity}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default LabHeader;

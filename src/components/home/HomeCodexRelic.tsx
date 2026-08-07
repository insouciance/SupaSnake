'use client';

import Link from 'next/link';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import { NotificationBadge } from '@/components/ui/NotificationBadge';
import {
  destinationBadge,
  recognitionHref,
  useNotificationStore,
} from '@/lib/stores/notificationStore';
import { STRAIN_IDS, STRAINS } from '@/shared/game/strains';

const RUNE_POSITIONS = [
  'left-1/2 top-0 -translate-x-1/2',
  'right-0 top-[31%]',
  'bottom-0 right-[15%]',
  'bottom-0 left-[15%]',
  'left-0 top-[31%]',
] as const;

/**
 * Genome Research is part of the chamber's world, not a fifth primary
 * command. Its five runes open the single Workbench instrument and advertise
 * the vocabulary the player will use in the Loom.
 */
export function HomeCodexRelic() {
  const notifications = useNotificationStore((state) => state.notifications);
  const badge = destinationBadge(notifications, 'codex');
  const href =
    badge.kind === 'dot'
      ? recognitionHref(notifications, 'codex') ?? '/codex'
      : '/codex';

  return (
    <Link
      href={href}
      aria-label="Genome Research"
      title="Open Genome Workbench"
      data-testid="home-codex-relic"
      className="pointer-events-auto group absolute right-[max(0.6rem,env(safe-area-inset-right,0px))] top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cosmic-glow sm:right-5 sm:h-14 sm:w-14"
    >
      {/* A DRAWN RELIC, not a glass one. This was the last blurred object on
          Home: a translucent void fill behind a 25%-alpha keyline under an
          18px violet bloom and a backdrop blur, sitting one screen-width from
          four chips that are printed. It keeps its diamond, its rotation and
          its five runes, and gives up every mechanism that was lighting it -
          flat cosmic fill, ink contour at the card weight, one hard block. */}
      <span
        aria-hidden="true"
        className="absolute inset-[7px] rotate-45 rounded-[var(--radius-chip)] border-[length:var(--ink-w-2)] border-ink bg-cosmic shadow-[var(--ink-drop-2)] transition-transform duration-300 group-hover:rotate-[135deg]"
      />
      <span aria-hidden="true" className="absolute inset-0">
        {STRAIN_IDS.map((strain, index) => (
          <span
            key={strain}
            className={`absolute flex h-3.5 w-3.5 items-center justify-center transition-transform duration-300 group-hover:scale-110 ${RUNE_POSITIONS[index]}`}
            style={{ color: STRAINS[strain].color }}
          >
            <StrainGlyph id={strain} />
          </span>
        ))}
      </span>
      <span
        aria-hidden="true"
        className="relative h-2.5 w-2.5 rotate-45 border-[length:var(--ink-w-1)] border-ink bg-venom-orange"
      />
      <NotificationBadge
        kind={badge.kind}
        count={badge.count}
        label="New Genome discovery"
        className="absolute -right-0.5 -top-0.5"
      />
    </Link>
  );
}

export default HomeCodexRelic;

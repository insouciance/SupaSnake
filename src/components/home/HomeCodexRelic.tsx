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
import { SnakeCubeChrome, snakeCubeVars } from './SnakeCubeButton';
import type { DynastyId } from '@/shared/types/game';

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
export function HomeCodexRelic({ dynasty }: { dynasty?: DynastyId }) {
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
      className="snake-cube pointer-events-auto group absolute right-[max(0.6rem,env(safe-area-inset-right,0px))] top-1/2 z-10 h-12 w-12 -translate-y-1/2 sm:right-5 sm:h-14 sm:w-14"
      style={snakeCubeVars({ dynasty })}
    >
      {/* THE WORKBENCH IS A SEGMENT TOO. (Owner ruling, 2026-08-08 — the
          settings gear and the workbench were both called out by name as
          needing the same rework as the rail.)

          What this replaces is the last object on Home with a shape of its own:
          a cosmic-violet diamond on a hard block, rotating on hover. The
          diamond was doing two jobs — "this is Genome Research" and "this is a
          control" — and only the first of them was its to do. The five strain
          runes were always the thing that said Genome, they were always drawn
          OUTSIDE the plate, and they still are; the plate underneath them is now
          a cube like every other pressable on the page, and the rotation moves
          to the runes, which is the part that was ever worth animating.

          The amber core is gone rather than kept: a small amber diamond in the
          middle of an amber cube is a mark on a surface of its own colour, and
          the runes it was competing with are the label. */}
      <SnakeCubeChrome dynasty={dynasty} />
      {/* The runes ORBIT the cube rather than sitting on its face. Inside the
          glyph box they would be five 12px marks sharing 55% of a 48px button
          with each other; outside it they ring the segment the way they ringed
          the diamond, and the cube's face stays the one clean surface. The
          rotation moved here with them — it was always the runes that made the
          object look like an instrument. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-2 transition-transform duration-300 group-hover:rotate-90"
      >
        {STRAIN_IDS.map((strain, index) => (
          <span
            key={strain}
            className={`absolute flex h-3.5 w-3.5 items-center justify-center ${RUNE_POSITIONS[index]}`}
            style={{ color: STRAINS[strain].color }}
          >
            <StrainGlyph id={strain} />
          </span>
        ))}
      </span>
      <NotificationBadge
        kind={badge.kind}
        count={badge.count}
        label="New Genome discovery"
        className="absolute -right-0.5 -top-0.5 z-10"
      />
    </Link>
  );
}

export default HomeCodexRelic;

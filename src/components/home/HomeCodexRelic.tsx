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
import { HOME_RUNE_INK } from './homeGlyphInk';
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
          object look like an instrument.

          THEY ARE DRAWN BOLD, AND BIGGER BY THE SAME RULING. (Owner, 2026-08-08:
          "the workbench cube is cool, just the symbols (for the genes) need to
          be bolder, those thin lines dont fit the concept.") 14px carrying the
          rack rung is a 1.28px line, which is under every rung of the --ink-w
          ladder and reads as a technical hairline against a character drawn
          with a 6px hull. They go to 16px at a 2px line — see `homeGlyphInk.ts`
          for the conversion.

          The ring's 8px outset is DELIBERATELY not grown to match. At 16px each
          rune now straddles the silhouette exactly — half on the cube's ink
          hull, half on the room — which is the placement the ring was
          approaching at 14px anyway, and growing the outset instead would push
          the ring past the relic's own 9.6px margin and clip it off the right
          edge of a phone. The cube itself does not move: it is measured by the
          axis harness. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-2 transition-transform duration-300 group-hover:rotate-90"
      >
        {STRAIN_IDS.map((strain, index) => (
          <span
            key={strain}
            className={`absolute flex h-4 w-4 items-center justify-center ${RUNE_POSITIONS[index]}`}
            style={{ color: STRAINS[strain].color }}
          >
            <StrainGlyph id={strain} weight={HOME_RUNE_INK} />
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

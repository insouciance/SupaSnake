'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { NotificationBadge } from '@/components/ui/NotificationBadge';
import {
  destinationBadge,
  recognitionHref,
  useNotificationStore,
  type NotificationDestination,
} from '@/lib/stores/notificationStore';
import {
  IconFlask,
  IconMedal,
  IconPlay,
  IconTrophy,
  type IconProps,
} from '@/components/ui/icons';
import { SNAKE_STYLE_PROFILE } from '@/components/game/screen/snake90s';
import { RAIL_GLYPH_INK } from './homeGlyphInk';
import { SnakeCubeChrome, snakeCubeVars } from './SnakeCubeButton';
import type { DynastyId } from '@/shared/types/game';

export type HomeCommand = 'play' | 'lab' | 'compete' | 'you';

interface HomeCommandRailProps {
  onPlay: () => void;
  playDisabled: boolean;
  playLabel: string;
  playPhase: string;
  playErrorId?: string;
  onReactionChange?: (command: HomeCommand | null) => void;
  /**
   * The dynasty of the snake in the chamber. Under the shipped style the base
   * colour is forced to the guide's amber for all three, so this moves only the
   * emissive by a hundredth — it is threaded anyway so a future style that
   * un-forces the colour makes the dock follow the creature standing above it
   * rather than quietly disagreeing with it.
   */
  dynasty?: DynastyId;
}

interface DestinationDefinition {
  command: Exclude<HomeCommand, 'play'>;
  href: string;
  label: string;
  Icon: (props: IconProps) => React.JSX.Element;
  notificationDestination: NotificationDestination;
  color: string;
}

/**
 * THE GLYPHS GO INK, ALL OF THEM. (The surface changed; the rule did not.)
 *
 * The standing rule is that an identity keeps its hue and changes its VALUE
 * with the surface it is DRAWN ON. That surface used to be a near-white chip,
 * which is why these were `cosmic-dim`, `venom-orange-dark` and `pulse` — three
 * dark marks on cream. The surface is now a segment of the snake: a saturated
 * amber face at roughly 60% luminance, and the guide has exactly one accent for
 * something drawn ON the creature, which is its own warm near-black.
 *
 * Measured against the front face (`side` band, #ed9a30 at the glyph's height),
 * the three old colours land at 1.5:1, 1.9:1 and 1.4:1 — all of them illegible,
 * and two of them nearly invisible. `GUIDE_PALETTE.ink` lands at 7.6:1. The
 * dynasty hues have not been suppressed; they were never carried HERE. Lab is
 * COSMIC on the Lab screen, and a 24px stroked icon was always the weakest
 * possible place to say so.
 */
const DESTINATIONS: DestinationDefinition[] = [
  {
    command: 'lab',
    href: '/lab',
    label: 'Lab',
    Icon: IconFlask,
    notificationDestination: 'lab',
    color: 'text-[color:var(--snake-ink)]',
  },
  {
    command: 'compete',
    href: '/leaderboard',
    label: 'Compete',
    Icon: IconTrophy,
    notificationDestination: 'clan',
    color: 'text-[color:var(--snake-ink)]',
  },
  {
    command: 'you',
    href: '/profile',
    label: 'You',
    Icon: IconMedal,
    notificationDestination: 'identity',
    color: 'text-[color:var(--snake-ink)]',
  },
];

/**
 * THE ROW IS THE CREATURE. (Owner ruling, 2026-08-08 — this replaces both the
 * SNES block and the purple keyline that answered the two rounds before it.)
 *
 *   "the buttons could look like the segments of the snake, i.e. cubes, that'd
 *    make more sense ... will make it very coherent, a great composition."
 *
 * So the dock is a head and three body segments, drawn by the creature's own
 * law — see `snakeCubeArt.ts`. Every rectangle utility that used to be in this
 * string is gone, because there is no rectangle left to style: no fill, no
 * border, no radius, no ring.
 *
 * WHY PLAY IS THE HEAD RATHER THAN A WIDER BUTTON. The ruling permits a wide
 * control to be a fused segment ROW instead of a stretched cube, and that would
 * have worked. The head is the better answer because the creature already makes
 * it: the head is a larger cube (`headSize` 0.9 against `bodySize` 0.78) on a
 * brighter base carrying nearly three times the emissive, and it is the end the
 * character sheet calls alive. Hierarchy bought from the character costs the
 * composition nothing and says something; hierarchy bought from width would
 * have had to be paid for out of the rail's gutters.
 *
 * ── ONE COIL, ONE GUTTER. (Owner ruling, 2026-08-08.) ─────────────────────
 *
 *   "the cube buttons on the bottom (play, etc) look cool, but the spacing is
 *    awkward. play and lab have good spacing, but the other 2 are too far
 *    away."
 *
 * THE CAUSE WAS THE GRID, AND IT WAS ARITHMETIC RATHER THAN TASTE. The rail was
 * four equal tracks with a gap between them, and the cubes were fixed-width
 * boxes centred in those tracks. A track is 67px ((304 - 3x12) / 4); a body cube
 * is 62px, so each body track carried 5px of SLACK that `mx-auto` split into
 * 2.5px per side — and slack lands in the gutter. The head is 78px in that same
 * 67px track, so it spends 5.5px of OVERHANG per side instead. The gutter a
 * player sees was therefore never the gap:
 *
 *     PLAY -> LAB      12 - 5.5 (head overhang) + 2.5 (Lab's slack)  =  9px
 *     LAB -> COMPETE   12 + 2.5 + 2.5                                = 17px
 *     COMPETE -> YOU   12 + 2.5 + 2.5                                = 17px
 *
 * A 9px gutter beside the biggest cube and 17px between the small ones: that is
 * exactly the row the owner described, and neither number was chosen by anyone.
 * The earlier note here read the narrow one as a deliberate "the head sits
 * closer to its first body segment", and computed it at 12px from the CLASSIC
 * profile's head ratio (0.9/0.78) rather than the shipped guide's (0.98/0.78).
 * Both the reading and the number were wrong; the ruling replaces them.
 *
 * THE FIX IS TO STOP DISTRIBUTING SPACE. A flex row of intrinsically-sized
 * cubes has no slack to distribute, so `gap` IS the gutter, at every position,
 * whatever size any one cube is.
 *
 * AND THE GUTTER IS 12px — the value that was in the stylesheet all along.
 * Making every gutter literally the measured 9px was tried and shot beside it
 * (`gap-compare`): a 9px gutter between two 62px cubes is not the same optical
 * space as a 9px gutter beside a 78px head, and at 9px the drop blocks crowd
 * the next cube's hull, which is the cube law's "CLEARLY SEPARATED" floor. 12px
 * is the only gutter in this row a designer ever chose; the 9px was that same
 * 12px with the head's accidental overhang subtracted from it. So the row is
 * closed to the one designed number and reads as one evenly articulated coil.
 *
 * WHAT 320px COSTS. Under the shipped guide the head is 0.98 against the body's
 * 0.78, so it draws at 78px and the row is 78 + 3x62 = 264px of cube. Three
 * 12px gutters put it at 300px, and a 320px viewport leaves 288px inside the
 * dock's padding. Below 336px the row therefore takes an 8px gutter — still
 * EQUAL at every position, which is the part of the ruling that is a rule; the
 * 12px is the part that is a measurement, and a measurement yields to fitting on
 * the screen. Every viewport at or above 336px gets the ruled value exactly, and
 * `shoot-home-rail.mjs` measures all four off the rendered page.
 */
const controlClass =
  'snake-cube group relative h-[62px] w-[62px] min-h-[44px] min-w-[44px] shrink-0 disabled:cursor-wait disabled:opacity-40';

/** The head's own size step, taken from the profile rather than chosen. */
const HEAD_SCALE = SNAKE_STYLE_PROFILE.headSize / SNAKE_STYLE_PROFILE.bodySize;

/** The body cube's edge, and the head's, in the pixels the rail draws them at. */
const BODY_PX = 62;
const HEAD_PX = Math.round(BODY_PX * HEAD_SCALE);

/**
 * THE GLYPHS TAKE THE BUTTON RUNG OF THE INK LADDER. (Same ruling, item 1 —
 * the conversion and its arithmetic live in `homeGlyphInk.ts`.)
 */

export function HomeCommandRail({
  onPlay,
  playDisabled,
  playLabel,
  playPhase,
  playErrorId,
  onReactionChange,
  dynasty,
}: HomeCommandRailProps) {
  const notifications = useNotificationStore((state) => state.notifications);
  const [hovered, setHovered] = useState<HomeCommand | null>(null);
  const [focused, setFocused] = useState<HomeCommand | null>(null);
  const [pressed, setPressed] = useState<HomeCommand | null>(null);
  const reaction = pressed ?? focused ?? hovered;

  useEffect(() => {
    onReactionChange?.(reaction);
  }, [onReactionChange, reaction]);

  const interactionProps = (command: HomeCommand) => ({
    onMouseEnter: () => setHovered(command),
    onMouseLeave: () => {
      setHovered(null);
      setPressed(null);
    },
    onFocus: () => setFocused(command),
    onBlur: () => {
      setFocused(null);
      setPressed(null);
    },
    onPointerDown: () => setPressed(command),
    onPointerUp: () => setPressed(null),
    onPointerCancel: () => setPressed(null),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter' || event.key === ' ') setPressed(command);
    },
    onKeyUp: () => setPressed(null),
  });

  return (
    <nav
      className="flex w-[min(19rem,100%)] items-center justify-center gap-2 min-[336px]:gap-3"
      aria-label="Home actions"
      data-testid="home-command-rail"
    >
      {/* PLAY is the head: the biggest, hottest cube in the row, and the end of
          the creature the sheet calls alive. */}
      <button
        type="button"
        onClick={onPlay}
        disabled={playDisabled}
        aria-label={playLabel}
        aria-describedby={playErrorId}
        title={playLabel}
        className={controlClass}
        style={{
          ...snakeCubeVars({ role: 'head', dynasty }),
          width: `${HEAD_PX}px`,
          height: `${HEAD_PX}px`,
        }}
        data-testid="launch-cta"
        data-launch-phase={playPhase}
        data-home-command="play"
        {...interactionProps('play')}
      >
        <SnakeCubeChrome
          role="head"
          dynasty={dynasty}
          glyphClassName="text-[color:var(--snake-ink)]"
        >
          <IconPlay size={26} />
        </SnakeCubeChrome>
        <span className="sr-only">{playLabel}</span>
      </button>

      {DESTINATIONS.map(({ command, href, label, Icon, notificationDestination, color }) => {
        const badge = destinationBadge(notifications, notificationDestination);
        const recognitionTarget =
          badge.kind === 'dot'
            ? recognitionHref(notifications, notificationDestination)
            : null;
        return (
          <Link
            key={command}
            href={recognitionTarget ?? href}
            aria-label={label}
            title={label}
            className={controlClass}
            style={snakeCubeVars({ dynasty })}
            data-home-command={command}
            {...interactionProps(command)}
          >
            <SnakeCubeChrome dynasty={dynasty} glyphClassName={color}>
              <Icon size={24} strokeWidth={RAIL_GLYPH_INK} />
            </SnakeCubeChrome>
            {/* THE BADGE RIDES THE CUBE, NOT THE FACE. It was inside the glyph
                slot, which was survivable while that slot was a screen-aligned
                box; the slot is now projected into the front face's plane, and
                anything inside it leans with the face. A leaning status dot is a
                broken status dot, so the badge is a sibling of the drawing on
                the pressable itself — which is also where it always claimed to
                be, at the cube's own corner rather than tucked inside the face
                where the chamfer would crop it. */}
            <NotificationBadge
              kind={badge.kind}
              count={badge.count}
              label={`New ${label} activity`}
              className="absolute right-0 top-0 z-10 -translate-y-1/3 translate-x-1/3"
            />
            <span className="sr-only">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default HomeCommandRail;

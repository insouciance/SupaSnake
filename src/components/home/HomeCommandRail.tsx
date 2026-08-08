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
 * THE HEAD OVERFLOWS ITS CELL, ON PURPOSE AND WITHIN THE GUTTER. Four equal
 * columns of a 19rem rail are 67px wide at the `sm` gap. The body cubes take
 * 62px and the head takes 62 x 1.154 = 71.5px, so PLAY reaches 2.25px into each
 * of its gutters and leaves 7.5px of clear room where the others leave 12px.
 * That is the creature's own spacing — the head sits closer to the first body
 * segment than the body segments sit to each other — and it is why the grid is
 * not restructured to make room.
 */
const controlClass =
  'snake-cube group relative mx-auto h-[62px] w-[62px] min-h-[44px] min-w-[44px] disabled:cursor-wait disabled:opacity-40';

/** The head's own size step, taken from the profile rather than chosen. */
const HEAD_SCALE = SNAKE_STYLE_PROFILE.headSize / SNAKE_STYLE_PROFILE.bodySize;

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
      className="grid w-[min(19rem,100%)] grid-cols-4 items-center gap-2 sm:gap-3"
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
          width: `${Math.round(62 * HEAD_SCALE)}px`,
          height: `${Math.round(62 * HEAD_SCALE)}px`,
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
              <span className="relative inline-flex items-center justify-center">
                <Icon size={24} />
                {/* The badge rides the cube's own corner rather than the glyph's
                    box, so it is never tucked inside the front face where the
                    chamfer would crop it. */}
                <NotificationBadge
                  kind={badge.kind}
                  count={badge.count}
                  label={`New ${label} activity`}
                  className="absolute -right-3 -top-3"
                />
              </span>
            </SnakeCubeChrome>
            <span className="sr-only">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default HomeCommandRail;

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

export type HomeCommand = 'play' | 'lab' | 'compete' | 'you';

interface HomeCommandRailProps {
  onPlay: () => void;
  playDisabled: boolean;
  playLabel: string;
  playPhase: string;
  playErrorId?: string;
  onReactionChange?: (command: HomeCommand | null) => void;
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
 * Glyph colours, chosen for a LIGHT CHIP — and that is why the dark-ground
 * ruling does not move them.
 *
 * The adaptive rule is that an identity keeps its hue and changes its VALUE
 * with the surface it is DRAWN ON, and the surface these are drawn on is the
 * chip, not the room. `.ink-chip` is still near-white stock; paper stopped
 * being the room and did not stop being the material. So the reasoning that
 * set these survives the reversal intact: they used to be `cosmic-glow`,
 * `rarity-legendary` and `pulse`, which resolve to #FFD700 and #fbbf24, and on
 * cream the Lab and Compete glyphs were two near-identical golds at roughly
 * 1.3:1 against their own chip. Same families, darker end.
 *
 * Had the chips gone dark with the room, all three would have had to move back
 * up. They did not, so these are left exactly as measured.
 */
const DESTINATIONS: DestinationDefinition[] = [
  {
    command: 'lab',
    href: '/lab',
    label: 'Lab',
    Icon: IconFlask,
    notificationDestination: 'lab',
    // COSMIC, at its deep value rather than its glow.
    color: 'text-cosmic-dim',
  },
  {
    command: 'compete',
    href: '/leaderboard',
    label: 'Compete',
    Icon: IconTrophy,
    notificationDestination: 'clan',
    // The amber, taken dark: a struck-metal trophy, not a lit one.
    color: 'text-venom-orange-dark',
  },
  {
    command: 'you',
    href: '/profile',
    label: 'You',
    Icon: IconMedal,
    notificationDestination: 'identity',
    color: 'text-pulse',
  },
];

/**
 * The drawn chip — now a cartridge-era BLOCK. (Owner: "i don't like the round
 * buttons, make em more 90s SNES style.")
 *
 * Three utilities left this string and none of them was replaced by another:
 *
 *   `rounded-full`        the roundness lived HERE, not in `.ink-chip` — the
 *                         class never declared a radius at all. Deleting it is
 *                         therefore the entire shape change, and the chip
 *                         inherits `--radius-chip` (4px) like every other chip
 *                         in the product. A class that has to fight a utility
 *                         is a class that has lost, so the fight is removed
 *                         rather than won.
 *   `hover:-translate-y-0.5`
 *   `active:translate-y-0`
 *                         the press is now the BLOCK, in CSS, where the
 *                         box-shadow it has to stay in step with lives. A
 *                         transform authored in one file and a shadow in
 *                         another cannot be kept in phase, and the old pair
 *                         were not: the chip lifted on hover while its block
 *                         stayed put, and on press the block shrank while the
 *                         chip did not move into the space it vacated.
 *
 * The chip keeps its AREA, and that was always the load-bearing decision: the
 * contrast has to come from the chip rather than from the glyph, because a
 * 24px stroked icon is mostly holes. 64px square holds the row inside a 19rem
 * rail with a real gutter, so four blocks with 2.5px contours never read as
 * one bar — if anything a square reads as more separate than a circle did,
 * because the gutter is now a constant width down its whole height.
 *
 * The focus ring goes INSET. An offset ring draws in the room, and the room is
 * dark: Tailwind's default offset colour is white, which would put a pale
 * halo around every chip on a night ground — the exact keyline the global law
 * retired. Inside the near-white chip an ink ring is unmissable and needs no
 * ground to sit on, so it is correct whatever the ground is ruled to be next.
 *
 * THE MARK'S KEYLINE, WORN BY THE ROW. (Owner ruling, 2026-08-08: "the buttons
 * dont fit the style… maybe the buttons have a similar style to the logo with
 * the purple 'outline'.")
 *
 * `.brand-keyline` is the Mark's own construction — a purple field closed by a
 * darker purple stroke, outside the chip's ink contour — and `globals.css`
 * carries the derivation. What matters HERE is that it is the whole answer to
 * the complaint: the row already had the right BODY (a flat block, a hard
 * contour, a displaced shadow, a real press) and was simply not speaking the
 * logo's language at its edge. Nothing about the block changes; the edge joins
 * the family.
 */
const controlClass =
  'ink-chip brand-keyline group relative mx-auto flex h-16 w-16 min-h-[44px] min-w-[44px] items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink disabled:cursor-wait disabled:opacity-40';

export function HomeCommandRail({
  onPlay,
  playDisabled,
  playLabel,
  playPhase,
  playErrorId,
  onReactionChange,
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
      className="grid w-[min(19rem,100%)] grid-cols-4 gap-2 sm:gap-3"
      aria-label="Home actions"
      data-testid="home-command-rail"
    >
      {/* Play is the one amber chip in the row, and its glyph goes ink: on the
          filled chip the accent has moved from the mark to its ground, which
          is what makes it the loudest thing in the dock. */}
      <button
        type="button"
        onClick={onPlay}
        disabled={playDisabled}
        aria-label={playLabel}
        aria-describedby={playErrorId}
        title={playLabel}
        className={`${controlClass} ink-chip-primary text-ink`}
        data-testid="launch-cta"
        data-launch-phase={playPhase}
        data-home-command="play"
        {...interactionProps('play')}
      >
        <IconPlay size={28} />
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
            className={`${controlClass} ${color}`}
            data-home-command={command}
            {...interactionProps(command)}
          >
            <span className="relative inline-flex h-8 w-8 items-center justify-center">
              <Icon size={28} />
              <NotificationBadge
                kind={badge.kind}
                count={badge.count}
                label={`New ${label} activity`}
                className="absolute -right-1 -top-1"
              />
            </span>
            <span className="sr-only">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default HomeCommandRail;

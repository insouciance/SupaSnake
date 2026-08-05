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
 * Glyph colours, chosen for a LIGHT ground.
 *
 * The same adaptive rule the outline system uses applies to the mark, not just
 * to the line: an identity keeps its hue and changes its VALUE with the surface
 * it is drawn on. These three used to be `cosmic-glow`, `rarity-legendary` and
 * `pulse`, which was correct over the old dark room and is wrong over the paper
 * sweep - `cosmic-glow` resolves to #FFD700 and `rarity-legendary` to #fbbf24,
 * so on cream the Lab and Compete glyphs were two near-identical golds at
 * roughly 1.3:1 against their own chip. Same families, darker end.
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
 * The drawn chip (owner: more contrast against the bright ground, slightly
 * bigger, bold outline from the outline tokens).
 *
 * These controls sit on the Specimen Chamber's near-white paper sweep, so the
 * adaptive rule in globals.css selects the INK stroke - `.ink-chip` carries
 * `--ink-border-2` (the button weight) plus `--ink-drop-2`. See that block for
 * why the contrast has to come from the chip's AREA and not from the glyph's
 * colour: a 24px stroked icon on cream is mostly holes.
 *
 * 56px -> 64px, which keeps the row inside a 19rem rail with a real gutter, so
 * four chips with 2.5px keylines never read as one bar.
 */
const controlClass =
  'ink-chip group relative mx-auto flex h-16 w-16 min-h-[44px] min-w-[44px] items-center justify-center rounded-full hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-wait disabled:opacity-40 disabled:hover:translate-y-0';

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

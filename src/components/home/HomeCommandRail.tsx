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

const DESTINATIONS: DestinationDefinition[] = [
  {
    command: 'lab',
    href: '/lab',
    label: 'Lab',
    Icon: IconFlask,
    notificationDestination: 'lab',
    color: 'text-cosmic-glow hover:text-cosmic-glow',
  },
  {
    command: 'compete',
    href: '/leaderboard',
    label: 'Compete',
    Icon: IconTrophy,
    notificationDestination: 'clan',
    color: 'text-rarity-legendary hover:text-rarity-legendary',
  },
  {
    command: 'you',
    href: '/profile',
    label: 'You',
    Icon: IconMedal,
    notificationDestination: 'identity',
    color: 'text-pulse hover:text-pulse',
  },
];

const controlClass =
  'group relative flex h-14 min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-[color,filter,transform,background-color] hover:-translate-y-0.5 hover:bg-void-deep/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current active:translate-y-0 active:scale-90 disabled:cursor-wait disabled:opacity-40 disabled:hover:translate-y-0';

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
      className="grid w-[min(16rem,100%)] grid-cols-4"
      aria-label="Home actions"
      data-testid="home-command-rail"
    >
      <button
        type="button"
        onClick={onPlay}
        disabled={playDisabled}
        aria-label={playLabel}
        aria-describedby={playErrorId}
        title={playLabel}
        className={`${controlClass} text-venom-orange hover:drop-shadow-[0_0_7px_rgba(34,211,238,0.8)]`}
        data-testid="launch-cta"
        data-launch-phase={playPhase}
        data-home-command="play"
        {...interactionProps('play')}
      >
        <IconPlay size={25} />
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
              <Icon size={24} />
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

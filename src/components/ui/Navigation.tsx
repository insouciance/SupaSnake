'use client';

/**
 * Stable application navigation.
 *
 * Mobile gets five fixed destinations with real 44px targets: Play, Lab,
 * Compete, You, and More. Secondary utilities live behind More instead of
 * shrinking an ever-growing icon row. Desktop uses the same order as a
 * right-hand rail, so a destination never moves when the current route or a
 * feature flag changes.
 *
 * `/game` deliberately does not mount this component. Setup, play, and
 * Results form one immersive run stack with their own single exit affordance.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GAME_CONFIG } from '@/shared/config/game';
import { SERPENT_V1_ENABLED } from '@/lib/serpent/config';
import { AccountChip } from '@/components/ui/AccountChip';
import { NotificationBadge } from '@/components/ui/NotificationBadge';
import { NotificationCenter } from '@/components/ui/NotificationCenter';
import {
  attentionBadge,
  destinationBadge,
  markedDestinationHref,
  useNotificationStore,
  type NotificationDestination,
} from '@/lib/stores/notificationStore';
import {
  IconCart,
  IconFlask,
  IconGear,
  IconMedal,
  IconPlay,
  IconShield,
  IconSnake,
  IconTrophy,
  type IconProps,
} from '@/components/ui/icons';

interface PrimaryNode {
  href: string;
  label: string;
  Icon: (props: IconProps) => React.JSX.Element;
  isActive: (pathname: string) => boolean;
  notificationDestination?: NotificationDestination;
}

const PRIMARY_NODES: PrimaryNode[] = [
  {
    href: '/',
    label: 'Play',
    Icon: IconPlay,
    isActive: (pathname) => pathname === '/',
    notificationDestination: 'home',
  },
  {
    href: '/lab',
    label: 'Lab',
    Icon: IconFlask,
    isActive: (pathname) => pathname === '/lab' || pathname.startsWith('/lab/'),
    notificationDestination: 'lab',
  },
  {
    href: '/leaderboard',
    label: 'Compete',
    Icon: IconTrophy,
    isActive: (pathname) =>
      pathname === '/leaderboard' ||
      pathname.startsWith('/leaderboard/') ||
      pathname === '/clan' ||
      pathname.startsWith('/clan/') ||
      pathname === '/serpent' ||
      pathname.startsWith('/serpent/'),
    notificationDestination: 'clan',
  },
  {
    href: '/profile',
    label: 'You',
    Icon: IconMedal,
    isActive: (pathname) => pathname === '/profile' || pathname.startsWith('/profile/'),
    notificationDestination: 'identity',
  },
];

const destinationClass = (active: boolean) =>
  `group relative flex min-h-[52px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-full transition-[color,background-color,filter,transform] sm:h-11 sm:min-h-[44px] sm:w-11 sm:flex-row ${
    active
      ? 'bg-[radial-gradient(circle,rgba(250,204,21,0.16),transparent_66%)] text-venom-orange drop-shadow-[0_0_7px_rgba(250,204,21,0.65)] after:absolute after:bottom-1 after:h-1 after:w-1 after:rotate-45 after:bg-venom-orange sm:after:bottom-0'
      : 'text-beige/65 hover:-translate-y-0.5 hover:bg-cyber/5 hover:text-bone-white motion-reduce:hover:translate-y-0'
  }`;

export function Navigation() {
  const pathname = usePathname();
  const notifications = useNotificationStore((state) => state.notifications);
  const moreBadge = attentionBadge(notifications);
  const moreActive = pathname === '/shop' || pathname.startsWith('/shop/') ||
    pathname === '/settings' || pathname.startsWith('/settings/');

  return (
    <nav aria-label="Primary">
      <div
        data-testid="primary-navigation-destinations"
        className="fixed bottom-[calc(0.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 grid w-[calc(100%_-_1rem)] max-w-md -translate-x-1/2 grid-cols-5 items-center gap-0.5 rounded-full border border-scale-blue-light/25 bg-void-deep/72 px-1 py-0.5 shadow-[0_12px_38px_rgba(0,0,0,0.48)] backdrop-blur-xl sm:bottom-auto sm:left-auto sm:right-3 sm:top-1/2 sm:flex sm:w-auto sm:translate-x-0 sm:-translate-y-1/2 sm:flex-col sm:gap-1 sm:border-scale-blue-light/15 sm:bg-void-deep/45 sm:p-1 sm:shadow-none"
      >
        {PRIMARY_NODES.map(
          ({ href, label, Icon, isActive: resolveActive, notificationDestination }, index) => {
            const active = resolveActive(pathname);
            const badge = notificationDestination
              ? destinationBadge(notifications, notificationDestination)
              : { kind: 'hidden' as const };
            // A quiet dot redirects the node at whatever it marks — an open
            // `action` first, then recognition (WP-E, PEO §6 step 2). Compete
            // is the case that forces it: it is the clan family's nav slot but
            // links to `/leaderboard`, so before this a clan mark sent the
            // player to a leaderboard. An exclamation badge is untouched.
            const recognitionTarget =
              notificationDestination && badge.kind === 'dot'
                ? markedDestinationHref(notifications, notificationDestination)
                : null;

            return (
              <Link
                key={href}
                href={recognitionTarget ?? href}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={`${destinationClass(active)} animate-fade-up`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <Icon size={19} />
                <span className="font-display text-[9px] uppercase leading-none tracking-wide sm:hidden">
                  {label}
                </span>
                <NotificationBadge
                  kind={badge.kind}
                  count={badge.count}
                  label={`New ${label} activity`}
                  className="absolute -right-1 -top-1"
                />
                <span className="pointer-events-none absolute right-full top-1/2 mr-3 hidden -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-arcade border border-scale-blue-light/50 bg-void-deep/95 px-2.5 py-1 font-display text-[11px] uppercase tracking-wide-arcade text-bone-white opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 sm:block">
                  {label}
                </span>
              </Link>
            );
          }
        )}

        <details className="group/more relative animate-fade-up" style={{ animationDelay: '200ms' }}>
          <summary
            aria-label="More"
            className={`${destinationClass(moreActive)} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
          >
            <span aria-hidden="true" className="font-mono text-xl leading-none tracking-[-0.18em] pr-[0.18em]">
              •••
            </span>
            <span className="font-display text-[9px] uppercase leading-none tracking-wide sm:hidden">
              More
            </span>
            <NotificationBadge
              kind={moreBadge.kind}
              count={moreBadge.count}
              label="New activity"
              className="absolute -right-1 -top-1"
            />
            <span className="pointer-events-none absolute right-full top-1/2 mr-3 hidden -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-arcade border border-scale-blue-light/50 bg-void-deep/95 px-2.5 py-1 font-display text-[11px] uppercase tracking-wide-arcade text-bone-white opacity-0 transition-all duration-150 group-hover/more:translate-x-0 group-hover/more:opacity-100 group-focus-within/more:translate-x-0 group-focus-within/more:opacity-100 sm:block">
              More
            </span>
          </summary>

          <div
            data-testid="navigation-more-menu"
            className="absolute bottom-full right-0 mb-3 w-64 rounded-arcade border border-scale-blue-light/50 bg-void-deep/95 p-2 shadow-2xl backdrop-blur-xl sm:bottom-auto sm:right-full sm:top-1/2 sm:mb-0 sm:mr-3 sm:-translate-y-1/2"
          >
            <p className="px-2 pb-1 pt-0.5 font-display text-[10px] uppercase tracking-wide-arcade text-beige/50">
              Explore
            </p>
            {GAME_CONFIG.features.clans && (
              <Link
                href="/clan"
                className="flex min-h-[44px] items-center gap-3 rounded-arcade px-3 py-2 font-body text-sm text-beige transition-colors hover:bg-scale-blue/40 hover:text-bone-white"
              >
                <IconShield size={18} /> Clan
              </Link>
            )}
            {SERPENT_V1_ENABLED && (
              <Link
                href="/serpent"
                className="flex min-h-[44px] items-center gap-3 rounded-arcade px-3 py-2 font-body text-sm text-beige transition-colors hover:bg-scale-blue/40 hover:text-bone-white"
              >
                <IconSnake size={18} /> Serpent
              </Link>
            )}
            <Link
              href="/shop"
              className="flex min-h-[44px] items-center gap-3 rounded-arcade px-3 py-2 font-body text-sm text-beige transition-colors hover:bg-scale-blue/40 hover:text-bone-white"
            >
              <IconCart size={18} /> Shop
            </Link>
            <Link
              href="/settings"
              className="flex min-h-[44px] items-center gap-3 rounded-arcade px-3 py-2 font-body text-sm text-beige transition-colors hover:bg-scale-blue/40 hover:text-bone-white"
            >
              <IconGear size={18} /> Settings
            </Link>

            <div className="mt-2 flex items-center justify-between gap-3 border-t border-scale-blue-light/25 px-2 pt-2">
              <span className="font-body text-xs text-beige/60">Inbox</span>
              <NotificationCenter />
            </div>
            <div className="mt-2 flex min-h-[44px] items-center justify-between gap-3 px-2">
              <span className="font-body text-xs text-beige/60">Account</span>
              <AccountChip />
            </div>
          </div>
        </details>
      </div>
    </nav>
  );
}

export default Navigation;

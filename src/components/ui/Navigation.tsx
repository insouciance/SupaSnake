'use client';

/**
 * Navigation - game-style floating icon rail (replaces the web command bar).
 *
 * Desktop (sm+): a vertically-centered rail of glass icon chips on the right
 * edge; labels slide out on hover/focus. Mobile: a safe-area-aware floating
 * rail on the bottom edge, icon-only.
 *
 * Nodes: Home (non-home screens only - on home the wordmark is the identity),
 * Lab, Leaderboard + Clan (feature-flagged), Shop, Settings, and the You node
 * hosting the AccountChip (guest save-progress / account menu).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GAME_CONFIG } from '@/shared/config/game';
import { AccountChip } from '@/components/ui/AccountChip';
import {
  IconHome,
  IconFlask,
  IconTrophy,
  IconShield,
  IconCart,
  IconGear,
  type IconProps,
} from '@/components/ui/icons';

interface RailNode {
  href: string;
  label: string;
  Icon: (p: IconProps) => React.JSX.Element;
}

export function Navigation() {
  const pathname = usePathname();

  const nodes: RailNode[] = [
    ...(pathname === '/'
      ? []
      : [{ href: '/', label: 'Home', Icon: IconHome }]),
    { href: '/lab', label: 'Lab', Icon: IconFlask },
    ...(GAME_CONFIG.features.leaderboards
      ? [{ href: '/leaderboard', label: 'Leaderboard', Icon: IconTrophy }]
      : []),
    ...(GAME_CONFIG.features.clans
      ? [{ href: '/clan', label: 'Clan', Icon: IconShield }]
      : []),
    { href: '/shop', label: 'Shop', Icon: IconCart },
    { href: '/settings', label: 'Settings', Icon: IconGear },
  ];

  return (
    <nav aria-label="Primary">
      <div className="fixed z-50 flex flex-row sm:flex-col items-center gap-1.5 sm:gap-2 bottom-[calc(0.625rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 sm:bottom-auto sm:left-auto sm:translate-x-0 sm:right-3 sm:top-1/2 sm:-translate-y-1/2">
        {nodes.map(({ href, label, Icon }, i) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-arcade border backdrop-blur-xl transition-all animate-fade-up ${
                isActive
                  ? 'bg-void-deep/80 border-venom-orange/70 text-venom-orange shadow-glow-sm shadow-venom-orange/40'
                  : 'bg-void-deep/70 border-scale-blue-light/50 text-beige/70 hover:text-bone-white hover:border-beige/60'
              }`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <Icon size={19} />
              {/* Label flyout - desktop only, slides out on hover/focus */}
              <span className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-3 hidden sm:block whitespace-nowrap rounded-arcade border border-scale-blue-light/50 bg-void-deep/90 px-2.5 py-1 font-display text-[11px] uppercase tracking-wide-arcade text-bone-white opacity-0 translate-x-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0">
                {label}
              </span>
            </Link>
          );
        })}

        {/* You node - identity chip (guest save-progress / account menu).
            On the mobile bottom rail the chip's popover must open upward. */}
        <div
          className="animate-fade-up sm:mt-1 max-sm:[&_[data-testid=account-chip-menu]]:top-auto max-sm:[&_[data-testid=account-chip-menu]]:bottom-full max-sm:[&_[data-testid=account-chip-menu]]:mt-0 max-sm:[&_[data-testid=account-chip-menu]]:mb-2"
          style={{ animationDelay: `${nodes.length * 60}ms` }}
        >
          <AccountChip />
        </div>
      </div>
    </nav>
  );
}

export default Navigation;

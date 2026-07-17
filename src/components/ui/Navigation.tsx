'use client';

/**
 * Navigation Component
 * Modern glass command bar: fixed top bar with backdrop blur over the void
 * and a cyan hairline edge. On mobile the link row becomes a safe-area-aware
 * bottom tab bar (thumb reach); on sm+ it sits inline in the top bar with a
 * cyan underline glow marking the active item.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGameStore } from '@/lib/store/gameStore';
import { GAME_CONFIG } from '@/shared/config/game';
import { AccountChip } from '@/components/ui/AccountChip';
import {
  IconHome,
  IconPlay,
  IconFlask,
  IconTrophy,
  IconShield,
  IconBolt,
  type IconProps,
} from '@/components/ui/icons';

export function Navigation() {
  const pathname = usePathname();
  const { energy } = useGameStore();

  const links: { href: string; label: string; Icon: (p: IconProps) => React.JSX.Element }[] = [
    { href: '/', label: 'Home', Icon: IconHome },
    { href: '/game', label: 'Play', Icon: IconPlay },
    { href: '/lab', label: 'Lab', Icon: IconFlask },
    ...(GAME_CONFIG.features.leaderboards
      ? [{ href: '/leaderboard', label: 'Leaderboard', Icon: IconTrophy }]
      : []),
    ...(GAME_CONFIG.features.clans
      ? [{ href: '/clan', label: 'Clan', Icon: IconShield }]
      : []),
  ];

  return (
    <nav aria-label="Primary">
      {/* Top command bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-14">
        {/* Glass layer (kept separate so the fixed bottom tab bar below is
            not trapped by backdrop-filter's containing block) */}
        <div className="absolute inset-0 bg-void-deep/70 backdrop-blur-xl" aria-hidden="true" />
        {/* Thin cyan hairline bottom edge */}
        <div className="absolute bottom-0 left-0 right-0 divider-glow" aria-hidden="true" />

        <div className="relative h-full max-w-7xl mx-auto px-4 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="heading-display text-lg text-venom-orange text-glow-accent hover:text-venom-orange-light transition-colors"
          >
            SUPASNAKE
          </Link>

          {/* Link row: bottom tab bar on mobile, inline on sm+ */}
          <div className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch justify-around border-t border-scale-blue-light/40 bg-void-deep/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] sm:static sm:z-auto sm:flex sm:items-center sm:justify-start sm:gap-1 sm:border-t-0 sm:bg-transparent sm:backdrop-blur-none sm:pb-0">
            {links.map(({ href, label, Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  className={`relative flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 flex-1 sm:flex-none px-1 sm:px-3 py-1.5 sm:py-2.5 min-h-[52px] sm:min-h-[44px] sm:rounded-arcade text-[10px] sm:text-sm font-body font-semibold transition-all ${
                    isActive
                      ? 'text-venom-orange'
                      : 'text-beige/60 hover:text-bone-white'
                  }`}
                >
                  {isActive && (
                    <>
                      {/* Mobile: glow tick on the tab's top edge */}
                      <span
                        className="sm:hidden absolute top-0 left-1/4 right-1/4 h-0.5 rounded-full bg-venom-orange shadow-glow-sm shadow-venom-orange/60"
                        aria-hidden="true"
                      />
                      {/* Desktop: cyan underline glow */}
                      <span
                        className="hidden sm:block absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-venom-orange shadow-glow-sm shadow-venom-orange/60"
                        aria-hidden="true"
                      />
                    </>
                  )}
                  <Icon size={18} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm">
              <IconBolt size={16} className="text-venom-orange" />
              <span className="font-mono font-bold text-bone-white">
                {energy}/{GAME_CONFIG.economy.energy.maxEnergy}
              </span>
            </div>
            <AccountChip />
          </div>
        </div>
      </div>
    </nav>
  );
}

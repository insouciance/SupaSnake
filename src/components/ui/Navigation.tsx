'use client';

/**
 * Navigation Component
 * Fixed top bar on the void: icon + label items with active glow state.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGameStore } from '@/lib/store/gameStore';
import { GAME_CONFIG } from '@/shared/config/game';
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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-void-deep/85 backdrop-blur-sm border-b border-scale-blue-light/30">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link
            href="/"
            className="heading-display text-lg text-venom-orange text-glow-orange hover:text-venom-orange-light transition-colors"
          >
            SUPASNAKE
          </Link>

          <div className="flex items-center gap-1 sm:gap-3">
            {links.map(({ href, label, Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  className={`flex items-center gap-1.5 px-2 sm:px-3 py-2.5 min-h-[44px] rounded-arcade text-sm font-body font-semibold transition-all ${
                    isActive
                      ? 'text-venom-orange [text-shadow:0_0_12px_rgba(217,131,36,0.6)]'
                      : 'text-beige/60 hover:text-bone-white'
                  }`}
                >
                  <Icon size={18} />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}

            <div className="flex items-center gap-1.5 pl-2 text-sm border-l border-scale-blue-light/30">
              <IconBolt size={16} className="text-venom-orange" />
              <span className="font-mono font-bold text-bone-white">
                {energy}/{GAME_CONFIG.economy.energy.maxEnergy}
              </span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

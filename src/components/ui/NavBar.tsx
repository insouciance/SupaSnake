'use client';

/**
 * NavBar - Shared navigation component
 * Modern glass command bar matching Navigation: fixed top bar with backdrop
 * blur over the void and a cyan hairline edge. On mobile the link row
 * becomes a safe-area-aware bottom tab bar; on sm+ it sits inline with a
 * cyan underline glow marking the active item. Hosts the AccountChip so
 * identity is visible from every screen.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AccountChip } from '@/components/ui/AccountChip';
import {
  IconTrophy,
  IconUser,
  IconCart,
  IconFlask,
  type IconProps,
} from '@/components/ui/icons';

interface NavBarProps {
  /** Show the logo/brand link */
  showLogo?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const NAV_LINKS: {
  href: string;
  label: string;
  Icon: (p: IconProps) => React.JSX.Element;
}[] = [
  { href: '/leaderboard', label: 'Leaderboard', Icon: IconTrophy },
  { href: '/settings', label: 'Profile', Icon: IconUser },
  { href: '/shop', label: 'Shop', Icon: IconCart },
  { href: '/lab', label: 'Lab', Icon: IconFlask },
];

export function NavBar({ showLogo = true, className = '' }: NavBarProps) {
  const pathname = usePathname();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  return (
    <nav aria-label="Primary" className={className}>
      {/* Top command bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-14">
        {/* Glass layer (kept separate so the fixed bottom tab bar below is
            not trapped by backdrop-filter's containing block) */}
        <div className="absolute inset-0 bg-void-deep/70 backdrop-blur-xl" aria-hidden="true" />
        {/* Thin cyan hairline bottom edge */}
        <div className="absolute bottom-0 left-0 right-0 divider-glow" aria-hidden="true" />

        <div className="relative h-full max-w-6xl mx-auto px-4 flex items-center justify-between gap-3">
          {/* Logo */}
          {showLogo && (
            <Link
              href="/"
              className="heading-display text-lg text-venom-orange text-glow-accent hover:text-venom-orange-light transition-colors"
            >
              SUPASNAKE
            </Link>
          )}

          {/* Link row: bottom tab bar on mobile, inline on sm+ */}
          <div className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch justify-around border-t border-scale-blue-light/40 bg-void-deep/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] sm:static sm:z-auto sm:flex sm:items-center sm:justify-start sm:gap-1 sm:border-t-0 sm:bg-transparent sm:backdrop-blur-none sm:pb-0">
            {NAV_LINKS.map(({ href, label, Icon }) => {
              // Only check active state after mount to prevent hydration mismatch
              const isActive = hasMounted && pathname === href;
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

          <AccountChip />
        </div>
      </div>
    </nav>
  );
}

export default NavBar;

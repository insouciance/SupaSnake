'use client';

/**
 * NavBar - Shared navigation component
 * Arcade-styled fixed navigation bar for consistent UX across all pages.
 * Icon + label items with an active dynasty-glow state over the void.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
    <nav
      className={`fixed top-0 left-0 right-0 z-50 bg-void-deep/85 backdrop-blur-sm border-b border-scale-blue-light/30 ${className}`}
    >
      <div className="max-w-6xl mx-auto px-4 py-1.5 flex justify-between items-center">
        {/* Logo */}
        {showLogo && (
          <Link
            href="/"
            className="heading-display text-lg text-venom-orange text-glow-orange hover:text-venom-orange-light transition-colors"
          >
            SUPASNAKE
          </Link>
        )}

        {/* Navigation Links */}
        <div className="flex gap-1 sm:gap-2">
          {NAV_LINKS.map(({ href, label, Icon }) => {
            // Only check active state after mount to prevent hydration mismatch
            const isActive = hasMounted && pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2.5 min-h-[44px] text-sm font-body font-semibold rounded-arcade transition-all ${
                  isActive
                    ? 'border border-venom-orange/70 bg-scale-blue/60 text-venom-orange shadow-glow-sm shadow-venom-orange/40'
                    : 'text-beige/70 hover:text-venom-orange hover:bg-scale-blue/40'
                }`}
              >
                <Icon size={18} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export default NavBar;

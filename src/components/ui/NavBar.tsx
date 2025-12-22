'use client';

/**
 * NavBar - Shared navigation component
 * Arcade-styled fixed navigation bar for consistent UX across all pages
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavBarProps {
  /** Show the logo/brand link */
  showLogo?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const NAV_LINKS = [
  { href: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
  { href: '/settings', label: 'Profile', icon: '👤' },
  { href: '/shop', label: 'Shop', icon: '🛒' },
  { href: '/lab', label: 'Lab', icon: '🧬' },
];

export function NavBar({ showLogo = true, className = '' }: NavBarProps) {
  const pathname = usePathname();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 bg-scale-blue-dark/90 backdrop-blur-sm border-b border-scale-blue-light/30 ${className}`}
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
        {/* Logo */}
        {showLogo && (
          <Link
            href="/"
            className="font-display uppercase tracking-arcade text-venom-orange text-lg hover:text-venom-orange-light transition-colors"
          >
            OG Snake
          </Link>
        )}

        {/* Navigation Links */}
        <div className="flex gap-2 sm:gap-4">
          {NAV_LINKS.map((link) => {
            // Only check active state after mount to prevent hydration mismatch
            const isActive = hasMounted && pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-body rounded-arcade transition-all ${
                  isActive
                    ? 'bg-scale-blue border border-venom-orange text-venom-orange'
                    : 'text-beige hover:text-venom-orange hover:bg-scale-blue/50'
                }`}
              >
                <span>{link.icon}</span>
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export default NavBar;

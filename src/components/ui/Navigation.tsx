'use client';

/**
 * Navigation Component
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGameStore } from '@/lib/store/gameStore';
import { GAME_CONFIG } from '@/shared/config/game';

export function Navigation() {
  const pathname = usePathname();
  const { energy } = useGameStore();

  const links = [
    { href: '/', label: 'Home' },
    { href: '/game', label: 'Play' },
    { href: '/lab', label: 'Lab' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-sm border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-pink-500">
            SupaSnake
          </Link>

          <div className="flex items-center gap-6">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors ${
                  pathname === link.href
                    ? 'text-white'
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}

            <div className="flex items-center gap-2 text-sm">
              <span className="text-yellow-500">⚡</span>
              <span className="font-bold">{energy}/{GAME_CONFIG.economy.energy.maxEnergy}</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

'use client';

/**
 * Settings/Profile Page
 * Identity (Player Identity v1: card, handle, equip), career stats, and
 * achievements
 */

import { useAuth } from '@/lib/auth/AuthProvider';
import { IdentityPanel } from '@/components/identity/IdentityPanel';
import { CareerStats } from '@/components/profile/CareerStats';
import { AchievementBadges } from '@/components/profile/AchievementBadges';
import { AimSystemPanel } from '@/components/profile/AimSystemPanel';
import { NavBar } from '@/components/ui/NavBar';
import Link from 'next/link';
import { IconCart, IconFlask, IconLock, IconTrophy, IconUser } from '@/components/ui/icons';

export default function SettingsPage() {
  const { user, signOut } = useAuth();

  if (!user) {
    return (
      <div className="app-bg text-bone-white">
        <NavBar />
        <div className="flex items-center justify-center min-h-screen px-4">
          <div className="panel-elevated p-8 text-center space-y-6 w-full max-w-sm animate-pop-in">
            <h1 className="heading-display text-2xl text-venom-orange text-glow-orange">Please Sign In</h1>
            <p className="text-beige font-body">Sign in to view your profile</p>
            <Link
              href="/login"
              className="btn-go inline-block px-8 py-3 min-h-[44px]"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-bg text-bone-white">
      <NavBar />

      {/* Content clears the floating nav rail (bottom mobile / right desktop) */}
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-28 sm:pb-12 sm:pr-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8 animate-fade-up">
          <div>
            <h1 className="heading-display text-4xl text-venom-orange text-glow-orange flex items-center gap-3">
              <IconUser size={34} />
              Handler Profile
            </h1>
            <p className="text-beige font-body mt-1">Your identity, stats and achievements</p>
          </div>
          <Link
            href="/game"
            className="btn-go self-start px-6 py-3 min-h-[44px] inline-flex items-center"
          >
            Play
          </Link>
        </div>

        {/* Identity (Player Identity v1): card preview, handle, equip */}
        <div className="mb-6">
          <IdentityPanel />
        </div>

        {/* Account Info */}
        <div className="panel-elevated p-6 mb-6 animate-fade-up">
          <h2 className="heading-display text-xl text-bone-white mb-4">Account</h2>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-cta-gradient rounded-arcade flex items-center justify-center text-2xl font-display text-void-deep border border-venom-orange-light shadow-glow-sm shadow-venom-orange/40">
              {user.email?.charAt(0).toUpperCase() || '?'}
            </div>
            <div>
              <p className="font-body text-bone-white text-lg">{user.email}</p>
              <p className="text-beige text-sm font-body">
                Player since {new Date(user.created_at || Date.now()).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Career Stats */}
        <div className="mb-6">
          <CareerStats />
        </div>

        {/* Aim System */}
        <div className="mb-6">
          <AimSystemPanel />
        </div>

        {/* Achievements */}
        <div className="mb-6">
          <AchievementBadges showAll={true} maxDisplay={12} />
        </div>

        {/* Quick Links */}
        <div className="panel-elevated p-6 mb-6 animate-fade-up">
          <h2 className="heading-display text-xl text-bone-white mb-4">Quick Links</h2>
          <div className="grid grid-cols-2 gap-4">
            <Link
              href="/leaderboard"
              className="p-4 bg-void/60 border border-scale-blue-light/50 rounded-arcade hover:border-venom-orange/70 hover:scale-[1.02] active:scale-[0.98] transition-all text-center group"
            >
              <IconTrophy size={28} className="mx-auto mb-2 text-venom-orange" />
              <span className="font-body text-beige group-hover:text-bone-white transition-colors">Leaderboard</span>
            </Link>
            <Link
              href="/lab"
              className="p-4 bg-void/60 border border-scale-blue-light/50 rounded-arcade hover:border-venom-orange/70 hover:scale-[1.02] active:scale-[0.98] transition-all text-center group"
            >
              <IconFlask size={28} className="mx-auto mb-2 text-venom-orange" />
              <span className="font-body text-beige group-hover:text-bone-white transition-colors">Breeding Lab</span>
            </Link>
            <Link
              href="/shop"
              className="p-4 bg-void/60 border border-scale-blue-light/50 rounded-arcade hover:border-venom-orange/70 hover:scale-[1.02] active:scale-[0.98] transition-all text-center group"
            >
              <IconCart size={28} className="mx-auto mb-2 text-venom-orange" />
              <span className="font-body text-beige group-hover:text-bone-white transition-colors">Shop</span>
            </Link>
            <Link
              href="/settings/privacy"
              className="p-4 bg-void/60 border border-scale-blue-light/50 rounded-arcade hover:border-venom-orange/70 hover:scale-[1.02] active:scale-[0.98] transition-all text-center group"
            >
              <IconLock size={28} className="mx-auto mb-2 text-venom-orange" />
              <span className="font-body text-beige group-hover:text-bone-white transition-colors">Privacy</span>
            </Link>
          </div>
        </div>

        {/* Sign Out */}
        <div className="text-center animate-fade-up">
          <button
            onClick={() => signOut()}
            className="btn-stop px-8 py-3 min-h-[44px]"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

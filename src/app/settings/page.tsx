'use client';

/**
 * Settings/Profile Page
 * Displays player profile, career stats, and achievements
 */

import { useAuth } from '@/lib/auth/AuthProvider';
import { CareerStats } from '@/components/profile/CareerStats';
import { AchievementBadges } from '@/components/profile/AchievementBadges';
import { NavBar } from '@/components/ui/NavBar';
import Link from 'next/link';

export default function SettingsPage() {
  const { user, signOut } = useAuth();

  if (!user) {
    return (
      <div className="min-h-screen bg-scale-blue-dark text-bone-white">
        <NavBar />
        <div className="flex items-center justify-center min-h-screen pt-16">
          <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-8 text-center space-y-6">
            <h1 className="text-2xl font-display uppercase tracking-arcade text-venom-orange">Please Sign In</h1>
            <p className="text-beige font-body">Sign in to view your profile</p>
            <Link
              href="/login"
              className="inline-block px-8 py-3 bg-venom-orange border-[3px] border-venom-orange-dark rounded-arcade font-display uppercase tracking-arcade text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-scale-blue-dark text-bone-white">
      <NavBar />

      {/* Content with top padding for fixed nav */}
      <div className="max-w-4xl mx-auto px-4 pt-20 pb-12">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-display uppercase tracking-arcade text-venom-orange">Profile</h1>
            <p className="text-beige font-body mt-1">Your stats and achievements</p>
          </div>
          <Link
            href="/game"
            className="px-6 py-3 bg-venom-orange border-[3px] border-venom-orange-dark rounded-arcade font-display uppercase tracking-arcade text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            Play
          </Link>
        </div>

        {/* Account Info */}
        <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6 mb-6">
          <h2 className="text-xl font-display uppercase tracking-arcade text-bone-white mb-4">Account</h2>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-venom-orange rounded-arcade flex items-center justify-center text-2xl font-display text-scale-blue-dark border-[3px] border-venom-orange-dark">
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

        {/* Achievements */}
        <div className="mb-6">
          <AchievementBadges showAll={true} maxDisplay={12} />
        </div>

        {/* Quick Links */}
        <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6 mb-6">
          <h2 className="text-xl font-display uppercase tracking-arcade text-bone-white mb-4">Quick Links</h2>
          <div className="grid grid-cols-2 gap-4">
            <Link
              href="/leaderboard"
              className="p-4 bg-scale-blue-dark border-[3px] border-scale-blue-light rounded-arcade hover:border-venom-orange hover:scale-[1.02] active:scale-[0.98] transition-all text-center group"
            >
              <span className="block text-2xl mb-2">🏆</span>
              <span className="font-body text-beige group-hover:text-bone-white transition-colors">Leaderboard</span>
            </Link>
            <Link
              href="/lab"
              className="p-4 bg-scale-blue-dark border-[3px] border-scale-blue-light rounded-arcade hover:border-venom-orange hover:scale-[1.02] active:scale-[0.98] transition-all text-center group"
            >
              <span className="block text-2xl mb-2">🧬</span>
              <span className="font-body text-beige group-hover:text-bone-white transition-colors">Breeding Lab</span>
            </Link>
            <Link
              href="/shop"
              className="p-4 bg-scale-blue-dark border-[3px] border-scale-blue-light rounded-arcade hover:border-venom-orange hover:scale-[1.02] active:scale-[0.98] transition-all text-center group"
            >
              <span className="block text-2xl mb-2">🛒</span>
              <span className="font-body text-beige group-hover:text-bone-white transition-colors">Shop</span>
            </Link>
            <Link
              href="/settings/privacy"
              className="p-4 bg-scale-blue-dark border-[3px] border-scale-blue-light rounded-arcade hover:border-venom-orange hover:scale-[1.02] active:scale-[0.98] transition-all text-center group"
            >
              <span className="block text-2xl mb-2">🔒</span>
              <span className="font-body text-beige group-hover:text-bone-white transition-colors">Privacy</span>
            </Link>
          </div>
        </div>

        {/* Sign Out */}
        <div className="text-center">
          <button
            onClick={() => signOut()}
            className="px-8 py-3 bg-strike-red/20 border-[3px] border-strike-red rounded-arcade font-display uppercase tracking-arcade text-strike-red hover:bg-strike-red hover:text-bone-white hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

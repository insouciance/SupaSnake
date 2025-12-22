'use client';

/**
 * CareerStats Component
 * Displays player career statistics on the profile/settings page
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { CareerStats as CareerStatsType } from '@/app/api/player/stats/route';

interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
}

function StatCard({ icon, label, value, subValue, color = 'text-white' }: StatCardProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 flex flex-col items-center">
      <span className="text-3xl mb-2">{icon}</span>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      <span className="text-gray-400 text-sm">{label}</span>
      {subValue && (
        <span className="text-gray-500 text-xs mt-1">{subValue}</span>
      )}
    </div>
  );
}

export function CareerStats() {
  const { getToken } = useAuth();
  const [stats, setStats] = useState<CareerStatsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const token = await getToken();
        if (!token) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        const response = await fetch('/api/player/stats', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }

        const data = await response.json();
        setStats(data);
      } catch (err) {
        setError('Failed to load career stats');
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [getToken]);

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-xl p-6">
        <h2 className="text-xl font-bold mb-4">Career Stats</h2>
        <div className="text-center text-gray-500 py-8">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-900 rounded-xl p-6">
        <h2 className="text-xl font-bold mb-4">Career Stats</h2>
        <div className="text-center text-red-400 py-8">{error}</div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const collectionPercent = Math.round((stats.collectionCount / stats.totalVariants) * 100);
  const achievementPercent = Math.round((stats.achievementsCompleted / stats.totalAchievements) * 100);

  return (
    <div className="bg-gray-900 rounded-xl p-6">
      <h2 className="text-xl font-bold mb-4">Career Stats</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          icon="🏆"
          label="High Score"
          value={stats.highScore}
          color="text-yellow-400"
        />
        <StatCard
          icon="🎮"
          label="Games Played"
          value={stats.totalGamesPlayed}
        />
        <StatCard
          icon="🧬"
          label="DNA Earned"
          value={stats.totalDnaEarned.toLocaleString()}
          color="text-green-400"
        />
        <StatCard
          icon="📦"
          label="Collection"
          value={`${stats.collectionCount}/${stats.totalVariants}`}
          subValue={`${collectionPercent}% complete`}
          color="text-blue-400"
        />
        <StatCard
          icon="🔥"
          label="Current Streak"
          value={`${stats.currentStreak} days`}
          subValue={`Best: ${stats.longestStreak} days`}
          color="text-orange-400"
        />
        <StatCard
          icon="⭐"
          label="Achievements"
          value={`${stats.achievementsCompleted}/${stats.totalAchievements}`}
          subValue={`${achievementPercent}% unlocked`}
          color="text-purple-400"
        />
      </div>

      {/* Breeding stats */}
      <div className="mt-4 pt-4 border-t border-gray-800">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Snakes Bred</span>
          <span className="text-white font-medium">{stats.breedsCompleted}</span>
        </div>
      </div>
    </div>
  );
}

export default CareerStats;

'use client';

/**
 * CareerStats - career statistics on the profile page, in the arcade
 * design system (Identity v1: the legacy gray panel retired; the full
 * Chronicle arrives in I2 - this stays a minimal stat grid).
 */

import { useState, useEffect } from 'react';
import type { ReactElement } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { CareerStats as CareerStatsType } from '@/app/api/player/stats/route';
import {
  IconDna,
  IconEgg,
  IconFlame,
  IconPlay,
  IconSnake,
  IconTrophy,
} from '@/components/ui/icons';

interface StatCardProps {
  icon: ReactElement;
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
}

function StatCard({ icon, label, value, subValue, color = 'text-bone-white' }: StatCardProps) {
  return (
    <div className="panel p-4 flex flex-col items-center text-center gap-1">
      <span className={color}>{icon}</span>
      <span className={`font-display text-2xl ${color}`}>{value}</span>
      <span className="label-arcade">{label}</span>
      {subValue && (
        <span className="text-beige/50 text-xs font-body">{subValue}</span>
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
          cache: 'no-store',
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
      <div className="panel-elevated p-6">
        <h2 className="heading-display text-xl text-bone-white mb-4">Career Stats</h2>
        <div className="text-center text-beige/50 font-body py-8">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel-elevated p-6">
        <h2 className="heading-display text-xl text-bone-white mb-4">Career Stats</h2>
        <div className="text-center text-strike-red font-body py-8">{error}</div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const collectionPercent = Math.round((stats.collectionCount / stats.totalVariants) * 100);

  return (
    <div className="panel-elevated p-6 animate-fade-up">
      <h2 className="heading-display text-xl text-bone-white mb-4">Career Stats</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          icon={<IconTrophy size={26} />}
          label="High Score"
          value={stats.highScore.toLocaleString()}
          color="text-rarity-legendary"
        />
        <StatCard
          icon={<IconPlay size={26} />}
          label="Games Played"
          value={stats.totalGamesPlayed.toLocaleString()}
        />
        <StatCard
          icon={<IconDna size={26} />}
          label="DNA Earned"
          value={stats.totalDnaEarned.toLocaleString()}
          color="text-venom-orange"
        />
        <StatCard
          icon={<IconSnake size={26} />}
          label="Collection"
          value={`${stats.collectionCount}/${stats.totalVariants}`}
          subValue={`${collectionPercent}% complete`}
          color="text-rarity-rare"
        />
        <StatCard
          icon={<IconFlame size={26} />}
          label="Current Streak"
          value={`${stats.currentStreak} days`}
          subValue={`Best: ${stats.longestStreak} days`}
          color="text-venom-orange"
        />
        {/* WP-0.04: the Achievements tile is gone with the mechanism it
            counted. Banked progression is read from the Records cabinet on
            the Chronicle, which is now the only place it is displayed. */}
      </div>

      {/* Breeding stats */}
      <div className="mt-4 pt-4 border-t border-scale-blue-light/40">
        <div className="flex justify-between items-center text-sm font-body">
          <span className="text-beige/70 inline-flex items-center gap-1.5">
            <IconEgg size={15} />
            Snakes Bred
          </span>
          <span className="text-bone-white font-display">{stats.breedsCompleted}</span>
        </div>
      </div>
    </div>
  );
}

export default CareerStats;

'use client';

/**
 * AchievementBadges Component
 * Displays player achievements with progress indicators
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: number;
  progress: number;
  requirement_value: number;
  completed: boolean;
  reward_claimed: boolean;
  reward_dna?: number;
  reward_energy?: number;
}

interface AchievementBadgesProps {
  showAll?: boolean;
  maxDisplay?: number;
}

const TIER_COLORS = {
  1: { bg: 'bg-green-600', border: 'border-green-500', text: 'text-green-400' },
  2: { bg: 'bg-blue-600', border: 'border-blue-500', text: 'text-blue-400' },
  3: { bg: 'bg-purple-600', border: 'border-purple-500', text: 'text-purple-400' },
};

const ICON_MAP: Record<string, string> = {
  game: '🎮',
  dna: '🧬',
  breed: '🥚',
  collection: '📦',
  score: '🏆',
  streak: '🔥',
};

function AchievementBadge({ achievement }: { achievement: Achievement }) {
  const tierStyle = TIER_COLORS[achievement.tier as keyof typeof TIER_COLORS] || TIER_COLORS[1];
  const icon = ICON_MAP[achievement.icon] || '⭐';
  const progressPercent = Math.min(100, Math.round((achievement.progress / achievement.requirement_value) * 100));

  return (
    <div
      className={`relative rounded-lg p-3 border-2 ${
        achievement.completed
          ? `${tierStyle.bg}/20 ${tierStyle.border}`
          : 'bg-gray-800/50 border-gray-700'
      }`}
    >
      {/* Badge content */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-medium truncate ${achievement.completed ? tierStyle.text : 'text-gray-400'}`}>
              {achievement.name}
            </span>
            {achievement.completed && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
                Tier {achievement.tier}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">{achievement.description}</p>
        </div>
      </div>

      {/* Progress bar for incomplete achievements */}
      {!achievement.completed && (
        <div className="mt-2">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{achievement.progress}/{achievement.requirement_value}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-500 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Completion checkmark */}
      {achievement.completed && (
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-xs">
          ✓
        </div>
      )}
    </div>
  );
}

export function AchievementBadges({ showAll = true, maxDisplay = 12 }: AchievementBadgesProps) {
  const { getToken } = useAuth();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAchievements() {
      try {
        const token = await getToken();
        if (!token) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        const response = await fetch('/api/achievements', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch achievements');
        }

        const data = await response.json();
        setAchievements(data.achievements || []);
      } catch (err) {
        setError('Failed to load achievements');
      } finally {
        setLoading(false);
      }
    }

    fetchAchievements();
  }, [getToken]);

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-xl p-6">
        <h2 className="text-xl font-bold mb-4">Achievements</h2>
        <div className="text-center text-gray-500 py-8">Loading achievements...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-900 rounded-xl p-6">
        <h2 className="text-xl font-bold mb-4">Achievements</h2>
        <div className="text-center text-red-400 py-8">{error}</div>
      </div>
    );
  }

  // Filter and sort achievements
  const filtered = showAll
    ? achievements
    : achievements.filter(a => a.completed);

  const sorted = [...filtered].sort((a, b) => {
    // Completed first, then by tier (higher first), then by progress %
    if (a.completed !== b.completed) return a.completed ? -1 : 1;
    if (a.tier !== b.tier) return b.tier - a.tier;
    const aProgress = a.progress / a.requirement_value;
    const bProgress = b.progress / b.requirement_value;
    return bProgress - aProgress;
  });

  const displayed = sorted.slice(0, maxDisplay);
  const remaining = sorted.length - maxDisplay;

  const completedCount = achievements.filter(a => a.completed).length;

  return (
    <div className="bg-gray-900 rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Achievements</h2>
        <span className="text-sm text-gray-400">
          {completedCount}/{achievements.length} unlocked
        </span>
      </div>

      {displayed.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          No achievements yet. Keep playing to unlock badges!
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {displayed.map((achievement) => (
              <AchievementBadge key={achievement.id} achievement={achievement} />
            ))}
          </div>

          {remaining > 0 && (
            <div className="text-center text-gray-500 mt-4 text-sm">
              +{remaining} more achievements
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AchievementBadges;

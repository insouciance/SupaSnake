'use client';

/**
 * Lab Analytics - the SupaSnake Premium stats dashboard.
 *
 * Server-gated: /api/premium/stats returns 403 premium_required for free
 * accounts, and this page renders a locked preview with a shop link
 * instead. Premium players get overall totals, extraction efficiency and
 * per-dynasty performance over their recent earned runs.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { NavBar } from '@/components/ui/NavBar';
import { IconCrown, IconDna, IconLock, IconTrophy } from '@/components/ui/icons';
import type { DynastyStats, OverallStats } from '@/app/api/premium/stats/utils';

interface StatsPayload {
  sampleSize: number;
  overall: OverallStats;
  dynasties: DynastyStats[];
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4 text-center">
      <p className="text-2xl font-display text-venom-orange">{value}</p>
      <p className="text-beige/70 text-xs font-body uppercase tracking-wide">{label}</p>
    </div>
  );
}

export default function StatsPage() {
  const { session, isAuthenticated } = useAuth();
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/premium/stats', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json();
      if (response.status === 403 && data.error === 'premium_required') {
        setLocked(true);
        return;
      }
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load stats');
      }
      setLocked(false);
      setStats(data as StatsPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (isAuthenticated && session?.access_token) {
      fetchStats();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, session?.access_token, fetchStats]);

  return (
    <div className="app-bg text-bone-white px-4 sm:px-6 pt-8 pb-28 sm:pb-6 sm:pr-16">
      <NavBar />

      <div className="max-w-4xl mx-auto">
        <div className="mb-8 animate-fade-up">
          <h1 className="heading-display text-4xl text-venom-orange text-glow-orange flex items-center gap-3">
            <IconTrophy size={32} />
            Lab Analytics
          </h1>
          <p className="text-beige font-body">
            Extraction efficiency, dynasty performance and personal bests
          </p>
        </div>

        {!isAuthenticated ? (
          <div className="panel-elevated p-8 text-center animate-pop-in">
            <p className="text-beige font-body mb-4">Sign in to view your analytics</p>
            <Link href="/login" className="btn-go inline-block px-8 py-3 min-h-[44px]">
              Sign In
            </Link>
          </div>
        ) : loading ? (
          <div className="panel p-8 text-center text-beige/60 font-body">Loading…</div>
        ) : locked ? (
          /* Free-account preview: what Premium unlocks, no data shown */
          <div
            className="panel-glow [--glow:#fbbf24] p-8 text-center animate-pop-in"
            data-testid="stats-locked"
          >
            <IconLock size={40} className="mx-auto mb-4 text-amber-300" />
            <h2 className="heading-display text-2xl text-bone-white mb-2">
              A Premium perk
            </h2>
            <p className="text-beige font-body mb-6 max-w-md mx-auto">
              Lab Analytics breaks down your bank rate, per-dynasty
              performance, DNA income and personal bests across every earned
              run. Included with SupaSnake Premium.
            </p>
            <Link
              href="/shop"
              className="btn-go inline-flex items-center gap-2 px-8 py-3 min-h-[44px]"
              data-testid="stats-upsell"
            >
              <IconCrown size={16} />
              Learn about Premium
            </Link>
          </div>
        ) : error ? (
          <div className="bg-strike-red/15 border border-strike-red/70 rounded-arcade p-4 animate-fade-up">
            <p className="text-strike-red font-body">{error}</p>
          </div>
        ) : stats ? (
          <div className="space-y-8 animate-fade-up" data-testid="stats-dashboard">
            {/* Overall */}
            <section>
              <h2 className="heading-display text-2xl text-bone-white mb-4">Overall</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatTile label="Earned runs" value={String(stats.overall.games)} />
                <StatTile
                  label="Bank rate"
                  value={`${Math.round(stats.overall.bankRate * 100)}%`}
                />
                <StatTile label="Best score" value={String(stats.overall.bestScore)} />
                <StatTile
                  label="Best foods (run)"
                  value={String(stats.overall.bestFoods)}
                />
                <StatTile
                  label="Total DNA earned"
                  value={stats.overall.totalDna.toLocaleString()}
                />
                <StatTile
                  label="Total foods"
                  value={stats.overall.totalFoods.toLocaleString()}
                />
                <StatTile
                  label="Avg run length"
                  value={`${Math.floor(stats.overall.avgDurationSeconds / 60)}m ${
                    stats.overall.avgDurationSeconds % 60
                  }s`}
                />
                <StatTile label="Runs banked" value={String(stats.overall.banked)} />
              </div>
            </section>

            {/* Per dynasty */}
            <section>
              <h2 className="heading-display text-2xl text-bone-white mb-4">
                By Dynasty
              </h2>
              {stats.dynasties.length === 0 ? (
                <p className="text-beige/60 font-body">
                  Play some earned runs to see your dynasty breakdown.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {stats.dynasties.map((d) => (
                    <div
                      key={d.dynasty}
                      className="panel-elevated p-5"
                      data-testid={`stats-dynasty-${d.dynasty}`}
                    >
                      <h3 className="heading-display text-lg text-venom-orange mb-3">
                        {d.dynasty}
                      </h3>
                      <dl className="space-y-1.5 text-sm font-body">
                        <div className="flex justify-between">
                          <dt className="text-beige/70">Runs</dt>
                          <dd className="text-bone-white">{d.games}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-beige/70">Bank rate</dt>
                          <dd className="text-bone-white">
                            {Math.round(d.bankRate * 100)}%
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-beige/70">Best score</dt>
                          <dd className="text-bone-white">{d.bestScore}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-beige/70">Avg foods</dt>
                          <dd className="text-bone-white">{d.avgFoods}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-beige/70 flex items-center gap-1">
                            <IconDna size={12} /> DNA
                          </dt>
                          <dd className="text-bone-white">
                            {d.totalDna.toLocaleString()}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <p className="text-beige/50 text-xs font-body">
              Based on your {stats.sampleSize} most recent earned runs. Free
              Play runs are not counted.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

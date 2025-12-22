'use client';

/**
 * Clan Page
 * Per SO-001: 40% DAU target in clans
 * Per SO-002: No daily requirements
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { type Clan, CLAN_LIMITS, CLAN_BONUS_CONFIG } from '@/lib/clan/types';
import { NavBar } from '@/components/ui/NavBar';
import Link from 'next/link';

interface MyClan extends Clan {
  role: string;
  joinedAt: string;
}

export default function ClanPage() {
  const { user, session, isAuthenticated } = useAuth();
  const [myClan, setMyClan] = useState<MyClan | null>(null);
  const [clans, setClans] = useState<Clan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchData();
    }
  }, [isAuthenticated, user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch my clan
      if (user) {
        const myResponse = await fetch(`/api/clan?playerId=${user.id}`);
        const myData = await myResponse.json();
        if (myData.clan) {
          setMyClan({
            ...myData.clan,
            role: myData.membership.role,
            joinedAt: myData.membership.joinedAt,
          });
        }
      }

      // Fetch all clans
      const response = await fetch('/api/clan');
      const data = await response.json();
      setClans(data.clans || []);
    } catch (error) {
      console.error('Failed to fetch clan data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const response = await fetch('/api/clan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action: 'create',
          name,
          tag,
          description,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error);
        return;
      }

      setSuccess('Clan created!');
      setShowCreate(false);
      fetchData();
    } catch (err) {
      setError('Failed to create clan');
    }
  };

  const handleJoin = async (clanId: string) => {
    setError(null);

    try {
      const response = await fetch('/api/clan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action: 'join',
          clanId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error);
        return;
      }

      setSuccess('Joined clan!');
      fetchData();
    } catch (err) {
      setError('Failed to join clan');
    }
  };

  const handleLeave = async () => {
    if (!confirm('Are you sure you want to leave your clan?')) return;

    setError(null);

    try {
      const response = await fetch('/api/clan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'leave' }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error);
        return;
      }

      setSuccess('Left clan');
      setMyClan(null);
      fetchData();
    } catch (err) {
      setError('Failed to leave clan');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-scale-blue-dark text-bone-white">
        <NavBar />
        <div className="flex items-center justify-center min-h-screen pt-16">
          <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-8 text-center space-y-6">
            <h1 className="text-4xl font-display uppercase tracking-arcade text-venom-orange">Clans</h1>
            <p className="text-beige font-body">Sign in to join a clan</p>
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
            <h1 className="text-4xl font-display uppercase tracking-arcade text-venom-orange">Clans</h1>
            <p className="text-beige font-body mt-1">Join forces with other players</p>
          </div>
          <Link
            href="/game"
            className="px-6 py-3 bg-venom-orange border-[3px] border-venom-orange-dark rounded-arcade font-display uppercase tracking-arcade text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            Play
          </Link>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-strike-red/20 border-[3px] border-strike-red rounded-arcade p-4 mb-6">
            <p className="text-strike-red font-body">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-500/20 border-[3px] border-green-500 rounded-arcade p-4 mb-6">
            <p className="text-green-400 font-body">{success}</p>
          </div>
        )}

        {/* My Clan Section */}
        {myClan ? (
          <section className="mb-10">
            <h2 className="text-2xl font-display uppercase tracking-arcade text-bone-white mb-4">My Clan</h2>
            <div className="bg-scale-blue border-[3px] border-purple-500 rounded-arcade p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-display uppercase tracking-arcade text-bone-white">{myClan.name}</span>
                    <span className="px-3 py-1 bg-purple-500/30 border-[2px] border-purple-500 rounded-arcade text-sm font-display">
                      [{myClan.tag}]
                    </span>
                  </div>
                  <p className="text-beige text-sm font-body mt-1">{myClan.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-beige font-body">Role</p>
                  <p className="font-display uppercase text-bone-white">{myClan.role}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-scale-blue-dark border-[2px] border-scale-blue-light rounded-arcade p-3 text-center">
                  <p className="text-xs text-beige font-body">Members</p>
                  <p className="text-xl font-display text-bone-white">{myClan.memberCount}/{myClan.maxMembers}</p>
                </div>
                <div className="bg-scale-blue-dark border-[2px] border-scale-blue-light rounded-arcade p-3 text-center">
                  <p className="text-xs text-beige font-body">Weekly Score</p>
                  <p className="text-xl font-display text-bone-white">{myClan.weeklyScore?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-scale-blue-dark border-[2px] border-scale-blue-light rounded-arcade p-3 text-center">
                  <p className="text-xs text-beige font-body">Total Score</p>
                  <p className="text-xl font-display text-bone-white">{myClan.totalScore?.toLocaleString() || 0}</p>
                </div>
              </div>

              {/* Clan Bonus */}
              <div className="bg-venom-orange/20 border-[3px] border-venom-orange rounded-arcade p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-venom-orange font-display uppercase">Clan Energy Bonus</p>
                    <p className="text-sm text-beige font-body">
                      +{CLAN_BONUS_CONFIG.energyBonusAmount} energy every {CLAN_BONUS_CONFIG.energyBonusIntervalHours} hours
                    </p>
                  </div>
                  <button className="px-6 py-2 bg-venom-orange border-[3px] border-venom-orange-dark rounded-arcade font-display uppercase tracking-arcade text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98] transition-all">
                    Claim
                  </button>
                </div>
              </div>

              {myClan.role !== 'owner' && (
                <button
                  onClick={handleLeave}
                  className="text-strike-red hover:text-bone-white text-sm font-body transition-colors"
                >
                  Leave Clan
                </button>
              )}
            </div>
          </section>
        ) : (
          <>
            {/* Create Clan Section */}
            <section className="mb-10">
              {showCreate ? (
                <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
                  <h2 className="text-2xl font-display uppercase tracking-arcade text-bone-white mb-4">Create Clan</h2>
                  <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                      <label className="block text-sm text-beige font-body mb-1">Clan Name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Elite Snakes"
                        className="w-full px-4 py-2 bg-scale-blue-dark border-[2px] border-scale-blue-light rounded-arcade text-bone-white font-body placeholder:text-beige/50 focus:border-venom-orange focus:outline-none transition-colors"
                        minLength={CLAN_LIMITS.minNameLength}
                        maxLength={CLAN_LIMITS.maxNameLength}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-beige font-body mb-1">Tag (2-6 characters)</label>
                      <input
                        type="text"
                        value={tag}
                        onChange={(e) => setTag(e.target.value.toUpperCase())}
                        placeholder="ELIT"
                        className="w-full px-4 py-2 bg-scale-blue-dark border-[2px] border-scale-blue-light rounded-arcade text-bone-white font-display uppercase placeholder:text-beige/50 focus:border-venom-orange focus:outline-none transition-colors"
                        minLength={CLAN_LIMITS.minTagLength}
                        maxLength={CLAN_LIMITS.maxTagLength}
                        pattern="[A-Z0-9]+"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-beige font-body mb-1">Description</label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Tell others about your clan..."
                        className="w-full px-4 py-2 bg-scale-blue-dark border-[2px] border-scale-blue-light rounded-arcade text-bone-white font-body placeholder:text-beige/50 focus:border-venom-orange focus:outline-none transition-colors"
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-4">
                      <button
                        type="submit"
                        className="px-6 py-2 bg-venom-orange border-[3px] border-venom-orange-dark rounded-arcade font-display uppercase tracking-arcade text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98] transition-all"
                      >
                        Create Clan
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreate(false)}
                        className="px-6 py-2 bg-scale-blue-light border-[3px] border-scale-blue-light rounded-arcade font-display uppercase tracking-arcade text-beige hover:text-bone-white hover:scale-[1.02] active:scale-[0.98] transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreate(true)}
                  className="px-8 py-3 bg-purple-600 border-[3px] border-purple-400 rounded-arcade font-display uppercase tracking-arcade text-bone-white hover:bg-purple-500 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Create New Clan
                </button>
              )}
            </section>

            {/* Browse Clans */}
            <section>
              <h2 className="text-2xl font-display uppercase tracking-arcade text-bone-white mb-4">Browse Clans</h2>
              {loading ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 border-4 border-venom-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-beige font-body">Loading clans...</p>
                </div>
              ) : clans.length === 0 ? (
                <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-8 text-center">
                  <p className="text-beige font-body">No clans yet. Be the first to create one!</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {clans.map((clan) => (
                    <div
                      key={clan.id}
                      className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-4 flex items-center justify-between hover:border-venom-orange transition-all"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display uppercase text-lg text-bone-white">{clan.name}</span>
                          <span className="px-2 py-0.5 bg-scale-blue-dark border border-scale-blue-light rounded-arcade text-xs font-display">
                            [{clan.tag}]
                          </span>
                        </div>
                        <p className="text-sm text-beige font-body">{clan.description}</p>
                        <p className="text-xs text-beige/60 font-body mt-1">
                          {clan.memberCount}/{clan.maxMembers} members
                        </p>
                      </div>
                      <button
                        onClick={() => handleJoin(clan.id)}
                        disabled={clan.memberCount >= clan.maxMembers}
                        className={`px-6 py-2 rounded-arcade border-[3px] font-display uppercase tracking-arcade transition-all ${
                          clan.memberCount >= clan.maxMembers
                            ? 'bg-scale-blue-light border-scale-blue-light text-beige cursor-not-allowed'
                            : 'bg-venom-orange border-venom-orange-dark text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                      >
                        {clan.memberCount >= clan.maxMembers ? 'Full' : 'Join'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* Info */}
        <div className="text-center text-beige/40 text-xs font-body mt-10 space-y-1">
          <p>Clan members receive +{CLAN_BONUS_CONFIG.energyBonusAmount} energy every {CLAN_BONUS_CONFIG.energyBonusIntervalHours} hours.</p>
          <p>No daily requirements - contribute when convenient!</p>
        </div>
      </div>
    </div>
  );
}

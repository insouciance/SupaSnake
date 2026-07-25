'use client';

/**
 * Clan Page
 * Per SO-001: 40% DAU target in clans
 * Per SO-002: No daily requirements
 */

import { useState, useEffect, useCallback } from 'react';
import { redirect } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { type Clan, CLAN_LIMITS } from '@/lib/clan/types';
import { GAME_CONFIG } from '@/shared/config/game';
import { NavBar } from '@/components/ui/NavBar';
import { DuelPanel } from '@/components/clan/DuelPanel';
import { GauntletPanel } from '@/components/clan/GauntletPanel';
import { PlayoffBracket } from '@/components/clan/PlayoffBracket';
import { ClanIdentityEditor } from '@/components/clan/ClanIdentityEditor';
import { ClanRoster, InviteInbox } from '@/components/clan/ClanRoster';
import { ClanDiscordPanel } from '@/components/clan/ClanDiscordPanel';
import { useClanFull } from '@/components/clan/useClanFull';
import Link from 'next/link';
import { IconShield, IconUser } from '@/components/ui/icons';

interface MyClan extends Clan {
  role: string;
  joinedAt: string;
}

export default function ClanPage() {
  if (!GAME_CONFIG.features.clans) {
    redirect('/');
  }

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

  // Identity v1 I3: the full clan surface (identity, roster, invites,
  // discord) in one authed read - shared by the new panels below
  const { view: fullView, refresh: refreshFullView } = useClanFull(
    session?.access_token
  );

  const fetchData = useCallback(async () => {
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
  }, [user]);

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchData();
    }
  }, [isAuthenticated, user, fetchData]);

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
      <div className="app-bg text-bone-white">
        <NavBar />
        <div className="flex items-center justify-center min-h-screen px-4">
          <div className="panel-elevated p-8 text-center space-y-6 w-full max-w-sm animate-pop-in">
            <h1 className="heading-display text-4xl text-venom-orange text-glow-orange">Clans</h1>
            <p className="text-beige font-body">Sign in to join a clan</p>
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
              <IconShield size={34} />
              Clans
            </h1>
            <p className="text-beige font-body mt-1">Join forces with other players</p>
          </div>
          <Link
            href="/game"
            className="btn-go self-start px-6 py-3 min-h-[44px] inline-flex items-center"
          >
            Play
          </Link>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-strike-red/15 border border-strike-red/70 rounded-arcade p-4 mb-6 animate-fade-up">
            <p className="text-strike-red font-body">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-rarity-uncommon/10 border border-rarity-uncommon/70 rounded-arcade p-4 mb-6 animate-fade-up">
            <p className="text-rarity-uncommon font-body">{success}</p>
          </div>
        )}

        {/* My Clan Section */}
        {myClan ? (
          <>
          {/* This Week's Duel - weekly head-to-head clan competition */}
          <DuelPanel accessToken={session?.access_token} />

          {/* Clan Gauntlet - picks, scouting + research (hidden pre-020) */}
          <GauntletPanel accessToken={session?.access_token} />

          {/* Season playoffs (§8.4): top-8 bracket in the final 2 weeks +
              champions banner history (hidden pre-021 / off-season) */}
          <div className="mb-10 animate-fade-up">
            <PlayoffBracket accessToken={session?.access_token} />
          </div>

          <section className="mb-10 animate-fade-up">
            <h2 className="heading-display text-2xl text-bone-white mb-4">My Clan</h2>
            <div className="panel-glow [--glow:#a855f7] p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <IconShield size={26} className="text-cosmic" />
                    <span className="heading-display text-3xl text-bone-white">{myClan.name}</span>
                    <span className="px-3 py-1 bg-cosmic/20 border border-cosmic/70 rounded-arcade text-sm font-display text-cosmic-glow">
                      [{myClan.tag}]
                    </span>
                  </div>
                  <p className="text-beige text-sm font-body mt-1">{myClan.description}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="label-arcade">Role</p>
                  <p className="font-display uppercase text-bone-white">{myClan.role}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
                <div className="bg-void/60 border border-scale-blue-light/50 rounded-arcade p-3 text-center">
                  <p className="label-arcade flex items-center justify-center gap-1">
                    <IconUser size={12} />
                    Members
                  </p>
                  <p className="text-xl font-display text-bone-white">{myClan.memberCount}/{myClan.maxMembers}</p>
                </div>
                <div className="bg-void/60 border border-scale-blue-light/50 rounded-arcade p-3 text-center">
                  <p className="label-arcade">Weekly Score</p>
                  <p className="text-xl font-display text-bone-white">{myClan.weeklyScore?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-void/60 border border-scale-blue-light/50 rounded-arcade p-3 text-center">
                  <p className="label-arcade">Total Score</p>
                  <p className="text-xl font-display text-bone-white">{myClan.totalScore?.toLocaleString() || 0}</p>
                </div>
              </div>

              {/* The "Clan Energy Bonus" panel stood here: a promise of
                  +1 energy every 6 hours next to a Claim button that had
                  no onClick and never had one. WP-0.03 removed the whole
                  panel with the faucet behind it. A clan pays nobody
                  (Rule 8), and there is no energy balance to pay into
                  (§8.6). What a clan gives is the Serpent hunt, which
                  WP-1.07 renders in this space. */}

              {myClan.role !== 'owner' && (
                <button
                  onClick={handleLeave}
                  className="text-strike-red hover:text-bone-white text-sm font-body transition-colors min-h-[44px]"
                >
                  Leave Clan
                </button>
              )}
            </div>
          </section>

          {/* Identity v1 I3 (section 8): heraldry editor, roster of
              PlayerCards, Discord home - all off the one full-view read */}
          {fullView?.clan && (
            <>
              <ClanIdentityEditor
                accessToken={session?.access_token}
                view={fullView}
                onSaved={refreshFullView}
              />
              <ClanDiscordPanel
                accessToken={session?.access_token}
                view={fullView}
                onChanged={refreshFullView}
              />
              <ClanRoster
                accessToken={session?.access_token}
                view={fullView}
                onChanged={refreshFullView}
              />
            </>
          )}
          </>
        ) : (
          <>
            {/* Invite inbox (section 8.2): pending invites, accept/decline */}
            {fullView && (
              <InviteInbox
                accessToken={session?.access_token}
                view={fullView}
                onChanged={() => {
                  refreshFullView();
                  fetchData();
                }}
              />
            )}

            {/* Create Clan Section */}
            <section className="mb-10 animate-fade-up">
              {showCreate ? (
                <div className="panel-elevated p-6 animate-pop-in">
                  <h2 className="heading-display text-2xl text-bone-white mb-4">Create Clan</h2>
                  <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                      <label className="block text-sm text-beige font-body mb-1">Clan Name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Elite Snakes"
                        className="w-full px-4 py-2 bg-void/60 border border-scale-blue-light/60 rounded-arcade text-bone-white font-body placeholder:text-beige/50 focus:border-venom-orange focus:outline-none transition-colors"
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
                        className="w-full px-4 py-2 bg-void/60 border border-scale-blue-light/60 rounded-arcade text-bone-white font-display uppercase placeholder:text-beige/50 focus:border-venom-orange focus:outline-none transition-colors"
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
                        className="w-full px-4 py-2 bg-void/60 border border-scale-blue-light/60 rounded-arcade text-bone-white font-body placeholder:text-beige/50 focus:border-venom-orange focus:outline-none transition-colors"
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-4">
                      <button
                        type="submit"
                        className="btn-go px-6 py-2 min-h-[44px]"
                      >
                        Create Clan
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreate(false)}
                        className="btn-neutral px-6 py-2 min-h-[44px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreate(true)}
                  className="btn-go inline-flex items-center gap-2 px-8 py-3 min-h-[44px]"
                >
                  <IconShield size={18} />
                  Create New Clan
                </button>
              )}
            </section>

            {/* Browse Clans */}
            <section className="animate-fade-up">
              <h2 className="heading-display text-2xl text-bone-white mb-4">Browse Clans</h2>
              {loading ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 border-4 border-venom-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-beige font-body">Loading clans...</p>
                </div>
              ) : clans.length === 0 ? (
                <div className="panel p-8 text-center">
                  <p className="text-beige font-body">No clans yet. Be the first to create one!</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {clans.map((clan) => (
                    <div
                      key={clan.id}
                      className="panel p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-venom-orange/70 transition-all"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <IconShield size={16} className="text-beige/70" />
                          <span className="font-display uppercase text-lg text-bone-white">{clan.name}</span>
                          <span className="px-2 py-0.5 bg-void/60 border border-scale-blue-light/60 rounded-arcade text-xs font-display">
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
                        className={`px-6 py-2 min-h-[44px] self-start sm:self-center ${
                          clan.memberCount >= clan.maxMembers
                            ? 'btn-neutral opacity-50 cursor-not-allowed'
                            : 'btn-go'
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
          <p>No daily requirements - contribute when convenient!</p>
        </div>
      </div>
    </div>
  );
}

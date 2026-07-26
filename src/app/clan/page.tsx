'use client';

/**
 * The clan page (Constitution §9.1–9.4).
 *
 * "A clan is a witness, not an institution." Three states:
 *
 *   no clan   — found one (name + preset heraldry, one tap plus a name), or
 *               paste an invite code. Below them, the directory of clans that
 *               hunted this week or last: short and alive, never long and
 *               dead, and never showing how many clans exist in total (§9.2).
 *   in a clan — the hunt (self-referential primary, optional rival layer),
 *               heraldry, the roster, the invite link.
 *   gated     — the Gauntlet, the duel surface and the playoff bracket render
 *               only when their population flags are on (§9.3, §12.1 slot 7).
 *               Off is the default and hides them without deleting a row.
 *
 * WHAT IS NOT ON THIS PAGE ANY MORE
 *
 *   The "Weekly Score" and "Total Score" tiles. §12.2 caps public numbers at
 *   two — Score and Depth — and a third clan number that ranked clans against
 *   each other was over the cap; the columns behind the tiles are dropped in
 *   migration 048. What stands in their place is the clan's Depth: its best
 *   week, and this week against it.
 *
 *   The promote/demote controls and the officer invite console. Rule 8, and
 *   this work package's acceptance criterion.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { redirect } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { type Clan, CLAN_LIMITS } from '@/lib/clan/types';
import { CLAN_GAUNTLET_ENABLED, CLAN_PLAYOFFS_ENABLED } from '@/lib/clan/config';
import { CLAN_BANNERS, CLAN_EMBLEMS } from '@/lib/clan/heraldry';
import { GAME_CONFIG } from '@/shared/config/game';
import { NavBar } from '@/components/ui/NavBar';
import { DuelPanel } from '@/components/clan/DuelPanel';
import { GauntletPanel } from '@/components/clan/GauntletPanel';
import { PlayoffBracket } from '@/components/clan/PlayoffBracket';
import { ClanIdentityEditor } from '@/components/clan/ClanIdentityEditor';
import { ClanRoster, InviteInbox } from '@/components/clan/ClanRoster';
import { ClanDiscordPanel } from '@/components/clan/ClanDiscordPanel';
import { ClanHuntPanel } from '@/components/clan/ClanHuntPanel';
import { ClanFoundingPrompt } from '@/components/clan/ClanFoundingPrompt';
import { useClanFull, clanAction } from '@/components/clan/useClanFull';
import Link from 'next/link';
import { IconShield, IconUser } from '@/components/ui/icons';

interface MyClan extends Clan {
  role: string;
  joinedAt: string;
}

interface DirectoryClan {
  id: string;
  name: string;
  tag: string | null;
  memberCount: number;
  maxMembers: number;
  bestWeekDepth: number;
  lastHuntedWeek: string | null;
}

export default function ClanPage() {
  if (!GAME_CONFIG.features.clans) {
    redirect('/');
  }

  const { user, session, isAuthenticated } = useAuth();
  const [myClan, setMyClan] = useState<MyClan | null>(null);
  const [directory, setDirectory] = useState<DirectoryClan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFound, setShowFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Founding: a name, and a preset heraldry pick. Nothing else is required.
  const [name, setName] = useState('');
  const [bannerId, setBannerId] = useState<string>(CLAN_BANNERS[0].id);
  const [emblemId, setEmblemId] = useState<string>(CLAN_EMBLEMS[0].id);
  const [joinCode, setJoinCode] = useState('');
  const joinCodeInput = useRef<HTMLInputElement | null>(null);

  const { view: fullView, refresh: refreshFullView } = useClanFull(
    session?.access_token
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (user) {
        const myResponse = await fetch(`/api/clan?playerId=${user.id}`);
        const myData = await myResponse.json();
        if (myData.clan) {
          setMyClan({
            ...myData.clan,
            role: myData.membership.role,
            joinedAt: myData.membership.joinedAt,
          });
        } else {
          setMyClan(null);
        }
      }

      // The directory: alive clans only, and no total (§9.2).
      const response = await fetch('/api/clan?view=directory');
      const data = await response.json();
      setDirectory(data.clans || []);
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

  const handleFound = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await clanAction(session?.access_token, {
      action: 'found',
      name,
      bannerId,
      emblemId,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed to found clan');
      return;
    }
    setSuccess('Your clan stands.');
    setShowFound(false);
    fetchData();
    refreshFullView();
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await clanAction(session?.access_token, {
      action: 'join_by_code',
      code: joinCode.trim().toUpperCase(),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed to join');
      return;
    }
    setSuccess('Joined clan!');
    setJoinCode('');
    fetchData();
    refreshFullView();
  };

  const handleLeave = async () => {
    if (!confirm('Are you sure you want to leave your clan?')) return;
    setError(null);
    setBusy(true);
    const result = await clanAction(session?.access_token, { action: 'leave' });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed to leave clan');
      return;
    }
    setSuccess('Left clan');
    setMyClan(null);
    fetchData();
    refreshFullView();
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
            <p className="text-beige font-body mt-1">Someone specific sees your week</p>
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
          {/* §12.1 slot 7: pre-built, population-gated, hidden by default.
              Hiding is a flag; every row behind these panels is preserved. */}
          {CLAN_GAUNTLET_ENABLED && (
            <>
              <DuelPanel accessToken={session?.access_token} />
              <GauntletPanel accessToken={session?.access_token} />
            </>
          )}
          {CLAN_PLAYOFFS_ENABLED && (
            <div className="mb-10 animate-fade-up">
              <PlayoffBracket accessToken={session?.access_token} />
            </div>
          )}

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
                  <p className="text-xl font-display text-bone-white">
                    {myClan.memberCount}/{myClan.maxMembers ?? CLAN_LIMITS.maxMembers}
                  </p>
                </div>
                <div className="bg-void/60 border border-scale-blue-light/50 rounded-arcade p-3 text-center">
                  <p className="label-arcade">Best Week</p>
                  <p className="text-xl font-display text-bone-white">
                    {(myClan.bestWeekDepth ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-void/60 border border-scale-blue-light/50 rounded-arcade p-3 text-center">
                  <p className="label-arcade">Lifetime Depth</p>
                  <p className="text-xl font-display text-bone-white">
                    {(myClan.lifetimeDepth ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* The "Clan Energy Bonus" panel stood here: a promise of
                  +1 energy every 6 hours next to a Claim button that had
                  no onClick and never had one. WP-0.03 removed the whole
                  panel with the faucet behind it. A clan pays nobody
                  (Rule 8), and there is no energy balance to pay into
                  (§8.6). What a clan gives is the Serpent hunt, and
                  WP-1.07 renders it here off GET /api/clan/hunt. */}

              <button
                onClick={handleLeave}
                disabled={busy}
                className="text-strike-red hover:text-bone-white text-sm font-body transition-colors min-h-[44px]"
              >
                Leave Clan
              </button>
            </div>
          </section>

          {/* The hunt (§7.3, §9.2–9.4): the clan against its own best week
              first, the additive contribution list second, and the rival only
              on the weeks a symmetric one exists. Complete at a clan of one. */}
          <div className="animate-fade-up">
            <ClanHuntPanel accessToken={session?.access_token} />
          </div>

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
                onChanged={() => {
                  refreshFullView();
                  fetchData();
                }}
              />
            </>
          )}
          </>
        ) : (
          <>
            {/* Invites issued before the rework can still be answered */}
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

            {/* The founding prompt (§9.2). On this page the two buttons open
                the forms that are already below it, so the prompt is the
                reason rather than a second route: it says what a clan is FOR
                (the Serpent hunts every week) before asking for a name.
                Below the ramp beat it renders nothing at all — no counter and
                no locked card, because being shown a number you have not
                reached is what turns a ramp into a cut line (Rule 8). */}
            <ClanFoundingPrompt
              accessToken={session?.access_token}
              inClan={false}
              onFound={() => setShowFound(true)}
              onJoin={() => joinCodeInput.current?.focus()}
            />

            {/* Found a clan — one tap plus a name (§9.2) */}
            <section className="mb-10 animate-fade-up">
              {showFound ? (
                <div className="panel-elevated p-6 animate-pop-in" data-testid="found-clan">
                  <h2 className="heading-display text-2xl text-bone-white mb-1">Found a Clan</h2>
                  <p className="text-beige/70 text-sm font-body mb-4">
                    A clan of one is a clan. It hunts, it holds records, and it gets a
                    rival the week a matching one exists.
                  </p>
                  <form onSubmit={handleFound} className="space-y-4">
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
                      <p className="label-arcade mb-2">Banner</p>
                      <div className="flex flex-wrap gap-2">
                        {CLAN_BANNERS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setBannerId(option.id)}
                            aria-label={`Banner ${option.name}`}
                            className={`w-14 h-9 rounded-arcade border transition-all ${
                              bannerId === option.id
                                ? 'border-venom-orange scale-105'
                                : 'border-scale-blue-light/50 hover:border-bone-white/60'
                            }`}
                            style={{
                              background: `linear-gradient(120deg, ${option.from}, ${option.to})`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="label-arcade mb-2">Emblem</p>
                      <div className="flex flex-wrap gap-2">
                        {CLAN_EMBLEMS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setEmblemId(option.id)}
                            aria-label={`Emblem ${option.name}`}
                            className={`w-11 h-11 rounded-arcade border bg-void/60 text-xl text-bone-white transition-all ${
                              emblemId === option.id
                                ? 'border-venom-orange scale-105'
                                : 'border-scale-blue-light/50 hover:border-bone-white/60'
                            }`}
                          >
                            {option.glyph}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <button
                        type="submit"
                        disabled={busy}
                        className="btn-go px-6 py-2 min-h-[44px]"
                      >
                        Found Clan
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFound(false)}
                        className="btn-neutral px-6 py-2 min-h-[44px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <button
                  onClick={() => setShowFound(true)}
                  className="btn-go inline-flex items-center gap-2 px-8 py-3 min-h-[44px]"
                  data-testid="found-clan-open"
                >
                  <IconShield size={18} />
                  Found a Clan
                </button>
              )}
            </section>

            {/* Join by invite code — the only way into someone else's clan */}
            <section className="mb-10 animate-fade-up">
              <h2 className="heading-display text-2xl text-bone-white mb-2">Have an invite?</h2>
              <form className="flex gap-2" onSubmit={handleJoinByCode} data-testid="join-by-code">
                <input
                  ref={joinCodeInput}
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="INVITE CODE"
                  maxLength={8}
                  className="flex-1 px-4 py-2 bg-void/60 border border-scale-blue-light/60 rounded-arcade text-bone-white font-display tracking-widest placeholder:text-beige/50 focus:border-venom-orange focus:outline-none transition-colors"
                />
                <button
                  type="submit"
                  disabled={busy || joinCode.trim().length !== 8}
                  className="btn-go px-5 py-2 min-h-[44px]"
                >
                  Join
                </button>
              </form>
            </section>

            {/* The directory — alive clans only, and never a total (§9.2) */}
            <section className="animate-fade-up">
              <h2 className="heading-display text-2xl text-bone-white mb-1">Hunting this week</h2>
              <p className="text-beige/60 text-sm font-body mb-4">
                Clans that hunted the Serpent this week or last.
              </p>
              {loading ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 border-4 border-venom-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-beige font-body">Loading clans...</p>
                </div>
              ) : directory.length === 0 ? (
                <div className="panel p-8 text-center">
                  <p className="text-beige font-body">
                    No clan has settled a hunt yet. Found yours and be the first name here.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {directory.map((clan) => (
                    <div
                      key={clan.id}
                      className="panel p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      data-testid="directory-row"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <IconShield size={16} className="text-beige/70" />
                          <span className="font-display uppercase text-lg text-bone-white">
                            {clan.name}
                          </span>
                          {clan.tag && (
                            <span className="px-2 py-0.5 bg-void/60 border border-scale-blue-light/60 rounded-arcade text-xs font-display">
                              [{clan.tag}]
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-beige/60 font-body mt-1">
                          {clan.memberCount}/{clan.maxMembers} members · best week{' '}
                          {clan.bestWeekDepth.toLocaleString()}
                        </p>
                      </div>
                      {/* No Join button: recruitment is the invite link (§9.2).
                          The directory exists so a newcomer sees a living world,
                          not so clans can be walked into uninvited. */}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

'use client';

/**
 * The Serpent week — `/serpent`, and `/serpent?week=YYYY-MM-DD` (Rule 14).
 *
 * §12.2 caps weekly surfaces at one, and this is it. Two blocks, in §7.3's
 * order: the hunt that is running, then the Monday briefing for a week that has
 * submerged. Both are readings — nothing on this page mutates anything, and
 * nothing on it is for sale (Rule 7: this is navigation, and the store stays in
 * its district).
 *
 * WHY THE WEEK IS IN THE URL
 *
 *   Rule 14: "every meaningful artifact — a run, a snake, a clan, a Signal day,
 *   a Serpent week, a profile — is linkable". A Serpent week is named on the
 *   list, so `?week=` selects it and the briefing's week picker is a row of
 *   links rather than a dropdown. A stranger opening one of those links sees a
 *   real week; a wrong key sees an honest "there is no Serpent week at that
 *   date" instead of a silent fallback that would make a broken link look fine.
 *
 * FLAG OFF
 *
 *   `NEXT_PUBLIC_SERPENT_V1` is off by default, and the panel API answers 200
 *   with `live: false` in that state rather than an error — deliberately, so
 *   this page renders an off state. The page itself is NOT hidden when the flag
 *   is off: a URL that 404s intermittently is worse than one that always
 *   resolves and tells you the Serpent has not surfaced yet. What the flag does
 *   hide is the navigation entry, so nobody is led here before there is a hunt.
 *
 * WHAT THIS PAGE FETCHES
 *
 *   `GET /api/serpent/panel` for the week and the player, — only to fill
 *   §7.3's third block — `GET /api/clan/hunt` for the paired rival, and
 *   `GET /api/player` for two things the panel contract does not carry: the
 *   banked-run count the founding prompt keys off, and the player's own
 *   `players.id` so their row in the contribution list can be named as theirs.
 *   That last read is done once here and passed down, rather than by each
 *   component separately.
 *
 *   The rival read is allowed to fail silently: §9.4 makes rivalry a layer,
 *   never load-bearing, so a page missing it is still a complete page. The
 *   player read is allowed to fail silently too — without it the founding
 *   prompt simply does not appear and the contribution rows are named by
 *   handle alone. Neither absence turns into an error the player has to read.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { NavBar } from '@/components/ui/NavBar';
import { SerpentWeekPanel } from '@/components/serpent/SerpentWeekPanel';
import { MondayBriefing } from '@/components/serpent/MondayBriefing';
import { ClanFoundingPrompt } from '@/components/clan/ClanFoundingPrompt';
import { defaultBriefingWeek } from '@/lib/serpent/briefing';
import { emptySerpentPanel, type SerpentPanel } from '@/lib/server/serpent';
import type { ClanHuntPanel } from '@/lib/server/clanHunt';

interface PlayerIdentity {
  playerId: string | null;
  bankedRuns: number | null;
}

function SerpentContent() {
  const searchParams = useSearchParams();
  const { session, isAuthenticated, isLoading } = useAuth();
  const [panel, setPanel] = useState<SerpentPanel | null>(null);
  const [hunt, setHunt] = useState<ClanHuntPanel | null>(null);
  const [identity, setIdentity] = useState<PlayerIdentity>({
    playerId: null,
    bankedRuns: null,
  });
  const [loading, setLoading] = useState(true);

  const accessToken = session?.access_token;

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    const headers = { Authorization: `Bearer ${accessToken}` };
    try {
      const response = await fetch('/api/serpent/panel', { headers });
      if (response.ok) setPanel((await response.json()) as SerpentPanel);
    } catch {
      // A failed read leaves the panel absent rather than inventing numbers.
    }
    try {
      const response = await fetch('/api/clan/hunt', { headers });
      if (response.ok) setHunt((await response.json()) as ClanHuntPanel);
    } catch {
      // The rival is a layer (§9.4). Its absence is never an error state.
    }
    try {
      const response = await fetch('/api/player', { headers });
      if (response.ok) {
        const json = (await response.json()) as {
          player?: { id?: string } | null;
          genomeFtue?: { bankedRuns?: number } | null;
        };
        setIdentity({
          playerId: typeof json.player?.id === 'string' ? json.player.id : null,
          bankedRuns:
            typeof json.genomeFtue?.bankedRuns === 'number'
              ? json.genomeFtue.bankedRuns
              : null,
        });
      }
    } catch {
      // Without it the prompt stays away and rows are named by handle alone.
    }
    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const weekKey = searchParams.get('week') || defaultBriefingWeek();

  if (isLoading || loading) {
    return (
      <div className="app-bg min-h-screen">
        <NavBar />
        <main className="max-w-4xl mx-auto px-4 py-10">
          <p className="text-beige font-body">Reading the week…</p>
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="app-bg min-h-screen">
        <NavBar />
        <main className="max-w-4xl mx-auto px-4 py-10">
          <h1 className="heading-display text-3xl text-bone-white mb-2">
            The World Serpent
          </h1>
          <p className="text-beige/80 font-body mb-4">
            A Serpent surfaces every Monday and submerges on Sunday midnight UTC. Sign in
            and your runs start feeding the hunt.
          </p>
          <Link
            href="/login?returnTo=/serpent"
            className="btn-go px-6 py-2 min-h-[44px] inline-flex items-center"
          >
            Sign in
          </Link>
        </main>
      </div>
    );
  }

  // A failed or absent read renders the same off state the API itself returns
  // when the flag is down, rather than a second hand-written zero shape that
  // could drift from the contract.
  const view = panel ?? emptySerpentPanel();

  return (
    <div className="app-bg min-h-screen">
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 py-10 pb-28">
        <h1 className="heading-display text-3xl text-bone-white mb-6">The World Serpent</h1>

        <ClanFoundingPrompt
          accessToken={accessToken}
          inClan={Boolean(view.clan)}
          bankedRuns={identity.bankedRuns}
        />

        <div className="mb-8">
          <SerpentWeekPanel panel={view} youPlayerId={identity.playerId} />
        </div>

        <MondayBriefing
          panel={view}
          weekKey={weekKey}
          rival={hunt?.rival ?? null}
          rivalWeekStart={hunt?.week?.weekStart ?? null}
        />
      </main>
    </div>
  );
}

export default function SerpentPage() {
  return (
    <Suspense
      fallback={
        <div className="app-bg min-h-screen">
          <NavBar />
          <main className="max-w-4xl mx-auto px-4 py-10">
            <p className="text-beige font-body">Reading the week…</p>
          </main>
        </div>
      }
    >
      <SerpentContent />
    </Suspense>
  );
}

'use client';

/**
 * `/serpent` is the automatic Clan Energy Battle. Historical
 * `/serpent?week=YYYY-MM-DD` artifacts remain readable under their original
 * stamped rules; migration 059 retires new explicit attempts, not history.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { NavBar } from '@/components/ui/NavBar';
import { EnergyBattlePanel } from '@/components/clan/EnergyBattlePanel';
import { MondayBriefing } from '@/components/serpent/MondayBriefing';
import { SettlementPostCard } from '@/components/serpent/SettlementPostCard';
import { emptySerpentPanel, type SerpentPanel } from '@/lib/server/serpent';
import type { ClanHuntPanel } from '@/lib/server/clanHunt';

function HistoricalSerpentArchive({
  accessToken,
  weekKey,
}: {
  accessToken: string;
  weekKey: string;
}) {
  const [panel, setPanel] = useState<SerpentPanel | null>(null);
  const [hunt, setHunt] = useState<ClanHuntPanel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const headers = { Authorization: `Bearer ${accessToken}` };
    void Promise.all([
      fetch('/api/serpent/panel', { headers })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
      fetch('/api/clan/hunt', { headers })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
    ]).then(([panelData, huntData]) => {
      if (cancelled) return;
      setPanel(panelData as SerpentPanel | null);
      setHunt(huntData as ClanHuntPanel | null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (loading) {
    return <p className="text-center font-body text-beige/60">Reading archived hunt…</p>;
  }

  const view = panel ?? emptySerpentPanel();
  return (
    <section className="space-y-6" data-testid="serpent-history">
      <header className="space-y-2 text-center">
        <p className="label-arcade text-cosmic">Immutable history</p>
        <h1 className="heading-display text-4xl text-bone-white">Archived World Serpent</h1>
        <p className="font-body text-sm text-beige/70">
          This week settled under the retired best-three hunt rules. It is preserved,
          not re-scored by Energy Commitment.
        </p>
      </header>
      <MondayBriefing
        panel={view}
        weekKey={weekKey}
        rival={hunt?.rival ?? null}
        rivalWeekStart={hunt?.week?.weekStart ?? null}
      />
      <SettlementPostCard panel={view} weekKey={weekKey} />
      <div className="text-center">
        <Link href="/serpent" className="font-body text-sm text-cosmic underline">
          Return to the current Clan Energy Battle
        </Link>
      </div>
    </section>
  );
}

function SerpentContent() {
  const searchParams = useSearchParams();
  const { session, isAuthenticated, isLoading } = useAuth();
  const historicalWeek = searchParams.get('week');

  return (
    <main className="consent-safe-viewport app-bg min-h-dvh pb-24">
      <NavBar />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        {isLoading ? (
          <p className="text-center font-body text-beige/60">Reading the World Serpent…</p>
        ) : !isAuthenticated || !session?.access_token ? (
          <div className="panel-elevated space-y-3 p-6 text-center">
            <h1 className="heading-display text-3xl text-bone-white">The World Serpent</h1>
            <p className="font-body text-beige">Sign in to see your clan&apos;s battle and history.</p>
            <Link
              href="/login?returnTo=/serpent"
              className="btn-go inline-flex min-h-[44px] items-center px-6 py-3"
            >
              Sign in
            </Link>
          </div>
        ) : historicalWeek ? (
          <HistoricalSerpentArchive
            accessToken={session.access_token}
            weekKey={historicalWeek}
          />
        ) : (
          <>
            <header className="space-y-2 text-center">
              <p className="label-arcade text-cosmic">The World Serpent</p>
              <h1 className="heading-display text-4xl text-bone-white">Clan Energy Battle</h1>
              <p className="mx-auto max-w-2xl font-body text-sm text-beige/70">
                Play the normal game. Every Energy-funded run during the three-day
                window is entered automatically; only your strongest five Yields
                contribute. Energy increases personal harvest, not battle score.
              </p>
            </header>
            <EnergyBattlePanel accessToken={session.access_token} />
            <div className="text-center">
              <Link
                href="/game"
                className="btn-go inline-flex min-h-[44px] items-center px-7 py-3"
              >
                Open Run Setup
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function SerpentPage() {
  return (
    <Suspense
      fallback={
        <div className="app-bg min-h-screen">
          <NavBar />
          <main className="mx-auto max-w-3xl px-4 py-10">
            <p className="font-body text-beige">Reading the World Serpent…</p>
          </main>
        </div>
      }
    >
      <SerpentContent />
    </Suspense>
  );
}

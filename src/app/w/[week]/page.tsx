/**
 * `/w/<week>` — the Serpent week, and with `?c=<TAG>` the settlement card
 * §11.3 quotes: "HOLLOW FANG reached Depth 48,210 — best week yet."
 *
 * `week` is the week's Monday as `YYYY-MM-DD`, the same natural key the
 * `serpent_weeks.week_start` UNIQUE constraint enforces. The week's index,
 * seed and modifier set are derived from the UTC calendar, so this page is
 * correct for a week that has not opened yet and for one settled a year
 * ago; the clan's Depth is read from the settled row and never from the URL.
 *
 * Rule 7: no commercial surface. Rule 8: the card carries a Depth and a
 * count of members who hunted — no rank, no threshold, no bar, no cut line.
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { ArtifactLanding } from '@/components/share/ArtifactLanding';
import { SHARE_ARTIFACTS_V1_ENABLED } from '@/lib/features/shareArtifacts';
import { settlementCardModel } from '@/lib/share/artifactCards';
import { serpentWeekArtifactPath } from '@/lib/share/artifactUrls';
import {
  CLAN_TAG_PATTERN,
  derivedSerpentWeek,
  loadSerpentWeekArtifact,
  type SerpentWeekArtifact,
} from '@/lib/server/artifacts';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ week: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function clanTagOf(value: string | string[] | undefined): string | null {
  const raw = (Array.isArray(value) ? value[0] : value) ?? '';
  const tag = raw.toUpperCase();
  return CLAN_TAG_PATTERN.test(tag) ? tag : null;
}

async function load(weekKey: string, clanTag: string | null): Promise<SerpentWeekArtifact | null> {
  if (!derivedSerpentWeek(weekKey)) return null;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
  return loadSerpentWeekArtifact(supabase, weekKey, clanTag);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { week } = await params;
  const derived = derivedSerpentWeek(week);
  if (!derived) return { title: 'SupaSnake' };
  return {
    title: `World Serpent — week of ${derived.weekKey} — SupaSnake`,
    description:
      'The weekly hunt. Your three best runs make your Depth; every member’s Depth adds to the clan’s.',
    alternates: { canonical: serpentWeekArtifactPath(derived.weekKey) },
  };
}

export default async function SerpentWeekArtifactPage({ params, searchParams }: PageProps) {
  if (!SHARE_ARTIFACTS_V1_ENABLED) notFound();

  const { week } = await params;
  const clanTag = clanTagOf((await searchParams).c);
  const artifact = await load(week, clanTag);
  if (!artifact) notFound();

  return (
    <ArtifactLanding
      card={settlementCardModel({
        weekKey: artifact.weekKey,
        weekIndex: artifact.weekIndex,
        seed: artifact.seed,
        modifierNames: artifact.modifierNames,
        clan: artifact.clan,
      })}
      actionHref="/game"
      actionLabel="Hunt this week"
      blurb="One Serpent per week, worldwide. Your three best runs make your Depth, and every member’s Depth adds to the clan’s — no thresholds, no bars, no minimum."
      secondary={{ href: '/leaderboard', label: 'See the board' }}
    />
  );
}

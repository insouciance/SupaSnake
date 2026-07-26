/**
 * `/s/<day>` — the Signal day artifact and the challenge landing.
 *
 * Constitution §11.3 writes this URL by name (`supasnake.com/s/214`) and
 * describes exactly what it must do: "A Signal share URL drops the visitor
 * onto the *same seed* with the sharer's score as the target — 'beat my
 * 1,240 on Signal #214' is a dare, not a screenshot, and the visitor lands
 * in a live game five seconds after clicking."
 *
 * The seed is DERIVED from the day, never read from the query, so every
 * visitor to `/s/214` plays the board every other player played that day
 * (§7.2, "same conditions worldwide"). The target and the decision string
 * are the sharer's claim and are labelled as one.
 *
 * Rule 7: no commercial surface on this page. Rule 14: the OG image lives
 * beside this file in `opengraph-image.tsx`.
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArtifactLanding } from '@/components/share/ArtifactLanding';
import { SHARE_ARTIFACTS_V1_ENABLED } from '@/lib/features/shareArtifacts';
import { cardShare, signalCardModel } from '@/lib/share/artifactCards';
import {
  challengeImagePath,
  challengeNeedsOwnImage,
  challengePlayPath,
  signalArtifactPath,
  signalArtifactUrl,
} from '@/lib/share/artifactUrls';
import {
  challengeFromSignal,
  challengeHeadline,
  parseSignalDay,
  signalIndexToDayKey,
} from '@/shared/game/challenge';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ day: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const day = parseSignalDay((await params).day);
  if (day === null) return { title: 'SupaSnake' };

  const query = await searchParams;
  const challenge = challengeFromSignal(day, {
    t: first(query.t),
    by: first(query.by),
    d: first(query.d),
  });
  const title =
    challenge.target !== null
      ? `${challengeHeadline(challenge)} — SupaSnake`
      : `Signal #${day} — SupaSnake`;

  return {
    title,
    description: `The World Signal for ${signalIndexToDayKey(
      day
    )}: one seeded condition-set, the same for every player in the world. Play it in your browser.`,
    alternates: { canonical: signalArtifactPath(day) },
    // Only override the file-convention image when the URL carries a dare
    // the file convention cannot see (it never receives searchParams).
    ...(challengeNeedsOwnImage(challenge)
      ? {
          openGraph: { images: [challengeImagePath(challenge)] },
          twitter: { card: 'summary_large_image' as const, images: [challengeImagePath(challenge)] },
        }
      : {}),
  };
}

export default async function SignalArtifactPage({ params, searchParams }: PageProps) {
  if (!SHARE_ARTIFACTS_V1_ENABLED) notFound();

  const day = parseSignalDay((await params).day);
  if (day === null) notFound();

  const query = await searchParams;
  const challenge = challengeFromSignal(day, {
    t: first(query.t),
    by: first(query.by),
    d: first(query.d),
  });
  const dayKey = signalIndexToDayKey(day);

  const card = signalCardModel({ day, dayKey, seed: challenge.seed, challenge });

  return (
    <ArtifactLanding
      card={card}
      actionHref={challengePlayPath(challenge)}
      actionLabel={challenge.target !== null ? 'Take the challenge' : 'Play this Signal'}
      blurb={
        challenge.target !== null
          ? 'Same seed, same conditions. The target is what they scored — beat it in three minutes, in your browser, with no install.'
          : 'One Signal per day, the same for everyone in the world. Three minutes, in your browser, no install.'
      }
      secondary={{ href: '/leaderboard', label: 'See the board' }}
      // Passing it on preserves the dare exactly as it arrived.
      share={cardShare(card, signalArtifactUrl(day, challenge))}
    />
  );
}

/**
 * `/r/<seed>` — the run artifact and its challenge landing (Rule 14: "a
 * run … is linkable, and the link carries an image and a way in").
 *
 * A run outside the Signal is addressed by its own seed, so a shared run is
 * a playable dare exactly like a shared Signal day. Everything on the card
 * except the seed is the sharer's claim; the run a visitor starts from here
 * settles through the same server recompute as any other run (Rule 11), and
 * the target reaches no leaderboard, no payout and no settlement.
 *
 * Rule 7: no commercial surface.
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArtifactLanding } from '@/components/share/ArtifactLanding';
import { SHARE_ARTIFACTS_V1_ENABLED } from '@/lib/features/shareArtifacts';
import { cardShare, runCardModel } from '@/lib/share/artifactCards';
import {
  challengeImagePath,
  challengeNeedsOwnImage,
  challengePlayPath,
  runArtifactPath,
  runArtifactUrl,
} from '@/lib/share/artifactUrls';
import { challengeFromRun, challengeHeadline } from '@/shared/game/challenge';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ seed: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

const DYNASTIES = new Set(['CYBER', 'PRIMAL', 'COSMIC']);

function dynastyOf(value: string | null): string | null {
  const upper = (value ?? '').toUpperCase();
  return DYNASTIES.has(upper) ? upper : null;
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const seed = (await params).seed;
  const query = await searchParams;
  const challenge = challengeFromRun(seed, {
    t: first(query.t),
    by: first(query.by),
    d: first(query.d),
  });
  if (!challenge) return { title: 'SupaSnake' };

  return {
    title: `${challengeHeadline(challenge)} — SupaSnake`,
    description:
      'A three-minute precision snake run, on the exact seed it was set on. No install, no ads.',
    alternates: { canonical: runArtifactPath(seed) },
    ...(challengeNeedsOwnImage(challenge)
      ? {
          openGraph: {
            images: [challengeImagePath(challenge, dynastyOf(first(query.dy)))],
          },
          twitter: {
            card: 'summary_large_image' as const,
            images: [challengeImagePath(challenge, dynastyOf(first(query.dy)))],
          },
        }
      : {}),
  };
}

export default async function RunArtifactPage({ params, searchParams }: PageProps) {
  if (!SHARE_ARTIFACTS_V1_ENABLED) notFound();

  const query = await searchParams;
  const challenge = challengeFromRun((await params).seed, {
    t: first(query.t),
    by: first(query.by),
    d: first(query.d),
  });
  if (!challenge) notFound();

  const card = runCardModel({ challenge, dynasty: dynastyOf(first(query.dy)) });

  return (
    <ArtifactLanding
      card={card}
      actionHref={challengePlayPath(challenge)}
      actionLabel={challenge.target !== null ? 'Take the challenge' : 'Play this seed'}
      blurb="Same seed, same board. Every run ends with a deal: bank it, push your luck, or feed the snake."
      secondary={{ href: '/leaderboard', label: 'See the board' }}
      share={cardShare(card, runArtifactUrl(challenge.seed, challenge))}
    />
  );
}

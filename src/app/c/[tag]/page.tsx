/**
 * `/c/<TAG>` — a clan, as a public object (Rule 14).
 *
 * Public facts only: the clan's name, tag, member count and the two
 * monotonic Depth numbers. No roster, no per-member output, no rank, no
 * threshold — Rule 8 forbids any UI that gives an officer a mechanical
 * reason to evaluate a member, and a public page listing who contributed
 * what would be exactly that.
 *
 * Rule 7: no commercial surface; there is nothing purchasable about a clan.
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { ArtifactLanding } from '@/components/share/ArtifactLanding';
import { SHARE_ARTIFACTS_V1_ENABLED } from '@/lib/features/shareArtifacts';
import { cardShare, clanCardModel } from '@/lib/share/artifactCards';
import { clanArtifactPath, clanArtifactUrl } from '@/lib/share/artifactUrls';
import { CLAN_TAG_PATTERN, loadClanArtifact } from '@/lib/server/artifacts';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ tag: string }>;
}

function normalizeTag(raw: string): string | null {
  const tag = raw.toUpperCase();
  return CLAN_TAG_PATTERN.test(tag) ? tag : null;
}

async function load(tag: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
  return loadClanArtifact(supabase, tag);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const tag = normalizeTag((await params).tag);
  if (!tag) return { title: 'SupaSnake' };
  return {
    title: `[${tag}] — SupaSnake clan`,
    description:
      'A SupaSnake clan hunting the World Serpent. Every member’s Depth adds — no thresholds, no bars.',
    alternates: { canonical: clanArtifactPath(tag) },
  };
}

export default async function ClanArtifactPage({ params }: PageProps) {
  if (!SHARE_ARTIFACTS_V1_ENABLED) notFound();

  const tag = normalizeTag((await params).tag);
  if (!tag) notFound();

  const clan = await load(tag);
  if (!clan) notFound();

  const card = clanCardModel(clan);

  return (
    <ArtifactLanding
      card={card}
      actionHref="/game"
      actionLabel="Play SupaSnake"
      blurb="Clans hunt the World Serpent together. Participation adds, proportionally: a clan of one reads as meaningfully as a clan of twelve."
      secondary={{ href: '/clan', label: 'Find a clan' }}
      share={cardShare(card, clanArtifactUrl(clan.tag))}
    />
  );
}

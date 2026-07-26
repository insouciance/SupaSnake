/**
 * The Open Graph image for `/c/<TAG>` (Rule 14).
 *
 * Reads the clan row, exactly as the page does. A tag that resolves to
 * nothing — unknown, disbanded, or a failed read — renders a generic clan
 * card rather than a broken image, because an OG fetcher cannot show a 404
 * to a human and a grey box loses the link.
 */

import {
  artifactImageResponse,
  ARTIFACT_IMAGE_CONTENT_TYPE,
  ARTIFACT_IMAGE_SIZE,
} from '@/lib/og/artifactCard';
import { createClient } from '@supabase/supabase-js';
import { clanCardModel } from '@/lib/share/artifactCards';
import { CLAN_TAG_PATTERN, loadClanArtifact } from '@/lib/server/artifacts';

export const alt = 'SupaSnake — a clan hunting the World Serpent';
export const size = ARTIFACT_IMAGE_SIZE;
export const contentType = ARTIFACT_IMAGE_CONTENT_TYPE;

export default async function ClanOpengraphImage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const tag = (await params).tag.toUpperCase();

  if (CLAN_TAG_PATTERN.test(tag)) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
    const clan = await loadClanArtifact(supabase, tag);
    if (clan) return artifactImageResponse(clanCardModel(clan));
  }

  return artifactImageResponse({
    kicker: 'Clan',
    title: 'Hunt the World Serpent together',
    subtitle: 'Every member’s Depth adds — no thresholds, no bars',
    provenance: 'verified',
    callToAction: 'Three-minute runs, in your browser',
  });
}

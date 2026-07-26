/**
 * The Open Graph image for `/w/<week>` (Rule 14).
 *
 * The file convention receives no query string, so this renders the WEEK —
 * derived from the calendar and always correct. A settlement card scoped to
 * one clan is the page's own read; a clan-scoped share therefore leads with
 * the week and lands on the clan's Depth, which is the honest ordering
 * anyway: the week is the shared fact, the Depth is one clan's story.
 */

import {
  artifactImageResponse,
  ARTIFACT_IMAGE_CONTENT_TYPE,
  ARTIFACT_IMAGE_SIZE,
} from '@/lib/og/artifactCard';
import { settlementCardModel } from '@/lib/share/artifactCards';
import { derivedSerpentWeek } from '@/lib/server/artifacts';
import { serpentWeekKey } from '@/shared/game/serpent';

export const alt = 'SupaSnake — the World Serpent';
export const size = ARTIFACT_IMAGE_SIZE;
export const contentType = ARTIFACT_IMAGE_CONTENT_TYPE;

export default async function SerpentWeekOpengraphImage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  // A malformed week still gets an image — this one's — rather than a grey
  // box: an OG fetcher has no way to show a human a 404.
  const artifact =
    derivedSerpentWeek((await params).week) ?? derivedSerpentWeek(serpentWeekKey())!;

  return artifactImageResponse(
    settlementCardModel({
      weekKey: artifact.weekKey,
      weekIndex: artifact.weekIndex,
      seed: artifact.seed,
      modifierNames: artifact.modifierNames,
      clan: null,
    })
  );
}

/**
 * The Open Graph image for `/b/<code>` (WP-2.08). Pure: the card is decoded
 * from the path segment, so it needs no database and renders for a stranger
 * who has never held an account.
 *
 * NOT gated by `WORKBENCH_V1_ENABLED`, deliberately and in line with `/x/`: a
 * crawler unfurling an already-shared link during a rollback must still get a
 * real card rather than a grey box. The FLAG gates the player-visible page.
 *
 * And it never throws. An undecodable code falls back to a real card about
 * what the Workbench is — which is the honest thing to show for a link whose
 * plan cannot be read, and better than a broken image in somebody's feed.
 */

import {
  artifactImageResponse,
  ARTIFACT_IMAGE_CONTENT_TYPE,
  ARTIFACT_IMAGE_SIZE,
} from '@/lib/og/artifactCard';
import { buildCardModelFor } from '@/lib/share/artifactCards';
import { decodeBuildCode } from '@/lib/share/buildCode';

export const alt = 'SupaSnake — a planned build';
export const size = ARTIFACT_IMAGE_SIZE;
export const contentType = ARTIFACT_IMAGE_CONTENT_TYPE;

export default async function BuildOpengraphImage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const model = decodeBuildCode((await params).code);
  if (!model) {
    return artifactImageResponse({
      kicker: 'Workbench',
      title: 'Plan the hunt before you take it',
      subtitle: 'Your own snakes, this week’s conditions, and a floor rather than a forecast',
      provenance: 'verified',
      callToAction: 'Open the Genome Workbench',
    });
  }
  return artifactImageResponse(buildCardModelFor(model));
}

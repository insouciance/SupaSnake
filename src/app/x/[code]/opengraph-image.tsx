/**
 * The Open Graph image for `/x/<code>` (Rule 14). Pure: the card is decoded
 * from the path segment, so it needs no database and renders for a stranger
 * who has never held an account.
 */

import {
  artifactImageResponse,
  ARTIFACT_IMAGE_CONTENT_TYPE,
  ARTIFACT_IMAGE_SIZE,
} from '@/lib/og/artifactCard';
import { lineageCardModelFor } from '@/lib/share/artifactCards';
import { decodeLineageCode } from '@/lib/share/lineageCode';

export const alt = 'SupaSnake — a bred snake';
export const size = ARTIFACT_IMAGE_SIZE;
export const contentType = ARTIFACT_IMAGE_CONTENT_TYPE;

export default async function LineageOpengraphImage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const model = decodeLineageCode((await params).code);
  if (!model) {
    return artifactImageResponse({
      kicker: 'Lineage',
      title: 'Every snake is bred, not bought',
      subtitle: 'Genes come out of runs — nothing you can buy moves a number',
      provenance: 'verified',
      callToAction: 'Breed your own in the Snake Lab',
    });
  }
  return artifactImageResponse(lineageCardModelFor(model));
}

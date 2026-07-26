/**
 * The Open Graph image for a bare `/r/<seed>` link (Rule 14).
 *
 * A run link that also carries a target renders through `/og/challenge`
 * instead, because the file convention never receives the query string.
 */

import {
  artifactImageResponse,
  ARTIFACT_IMAGE_CONTENT_TYPE,
  ARTIFACT_IMAGE_SIZE,
} from '@/lib/og/artifactCard';
import { runCardModel, signalCardModel } from '@/lib/share/artifactCards';
import {
  challengeFromRun,
  challengeFromSignal,
  signalDayIndex,
  signalIndexToDayKey,
} from '@/shared/game/challenge';

export const alt = 'SupaSnake — a run, on its seed';
export const size = ARTIFACT_IMAGE_SIZE;
export const contentType = ARTIFACT_IMAGE_CONTENT_TYPE;

export default async function RunOpengraphImage({
  params,
}: {
  params: Promise<{ seed: string }>;
}) {
  const challenge = challengeFromRun((await params).seed);
  if (!challenge) {
    // An unusable seed still has to produce an image; fall back to today's
    // Signal card rather than handing a feed a broken preview.
    const day = signalDayIndex();
    const fallback = challengeFromSignal(day);
    return artifactImageResponse(
      signalCardModel({
        day,
        dayKey: signalIndexToDayKey(day),
        seed: fallback.seed,
        challenge: fallback,
      })
    );
  }
  return artifactImageResponse(runCardModel({ challenge }));
}

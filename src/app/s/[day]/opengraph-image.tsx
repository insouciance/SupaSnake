/**
 * The Open Graph image for `/s/<day>` (Rule 14: every artifact's link
 * "carries an image and a way in").
 *
 * Rendered for any syntactically valid day, flag or no flag: a card that
 * fails to render is a link that arrives in a feed as a bare grey box, and
 * the rollout switch gates the player-visible PAGE, not the metadata a
 * crawler reads.
 */

import { artifactImageResponse, ARTIFACT_IMAGE_CONTENT_TYPE, ARTIFACT_IMAGE_SIZE } from '@/lib/og/artifactCard';
import { signalCardModel } from '@/lib/share/artifactCards';
import {
  challengeFromSignal,
  parseSignalDay,
  signalDayIndex,
  signalIndexToDayKey,
} from '@/shared/game/challenge';

export const alt = "SupaSnake — Today's Challenge";
export const size = ARTIFACT_IMAGE_SIZE;
export const contentType = ARTIFACT_IMAGE_CONTENT_TYPE;

export default async function SignalOpengraphImage({
  params,
}: {
  params: Promise<{ day: string }>;
}) {
  // An unparseable day still gets a card — today's — rather than a broken
  // image: the OG fetcher has no way to report a 404 to a human.
  const day = parseSignalDay((await params).day) ?? signalDayIndex();
  const challenge = challengeFromSignal(day);

  return artifactImageResponse(
    signalCardModel({
      day,
      dayKey: signalIndexToDayKey(day),
      seed: challenge.seed,
      challenge,
    })
  );
}

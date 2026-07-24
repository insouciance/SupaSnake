import { compareTrainingBests } from './scoring';
import type {
  TrainingBestSummary,
  TrainingProfile,
  TrainingRecentSummary,
} from './types';

/**
 * A non-live response means durable Training tables are unavailable; it does
 * not invalidate results already verified during this browser session. Live
 * snapshots remain authoritative and replace the session view completely.
 */
export function mergeTrainingProfile(
  current: TrainingProfile,
  incoming: Partial<TrainingProfile>
): TrainingProfile {
  if (incoming.live !== true) {
    return { ...current, live: false };
  }
  return {
    live: true,
    bests: Array.isArray(incoming.bests) ? incoming.bests : [],
    recent: Array.isArray(incoming.recent) ? incoming.recent : [],
  };
}

/** Apply verified responses safely even when concurrent requests finish out of order. */
export function recordVerifiedTrainingAttempt(
  current: TrainingProfile,
  candidate: TrainingBestSummary | null,
  recent: TrainingRecentSummary,
  persisted: boolean
): TrainingProfile {
  let bests = current.bests;
  if (candidate) {
    const existing = current.bests.find((best) =>
      best.exercise === candidate.exercise && best.difficulty === candidate.difficulty
    );
    const nextBest = existing && compareTrainingBests(existing, candidate) >= 0
      ? existing
      : candidate;
    bests = [
      ...current.bests.filter((best) => !(
        best.exercise === nextBest.exercise && best.difficulty === nextBest.difficulty
      )),
      nextBest,
    ];
  }

  return {
    live: persisted || current.live,
    bests,
    recent: [recent, ...current.recent]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 40),
  };
}

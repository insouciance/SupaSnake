import type {
  TrainingAttemptFacts,
  TrainingBestSummary,
  TrainingMedal,
  TrainingMetrics,
} from './types';

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function medalFor(
  completed: boolean,
  rating: number,
  accuracy: number,
  kind: TrainingAttemptFacts['kind']
): TrainingMedal {
  if (!completed || kind === 'sandbox') return 'none';
  if (rating >= 95 && accuracy >= 98) return 'prismatic';
  if (rating >= 85 && accuracy >= 92) return 'gold';
  if (rating >= 72 && accuracy >= 80) return 'silver';
  if (rating >= 55 && accuracy >= 65) return 'bronze';
  return 'none';
}

function diagnosisFor(
  facts: TrainingAttemptFacts,
  accuracy: number,
  efficiency: number,
  meanTimingError: number
): string {
  if (!facts.completed) {
    if (facts.exercise === 'escape') return 'Commit to the first safe turn earlier.';
    if (facts.progressTotal > 0 && facts.progress / facts.progressTotal >= 0.75) {
      return 'The finish is close—protect the last two turns instead of rushing them.';
    }
    return 'Slow the plan down: secure the next checkpoint before looking ahead.';
  }
  if (accuracy < 90) return 'Hold the authored line longer before setting up the next turn.';
  if (facts.rejectedInputs > 0) {
    return `${facts.rejectedInputs} input${facts.rejectedInputs === 1 ? ' was' : 's were'} rejected—leave one clean command per turn.`;
  }
  if (facts.unnecessaryInputs > 0) {
    return `Remove ${facts.unnecessaryInputs} extra input${facts.unnecessaryInputs === 1 ? '' : 's'} to make the line calmer.`;
  }
  if (meanTimingError > 1) return 'Most corners landed, but the turn window can move one tick earlier.';
  if (efficiency < 92) return 'The route is safe; now shorten the space between objectives.';
  return 'Clean execution. Raise the difficulty or remove guidance for transfer practice.';
}

export function scoreTrainingAttempt(facts: TrainingAttemptFacts): TrainingMetrics {
  const progressRatio = facts.progressTotal > 0
    ? facts.progress / facts.progressTotal
    : 0;
  const pathAccuracy = facts.pathObservedTicks > 0
    ? (facts.pathMatchedTicks / facts.pathObservedTicks) * 100
    : 0;
  const accuracy = clampScore(
    facts.exercise === 'route' || facts.exercise === 'escape'
      ? progressRatio * 100
      : pathAccuracy
  );
  const efficiency = clampScore(
    facts.completed && facts.ticks > 0
      ? (facts.optimalTicks / facts.ticks) * 100
      : progressRatio * 60
  );
  const timingErrors = facts.splits.map((split) =>
    split.deltaTicks === null ? 4 : Math.abs(split.deltaTicks)
  );
  const meanTimingError = timingErrors.length > 0
    ? timingErrors.reduce((sum, value) => sum + value, 0) / timingErrors.length
    : 0;
  const consistency = clampScore(
    100 - meanTimingError * 7 - facts.rejectedInputs * 12 - facts.unnecessaryInputs * 4
  );
  let rating = clampScore(accuracy * 0.55 + efficiency * 0.25 + consistency * 0.2);
  if (!facts.completed) rating = Math.min(54, rating);
  const medal = medalFor(facts.completed, rating, accuracy, facts.kind);

  return {
    completed: facts.completed,
    rating,
    medal,
    accuracy,
    efficiency,
    consistency,
    ticks: facts.ticks,
    durationMs: facts.ticks * facts.tickMs,
    progress: facts.progress,
    progressTotal: facts.progressTotal,
    rejectedInputs: facts.rejectedInputs,
    unnecessaryInputs: facts.unnecessaryInputs,
    meanTimingError: Math.round(meanTimingError * 10) / 10,
    splits: facts.splits,
    diagnosis: diagnosisFor(facts, accuracy, efficiency, meanTimingError),
  };
}

/** Positive when candidate is the stronger mastery result. */
export function compareTrainingMetrics(
  candidate: TrainingMetrics,
  current: TrainingMetrics
): number {
  const candidateTuple = [
    candidate.completed ? 1 : 0,
    candidate.accuracy,
    candidate.efficiency,
    candidate.consistency,
    -candidate.ticks,
  ];
  const currentTuple = [
    current.completed ? 1 : 0,
    current.accuracy,
    current.efficiency,
    current.consistency,
    -current.ticks,
  ];
  for (let index = 0; index < candidateTuple.length; index += 1) {
    if (candidateTuple[index] !== currentTuple[index]) {
      return candidateTuple[index] > currentTuple[index] ? 1 : -1;
    }
  }
  return 0;
}

/** Positive when candidate is the stronger persisted/session PB summary. */
export function compareTrainingBests(
  candidate: TrainingBestSummary,
  current: TrainingBestSummary
): number {
  const candidateTuple = [
    candidate.completed ? 1 : 0,
    candidate.accuracy,
    candidate.efficiency,
    candidate.consistency,
    -candidate.ticks,
  ];
  const currentTuple = [
    current.completed ? 1 : 0,
    current.accuracy,
    current.efficiency,
    current.consistency,
    -current.ticks,
  ];
  for (let index = 0; index < candidateTuple.length; index += 1) {
    if (candidateTuple[index] !== currentTuple[index]) {
      return candidateTuple[index] > currentTuple[index] ? 1 : -1;
    }
  }
  return 0;
}

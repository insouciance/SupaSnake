import { compareTrainingBests, compareTrainingMetrics, scoreTrainingAttempt } from '.';
import type { TrainingAttemptFacts } from './types';

const CLEAN: TrainingAttemptFacts = {
  completed: true,
  kind: 'drill',
  exercise: 'trace',
  tickMs: 100,
  ticks: 20,
  optimalTicks: 20,
  progress: 5,
  progressTotal: 5,
  pathMatchedTicks: 20,
  pathObservedTicks: 20,
  rejectedInputs: 0,
  unnecessaryInputs: 0,
  splits: [
    { checkpoint: 5, expectedTick: 5, actualTick: 5, deltaTicks: 0 },
    { checkpoint: 20, expectedTick: 20, actualTick: 20, deltaTicks: 0 },
  ],
};

describe('training scoring', () => {
  it('awards precision before speed and explains clean mastery', () => {
    const result = scoreTrainingAttempt(CLEAN);
    expect(result).toMatchObject({
      completed: true,
      accuracy: 100,
      efficiency: 100,
      consistency: 100,
      rating: 100,
      medal: 'prismatic',
    });
    expect(result.diagnosis).toMatch(/raise the difficulty/i);
  });

  it('caps incomplete attempts below the medal range', () => {
    const result = scoreTrainingAttempt({
      ...CLEAN,
      completed: false,
      progress: 4,
      pathMatchedTicks: 18,
    });
    expect(result.rating).toBeLessThanOrEqual(54);
    expect(result.medal).toBe('none');
    expect(result.diagnosis).toMatch(/finish is close/i);
  });

  it('never medals Sandbox attempts and penalizes rejected inputs', () => {
    const result = scoreTrainingAttempt({
      ...CLEAN,
      kind: 'sandbox',
      rejectedInputs: 2,
    });
    expect(result.medal).toBe('none');
    expect(result.consistency).toBeLessThan(100);
    expect(result.diagnosis).toMatch(/2 inputs were rejected/i);
  });

  it('compares bests lexicographically by completion, accuracy, then efficiency', () => {
    const clean = scoreTrainingAttempt(CLEAN);
    const fastButSloppy = scoreTrainingAttempt({
      ...CLEAN,
      ticks: 18,
      pathMatchedTicks: 16,
      pathObservedTicks: 18,
    });
    const incomplete = scoreTrainingAttempt({ ...CLEAN, completed: false });
    expect(compareTrainingMetrics(clean, fastButSloppy)).toBe(1);
    expect(compareTrainingMetrics(incomplete, clean)).toBe(-1);

    const summary = (metrics: ReturnType<typeof scoreTrainingAttempt>) => ({
      exercise: 'trace' as const,
      difficulty: 'foundation' as const,
      version: 1 as const,
      completed: metrics.completed,
      rating: metrics.rating,
      medal: metrics.medal,
      accuracy: metrics.accuracy,
      efficiency: metrics.efficiency,
      consistency: metrics.consistency,
      ticks: metrics.ticks,
      seed: 'test',
      trace: [],
      updatedAt: '2026-07-24T00:00:00.000Z',
    });
    expect(compareTrainingBests(summary(clean), summary(fastButSloppy))).toBe(1);
    expect(compareTrainingBests(summary(incomplete), summary(clean))).toBe(-1);
  });
});

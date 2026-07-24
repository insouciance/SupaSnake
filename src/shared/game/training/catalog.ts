import type { TrainingExerciseDefinition, TrainingExerciseId } from './types';

export const TRAINING_EXERCISES: Record<TrainingExerciseId, TrainingExerciseDefinition> = {
  trace: {
    id: 'trace',
    name: 'Trace',
    skill: 'Precision',
    summary: 'Hold a clean line through every corner and learn exact turn timing.',
    primaryMetric: 'Path accuracy',
    dynasty: 'PRIMAL',
  },
  route: {
    id: 'route',
    name: 'Route',
    skill: 'Planning',
    summary: 'Collect ordered targets with the shortest practical line.',
    primaryMetric: 'Route efficiency',
    dynasty: 'COSMIC',
  },
  tempo: {
    id: 'tempo',
    name: 'Tempo',
    skill: 'Tempo',
    summary: 'Execute a rehearsed line as the movement window compresses.',
    primaryMetric: 'Timing consistency',
    dynasty: 'CYBER',
  },
  escape: {
    id: 'escape',
    name: 'Escape',
    skill: 'Recovery',
    summary: 'Read a dangerous opening and reach safety before the board closes.',
    primaryMetric: 'Ticks to safety',
    dynasty: 'PRIMAL',
  },
};

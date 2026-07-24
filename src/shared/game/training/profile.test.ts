import type { TrainingProfile } from './types';
import { mergeTrainingProfile, recordVerifiedTrainingAttempt } from './profile';

const SESSION_PROFILE: TrainingProfile = {
  live: false,
  bests: [{
    exercise: 'trace', difficulty: 'foundation', version: 1, completed: true,
    rating: 84, medal: 'silver', accuracy: 92, efficiency: 78,
    consistency: 80, ticks: 40, seed: 'session-best', trace: [],
    updatedAt: '2026-07-24T00:00:00.000Z',
  }],
  recent: [{
    exercise: 'trace', difficulty: 'foundation', rating: 84,
    completed: true, createdAt: '2026-07-24T00:00:00.000Z',
  }],
};

describe('mergeTrainingProfile', () => {
  it('keeps verified session progress when durable storage is unavailable', () => {
    expect(mergeTrainingProfile(SESSION_PROFILE, {
      live: false,
      bests: [],
      recent: [],
    })).toEqual(SESSION_PROFILE);
  });

  it('replaces the session view with an authoritative live snapshot', () => {
    expect(mergeTrainingProfile(SESSION_PROFILE, {
      live: true,
      bests: [],
      recent: [],
    })).toEqual({ live: true, bests: [], recent: [] });
  });

  it('keeps the stronger best and chronological recency across out-of-order responses', () => {
    const weaker = {
      ...SESSION_PROFILE.bests[0],
      completed: false,
      rating: 20,
      accuracy: 20,
      seed: 'weaker',
    };
    const profile = recordVerifiedTrainingAttempt(
      SESSION_PROFILE,
      weaker,
      {
        exercise: 'trace', difficulty: 'foundation', rating: 20,
        completed: false, createdAt: '2026-07-23T23:59:59.000Z',
      },
      false
    );
    expect(profile.bests[0].seed).toBe('session-best');
    expect(profile.recent.map((attempt) => attempt.rating)).toEqual([84, 20]);
  });
});

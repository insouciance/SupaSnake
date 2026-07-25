/**
 * Audience cohorts (WP-0.06, GT §13).
 */

import {
  isExcludedCohort,
  isPlayerCohort,
  isPublicCohort,
  PLAYER_COHORTS,
  PUBLIC_COHORT,
} from './cohort';

describe('player cohorts', () => {
  it('declares exactly the four the migration CHECK permits', () => {
    expect([...PLAYER_COHORTS]).toEqual(['player', 'dev', 'qa', 'fixture']);
  });

  it('accepts only those four', () => {
    for (const cohort of PLAYER_COHORTS) {
      expect(isPlayerCohort(cohort)).toBe(true);
    }
    for (const bogus of ['PLAYER', 'internal', '', null, undefined, 3]) {
      expect(isPlayerCohort(bogus)).toBe(false);
    }
  });
});

describe('what a stranger may be shown', () => {
  it('renders the player cohort', () => {
    expect(PUBLIC_COHORT).toBe('player');
    expect(isPublicCohort('player')).toBe(true);
    expect(isExcludedCohort('player')).toBe(false);
  });

  it('hides dev, QA and fixture accounts', () => {
    for (const cohort of ['dev', 'qa', 'fixture']) {
      expect(isPublicCohort(cohort)).toBe(false);
      expect(isExcludedCohort(cohort)).toBe(true);
    }
  });

  it('treats a missing column as public — the pre-045 release behaviour', () => {
    // Failing closed here would blank every board for the length of a deploy
    // window. The label is an improvement on "show everyone", not a
    // prerequisite for showing anyone.
    expect(isPublicCohort(null)).toBe(true);
    expect(isPublicCohort(undefined)).toBe(true);
  });

  it('hides an unrecognised label rather than assuming it is public', () => {
    expect(isPublicCohort('internal')).toBe(false);
  });
});

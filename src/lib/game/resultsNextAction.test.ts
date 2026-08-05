import {
  RESULTS_NEXT_ACTION_PRIORITY,
  chooseNextAction,
  type ResultsNextActionContext,
} from './resultsNextAction';
import { curriculumInvitation } from '@/shared/game/curriculum';

const base: ResultsNextActionContext = {
  isAnonymous: false,
  extracted: true,
  handleIsGenerated: false,
  isFirstCompletedRun: false,
  codexDiscoveries: 0,
  practice: false,
  impactAction: null,
};

const INVITATION = {
  geneId: 'coilkeeper',
  ...curriculumInvitation('coilkeeper'),
  attentionId: 'attention-1',
};

function ctx(overrides: Partial<ResultsNextActionContext> = {}) {
  return { ...base, ...overrides };
}

describe('chooseNextAction', () => {
  it('always returns exactly one action (Constitution §12.2)', () => {
    const cases: ResultsNextActionContext[] = [
      ctx(),
      ctx({ isAnonymous: true }),
      ctx({ handleIsGenerated: true }),
      ctx({ isFirstCompletedRun: true }),
      ctx({ codexDiscoveries: 3 }),
      ctx({ practice: true }),
      ctx({
        isAnonymous: true,
        handleIsGenerated: true,
        isFirstCompletedRun: true,
        codexDiscoveries: 5,
      }),
    ];
    for (const c of cases) {
      const action = chooseNextAction(c);
      expect(typeof action.id).toBe('string');
      expect(action.label.length).toBeGreaterThan(0);
    }
  });

  it('puts continuity first for a guest who earned something', () => {
    expect(chooseNextAction(ctx({ isAnonymous: true })).id).toBe('save-progress');
  });

  it('does not nag a guest about saving a rewardless practice run', () => {
    expect(
      chooseNextAction(ctx({ isAnonymous: true, practice: true })).id
    ).not.toBe('save-progress');
  });

  it('offers the claim ceremony only after a banked run', () => {
    expect(chooseNextAction(ctx({ handleIsGenerated: true })).id).toBe('claim-handle');
    expect(
      chooseNextAction(ctx({ handleIsGenerated: true, extracted: false })).id
    ).not.toBe('claim-handle');
  });

  it('introduces the Lab on the first completed run', () => {
    expect(chooseNextAction(ctx({ isFirstCompletedRun: true })).id).toBe('visit-lab');
  });

  it('uses the server-authored impact destination after account-integrity actions', () => {
    const action = chooseNextAction(ctx({
      impactAction: {
        headline: 'Review PRIMAL Mastery M4',
        destination: 'mastery',
        artifactRef: 'PRIMAL',
      },
    }));
    expect(action).toEqual({
      id: 'run-impact',
      label: 'Review PRIMAL Mastery M4',
      description: 'Continue in Mastery.',
      href: '/profile#mastery-PRIMAL',
    });
  });

  it('keeps account recovery ahead of a server impact recommendation', () => {
    expect(chooseNextAction(ctx({
      isAnonymous: true,
      impactAction: { headline: 'Review a record', destination: 'records' },
    })).id).toBe('save-progress');
  });

  it('sends a discovering player to Genome Research', () => {
    expect(chooseNextAction(ctx({ codexDiscoveries: 2 }))).toMatchObject({
      id: 'open-codex',
      label: 'Study your discoveries',
      href: '/codex',
    });
  });

  it('routes everything else to the Chronicle (§5)', () => {
    const action = chooseNextAction(ctx());
    expect(action.id).toBe('chronicle');
    expect(action.href).toBe('/profile');
  });

  // -------------------------------------------------------------------
  // Curriculum reveal (WP-D; PEO §5 and §13 rows 11-13)
  // -------------------------------------------------------------------

  it('states the ratified fold order as data, with WP-E’s clan slot reserved', () => {
    expect(RESULTS_NEXT_ACTION_PRIORITY).toEqual([
      'save-progress',
      'claim-handle',
      'clan-reveal',
      'curriculum-reveal',
      'visit-lab',
      'run-impact',
      'open-codex',
      'chronicle',
    ]);
  });

  it('recommends the curriculum reveal above the Lab (§13 row 11)', () => {
    const action = chooseNextAction(
      ctx({ curriculumReveal: INVITATION, isFirstCompletedRun: true })
    );
    expect(action).toEqual({
      id: 'curriculum-reveal',
      label: 'Show me Loop Trap',
      description: 'Read what it changes and what it commits before your next run.',
      href: '/codex',
      attentionId: 'attention-1',
      declineLabel: 'Not now',
    });
  });

  it('says "Not now", never "Later" (§13 row 13)', () => {
    const action = chooseNextAction(ctx({ curriculumReveal: INVITATION }));
    expect(action.declineLabel).toBe('Not now');
    expect(action.declineLabel).not.toMatch(/later/i);
  });

  it('keeps account safety and the claim ceremony ahead of any lesson', () => {
    expect(
      chooseNextAction(ctx({ curriculumReveal: INVITATION, isAnonymous: true })).id
    ).toBe('save-progress');
    expect(
      chooseNextAction(ctx({ curriculumReveal: INVITATION, handleIsGenerated: true })).id
    ).toBe('claim-handle');
  });

  it('outranks a run-impact milestone on the same settlement', () => {
    expect(
      chooseNextAction(
        ctx({
          curriculumReveal: INVITATION,
          impactAction: { headline: 'Review a record', destination: 'records' },
        })
      ).id
    ).toBe('curriculum-reveal');
  });

  it('defers the Gene reveal to WP-E’s clan reveal (§13 row 12)', () => {
    const action = chooseNextAction(
      ctx({
        curriculumReveal: INVITATION,
        clanRevealPending: true,
        isFirstCompletedRun: true,
      })
    );
    expect(action.id).not.toBe('curriculum-reveal');
    expect(action.id).toBe('visit-lab');
  });

  it('never teaches two new systems on one Results (boundary 5)', () => {
    // The fold answers with exactly one action under every combination that
    // could compete, so "at most one new-system recommendation" is structural.
    const lessons = new Set<string>();
    for (const c of [
      ctx({ curriculumReveal: INVITATION }),
      ctx({ curriculumReveal: INVITATION, isFirstCompletedRun: true }),
      ctx({ curriculumReveal: INVITATION, codexDiscoveries: 4 }),
      ctx({
        curriculumReveal: INVITATION,
        impactAction: { headline: 'Review a record', destination: 'records' },
        isFirstCompletedRun: true,
        codexDiscoveries: 2,
      }),
    ]) {
      const action = chooseNextAction(c);
      expect(Object.keys(action)).toContain('id');
      lessons.add(action.id);
    }
    expect(lessons).toEqual(new Set(['curriculum-reveal']));
  });

  it('does not invite a practice run into the curriculum', () => {
    expect(
      chooseNextAction(ctx({ curriculumReveal: INVITATION, practice: true })).id
    ).not.toBe('curriculum-reveal');
  });

  it('carries no decline affordance on any other action', () => {
    for (const c of [
      ctx({ isAnonymous: true }),
      ctx({ handleIsGenerated: true }),
      ctx({ isFirstCompletedRun: true }),
      ctx({ codexDiscoveries: 1 }),
      ctx(),
    ]) {
      expect(chooseNextAction(c).attentionId).toBeUndefined();
    }
  });

  it('behaves exactly as before when no invitation is open (flag off)', () => {
    for (const reveal of [null, undefined]) {
      expect(chooseNextAction(ctx({ curriculumReveal: reveal })).id).toBe('chronicle');
      expect(
        chooseNextAction(ctx({ curriculumReveal: reveal, isFirstCompletedRun: true })).id
      ).toBe('visit-lab');
    }
  });

  it('never recommends a commercial destination (Rule 7)', () => {
    const targets = new Set<string | null>();
    for (const c of [
      ctx(),
      ctx({ isAnonymous: true }),
      ctx({ handleIsGenerated: true }),
      ctx({ isFirstCompletedRun: true }),
      ctx({ codexDiscoveries: 1 }),
    ]) {
      targets.add(chooseNextAction(c).href);
    }
    for (const target of targets) {
      expect(target).not.toBe('/shop');
      expect(target ?? '').not.toMatch(/shop|premium|store|checkout/i);
    }
  });
});

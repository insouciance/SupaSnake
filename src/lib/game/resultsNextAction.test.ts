import {
  chooseNextAction,
  type ResultsNextActionContext,
} from './resultsNextAction';

const base: ResultsNextActionContext = {
  isAnonymous: false,
  extracted: true,
  handleIsGenerated: false,
  isFirstCompletedRun: false,
  codexDiscoveries: 0,
  practice: false,
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

  it('sends a discovering player to the Codex', () => {
    expect(chooseNextAction(ctx({ codexDiscoveries: 2 })).id).toBe('open-codex');
  });

  it('routes everything else to the Chronicle (§5)', () => {
    const action = chooseNextAction(ctx());
    expect(action.id).toBe('chronicle');
    expect(action.href).toBe('/profile');
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

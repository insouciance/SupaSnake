const mockTrackEvent = jest.fn();
const mockSetUserProperties = jest.fn();
let analyticsInitialized = true;

jest.mock('./posthog', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
  setUserProperties: (...args: unknown[]) => mockSetUserProperties(...args),
  isAnalyticsInitialized: () => analyticsInitialized,
}));

import {
  resetCurriculumTelemetryMemory,
  trackCurriculumEligibility,
  trackCurriculumGraduation,
  trackFirstInput,
  trackFirstTerminalResult,
  trackLearningEventResolved,
  trackReferenceOpened,
  trackTrialInvitationAccepted,
  trackTrialInvitationDeclined,
  trackTrialInvitationShown,
  trackTrialOfferShown,
  trackTrialSelected,
} from './curriculum';
import { AnalyticsEvents, EventCategories } from './events';
import { GENOME_V2_ELIGIBILITY_CONTRACT_VERSION } from '@/shared/game/genes';

function lastEvent(): [string, Record<string, unknown>] {
  const call = mockTrackEvent.mock.calls.at(-1);
  return [call?.[0] as string, (call?.[1] ?? {}) as Record<string, unknown>];
}

function fireEveryCurriculumEvent(): void {
  trackFirstInput();
  trackFirstTerminalResult({ end_reason: 'crashed' });
  trackCurriculumEligibility({
    dynasty: 'CYBER',
    eligibleGeneCount: 7,
    rosterSize: 13,
    bankedRuns: 2,
    trialsOpen: true,
    hasTrial: false,
    cohort: 'player',
  });
  trackCurriculumGraduation('CYBER', 13);
  trackTrialInvitationShown('attention-1', 'coilkeeper');
  trackTrialInvitationAccepted('attention-1', 'coilkeeper');
  trackTrialInvitationDeclined('attention-1', 'coilkeeper');
  trackReferenceOpened('attention-1', 'coilkeeper');
  trackTrialSelected('CYBER', 'coilkeeper', false);
  trackTrialOfferShown('coilkeeper', 'offer-1', 'cadence');
  trackLearningEventResolved('session-1', 'coilkeeper');
}

beforeEach(() => {
  mockTrackEvent.mockClear();
  mockSetUserProperties.mockClear();
  analyticsInitialized = true;
  resetCurriculumTelemetryMemory();
});

describe('the curriculum event catalog (TGv2 §11, PEO §9.3)', () => {
  it('covers every metric the two authorities name, through declared events', () => {
    fireEveryCurriculumEvent();
    expect(mockTrackEvent.mock.calls.map((call) => call[0])).toEqual([
      AnalyticsEvents.ONBOARDING_FIRST_INPUT,
      AnalyticsEvents.ONBOARDING_FIRST_RESULT,
      AnalyticsEvents.CURRICULUM_ELIGIBILITY_READ,
      AnalyticsEvents.CURRICULUM_GRADUATED,
      AnalyticsEvents.CURRICULUM_TRIAL_INVITED,
      AnalyticsEvents.CURRICULUM_TRIAL_ACCEPTED,
      AnalyticsEvents.CURRICULUM_TRIAL_DECLINED,
      AnalyticsEvents.CURRICULUM_REFERENCE_OPENED,
      AnalyticsEvents.CURRICULUM_TRIAL_SELECTED,
      AnalyticsEvents.CURRICULUM_TRIAL_OFFERED,
      AnalyticsEvents.CURRICULUM_LEARNING_EVENT_RESOLVED,
    ]);
  });

  it('stamps every event with the curriculum category and contract version', () => {
    fireEveryCurriculumEvent();
    for (const [, properties] of mockTrackEvent.mock.calls) {
      expect(properties).toMatchObject({
        category: EventCategories.CURRICULUM,
        contract_version: GENOME_V2_ELIGIBILITY_CONTRACT_VERSION,
      });
    }
  });

  it('reports the eligibility prefix against its roster, not on its own', () => {
    trackCurriculumEligibility({
      dynasty: 'PRIMAL',
      eligibleGeneCount: 7,
      rosterSize: 13,
      bankedRuns: 0,
      trialsOpen: false,
      hasTrial: false,
      cohort: 'player',
    });
    const [name, properties] = lastEvent();
    expect(name).toBe(AnalyticsEvents.CURRICULUM_ELIGIBILITY_READ);
    // A prefix without a denominator cannot answer "is the curriculum
    // staging anything", and `banked_runs` is what separates a genuinely new
    // account from a veteran credited at backfill (§9.3).
    expect(properties).toMatchObject({
      dynasty: 'PRIMAL',
      eligible_gene_count: 7,
      roster_size: 13,
      banked_runs: 0,
      trials_open: false,
      has_trial: false,
    });
  });

  it('separates a first trial choice from a switch', () => {
    trackTrialSelected('COSMIC', 'phoenix', false);
    expect(lastEvent()[1]).toMatchObject({ gene_id: 'phoenix', switched: false });
    trackTrialSelected('COSMIC', 'coilkeeper', true);
    expect(lastEvent()[1]).toMatchObject({
      gene_id: 'coilkeeper',
      switched: true,
    });
  });
});

describe('consent is the only gate, and it is structural', () => {
  it('captures nothing at all before consent initialises PostHog', () => {
    analyticsInitialized = false;
    fireEveryCurriculumEvent();
    // Every once-guarded beat refuses outright; the unguarded ones reach
    // `trackEvent`, which is itself inert without initialisation. The mock
    // stands in for the real function, so this asserts the guard half here
    // and `posthog.test.ts` asserts the other half.
    expect(trackFirstInput()).toBe(false);
    expect(trackTrialInvitationShown('a', 'coilkeeper')).toBe(false);
    expect(trackReferenceOpened('a', 'coilkeeper')).toBe(false);
    expect(trackTrialOfferShown('coilkeeper', 'o', 'cadence')).toBe(false);
    expect(trackLearningEventResolved('s', 'coilkeeper')).toBe(false);
    expect(trackCurriculumGraduation('CYBER', 13)).toBe(false);
  });

  it('never writes a browser copy of any curriculum fact', () => {
    fireEveryCurriculumEvent();
    // The once-per-lifecycle guards are module memory, exactly like
    // `trackFunnelStageOnce`'s. A durable "already counted" record belongs in
    // the warehouse; here it would be a second curriculum ledger and would
    // fail `verify:constitution`'s local-progress gate (PEO boundary 9).
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('counting each threshold exactly once', () => {
  it('counts the ask once per attention row, however often Results renders', () => {
    expect(trackTrialInvitationShown('attention-1', 'coilkeeper')).toBe(true);
    expect(trackTrialInvitationShown('attention-1', 'coilkeeper')).toBe(false);
    expect(trackTrialInvitationShown('attention-2', 'phoenix')).toBe(true);
    expect(
      mockTrackEvent.mock.calls.filter(
        (call) => call[0] === AnalyticsEvents.CURRICULUM_TRIAL_INVITED
      )
    ).toHaveLength(2);
  });

  it('counts the answer every time, because a player may answer once', () => {
    // Show me / Not now are terminal transitions the server enforces; they are
    // deliberately unguarded so a double answer shows up as the anomaly it is
    // rather than being silently swallowed here.
    trackTrialInvitationAccepted('attention-1', 'coilkeeper');
    trackTrialInvitationAccepted('attention-1', 'coilkeeper');
    expect(
      mockTrackEvent.mock.calls.filter(
        (call) => call[0] === AnalyticsEvents.CURRICULUM_TRIAL_ACCEPTED
      )
    ).toHaveLength(2);
  });

  it('counts one guaranteed appearance per offer, not per render', () => {
    expect(trackTrialOfferShown('coilkeeper', 'offer-1', 'cadence')).toBe(true);
    expect(trackTrialOfferShown('coilkeeper', 'offer-1', 'cadence')).toBe(false);
    expect(trackTrialOfferShown('coilkeeper', 'offer-2', 'portal')).toBe(true);
    expect(lastEvent()[1]).toMatchObject({ offer_source: 'portal' });
  });

  it('counts one promotion per session and Gene', () => {
    expect(trackLearningEventResolved('session-1', 'coilkeeper')).toBe(true);
    expect(trackLearningEventResolved('session-1', 'coilkeeper')).toBe(false);
    expect(trackLearningEventResolved('session-2', 'coilkeeper')).toBe(true);
  });

  it('counts graduation once per Dynasty', () => {
    expect(trackCurriculumGraduation('CYBER', 13)).toBe(true);
    expect(trackCurriculumGraduation('CYBER', 13)).toBe(false);
    expect(trackCurriculumGraduation('PRIMAL', 13)).toBe(true);
  });

  it('counts the two onboarding beats once per page lifecycle', () => {
    expect(trackFirstInput()).toBe(true);
    expect(trackFirstInput()).toBe(false);
    expect(trackFirstTerminalResult()).toBe(true);
    expect(trackFirstTerminalResult()).toBe(false);
    resetCurriculumTelemetryMemory();
    expect(trackFirstInput()).toBe(true);
  });
});

describe('the QA/dev cohort is filterable out of every conclusion', () => {
  it('stamps the person with the cohort the SERVER read', () => {
    trackCurriculumEligibility({
      dynasty: 'CYBER',
      eligibleGeneCount: 7,
      rosterSize: 13,
      bankedRuns: 1,
      trialsOpen: true,
      hasTrial: false,
      cohort: 'qa',
    });
    // A PERSON property, not an event property: an invitation fired later from
    // Results never reads eligibility, and it still has to be excludable.
    expect(mockSetUserProperties).toHaveBeenCalledWith({ player_cohort: 'qa' });
  });

  it('claims no cohort at all when the server did not supply one', () => {
    trackCurriculumEligibility({
      dynasty: 'CYBER',
      eligibleGeneCount: 7,
      rosterSize: 13,
      bankedRuns: 1,
      trialsOpen: true,
      hasTrial: false,
      cohort: null,
    });
    // Guessing 'player' here would quietly re-admit every account the label
    // exists to exclude.
    expect(mockSetUserProperties).not.toHaveBeenCalled();
  });
});

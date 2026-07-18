/**
 * Templated fallback renderer tests (Identity v1 §9.1): the Analyst is
 * feature-complete without OpenAI — every artifact renders specific,
 * numerate text from the same fact sheets, with ≤2 tips.
 */

import {
  ArchetypeFacts,
  buildDigestFacts,
  buildRecallFacts,
  buildRunFacts,
  buildScoutFacts,
} from './facts';
import { renderFallback } from './renderFallback';

const baseArchetypeFacts: ArchetypeFacts = {
  kind: 'archetype',
  seasonSeq: 1,
  earningRuns: 40,
  extractionRatePct: 70,
  medianBankingPortal: 2,
  meanPortalsPassed: 1,
  dnaLostToSalvagePct: 15,
  dynastySharesPct: { PRIMAL: 60, CYBER: 25, COSMIC: 15 },
  masteryLevels: { PRIMAL: 5 },
  meanMutationsHeld: 1,
  offerAcceptPct: 40,
  cyber: { runs: 10, tier4Pct: 0, tier4Banked: 0 },
  rhythm: { weeksActive: 5, seasonWeeks: 7, fiveDayWeeks: 2, fiveDayWeekSharePct: 29 },
  contractCompletionPct: 60,
};

describe('renderFallback', () => {
  it('run insight (crash): names the cause and the banking upside', () => {
    const content = renderFallback(
      buildRunFacts({
        session: {
          id: 's1', dynasty: 'PRIMAL', score: 300, dnaEarned: 180,
          durationSeconds: 120, foodsCollected: 24, extracted: false,
          died: true, deathCause: 'wall', isFreePlay: false, anomalyId: null,
        },
        runEvents: { v: 1, events: [{ t: 10, e: 'p', k: 'pass' }], truncated: false, suspect: false },
        economy: null,
        mutationPicks: [],
        recentSessions: [],
      })
    );
    expect(content.headline).toContain('wall');
    expect(content.body).toContain('180 DNA');
    expect(content.body).toContain('195 DNA'); // the missed bank
    expect(content.tips.length).toBeLessThanOrEqual(2);
  });

  it('run insight (extraction): celebrates the bank', () => {
    const content = renderFallback(
      buildRunFacts({
        session: {
          id: 's1', dynasty: 'CYBER', score: 500, dnaEarned: 375,
          durationSeconds: 100, foodsCollected: 30, extracted: true,
          died: false, deathCause: 'extracted', isFreePlay: false, anomalyId: null,
        },
        runEvents: null,
        economy: null,
        mutationPicks: [],
        recentSessions: [],
      })
    );
    expect(content.headline.toLowerCase()).toContain('banked');
    expect(content.body).toContain('375 DNA');
  });

  it('weekly digest: renders totals and never more than 2 tips', () => {
    const content = renderFallback(
      buildDigestFacts({
        weekStart: '2026-07-06',
        sessions: [
          { dynasty: 'PRIMAL', dnaEarned: 100, score: 200, extracted: true, died: false, foodsCollected: 20, durationSeconds: 100, deathCause: null, endedAt: '2026-07-06T10:00:00Z' },
        ],
        contracts: { completed: 3, claimed: 3 },
        streak: { current: 5 },
        recordsAdvanced: [{ name: 'The Vault', tier: 1 }],
      })
    );
    expect(content.headline).toContain('100 DNA');
    expect(content.body).toContain('The Vault');
    expect(content.tips.length).toBeLessThanOrEqual(2);
  });

  it('weekly digest: empty week gets a forward-looking line', () => {
    const content = renderFallback(
      buildDigestFacts({
        weekStart: '2026-07-06',
        sessions: [],
        contracts: null,
        streak: null,
        recordsAdvanced: [],
      })
    );
    expect(content.headline).toBeTruthy();
    expect(content.body).toBeTruthy();
  });

  it('archetype: badge id for a detected archetype, none for Hatchling', () => {
    const surgeon = renderFallback({
      ...baseArchetypeFacts,
      extractionRatePct: 70,
      medianBankingPortal: 2,
    });
    expect(surgeon.headline).toBe('The Surgeon');
    expect(surgeon.badge).toBe('archetype_surgeon');

    const hatchling = renderFallback({ ...baseArchetypeFacts, earningRuns: 5 });
    expect(hatchling.headline).toBe('The Hatchling');
    expect(hatchling.badge).toBeUndefined();
  });

  it('season recall: totals, dynasty home and clan line', () => {
    const content = renderFallback(
      buildRecallFacts({
        seasonSeq: 1,
        seasonName: 'Solstice',
        runs: [
          { dynasty: 'PRIMAL', dnaEarned: 300, score: 500, extracted: true, endedAt: '2026-07-21T10:00:00Z' },
        ],
        variantsAcquired: 3,
        masteryLevels: {},
        badgesEarned: [],
        clan: { name: 'Coilers', tag: 'COIL', duelWins: 4, duelLosses: 1, champion: true },
        archetype: 'surgeon',
      })
    );
    expect(content.headline).toContain('Season 1');
    expect(content.body).toContain('300 DNA');
    expect(content.body).toContain('The Surgeon');
    expect(content.body).toContain('championship');
  });

  it('scouting brief: roster depth and pick habits', () => {
    const content = renderFallback(
      buildScoutFacts({
        weekStart: '2026-07-20',
        opponent: { name: 'Vipers', tag: 'VIP', rating: 1230 },
        scouting: {
          roster: [{ name: 'a', mastery: { CYBER: { level: 7 } } }],
          lastPicks: [
            { weekStart: '2026-07-13', dynasty: 'CYBER', dynasty2: null, modifier: null, ban: 'phoenix' },
            { weekStart: '2026-07-06', dynasty: 'CYBER', dynasty2: null, modifier: null, ban: null },
          ],
          detail: true,
        },
      })
    );
    expect(content.headline).toContain('Vipers');
    expect(content.body).toContain('CYBER');
    expect(content.tips.length).toBeLessThanOrEqual(2);
  });
});

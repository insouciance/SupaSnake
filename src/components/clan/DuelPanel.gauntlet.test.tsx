/**
 * DuelPanel gauntlet evolution (Design v2 section 8) - render states for
 * the gauntlet block on the duel payload: rivalry record + revenge badge
 * (PAIRED), picks-open hint, effective-rules banner with the counted-runs
 * indicator + ban lines (LOCKED/ACTIVE), and full pre-020 silence when the
 * block is absent.
 */

import { render, screen, waitFor } from '@testing-library/react';
import {
  DuelPanel,
  modifierName,
  mutationName,
  type DuelData,
  type DuelGauntlet,
} from './DuelPanel';

function mockFetchResponse(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3600_000).toISOString();
}

function gauntletBlock(overrides: Partial<DuelGauntlet> = {}): DuelGauntlet {
  return {
    phase: 'scoring',
    picksDeadline: futureIso(-30),
    windowFrom: futureIso(-10),
    windowTo: futureIso(80),
    revealed: true,
    myPicks: { dynasty: 'CYBER', ban: 'shed' },
    theirPicks: { dynasty: 'PRIMAL', ban: 'phoenix' },
    myRules: {
      dynasty: 'CYBER',
      dynasty2: null,
      modifier: 'vanguard',
      topMembers: 8,
      bestRuns: 31,
      weight: 1.1,
      extractedOnly: false,
      banned: 'phoenix',
    },
    theirRules: {
      dynasty: 'PRIMAL',
      dynasty2: null,
      modifier: null,
      topMembers: 10,
      bestRuns: 30,
      weight: 1,
      extractedOnly: false,
      banned: 'shed',
    },
    rivalry: { wins: 2, losses: 1, ties: 0, meetings: 3, lastWinnerMe: true },
    revenge: true,
    ...overrides,
  };
}

function duelData(gauntlet: DuelGauntlet | null): DuelData {
  return {
    duel: {
      weekStart: '2026-07-13',
      status: 'active',
      isBye: false,
      opponent: { name: 'Dragon Lords', tag: 'DRAG', rating: 990 },
      myScore: 4200,
      theirScore: 2100,
      endsAt: futureIso(50),
      myTopContributors: [{ name: 'viper', dna: 2400 }],
      gauntlet,
    },
    rating: 1010,
    record: { wins: 3, losses: 1 },
    lastWeek: null,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('name helpers', () => {
  it('maps modifier and mutation ids to display names', () => {
    expect(modifierName('vanguard')).toBe('Vanguard');
    expect(modifierName('extraction_doctrine')).toBe('Extraction Doctrine');
    expect(modifierName(null)).toBeNull();
    expect(mutationName('phoenix')).toBe('Phoenix');
    expect(mutationName(null)).toBeNull();
  });
});

describe('DuelPanel gauntlet states', () => {
  it('PRE-020 (no gauntlet block): none of the gauntlet UI renders', async () => {
    mockFetchResponse(200, duelData(null));
    render(<DuelPanel accessToken="token" />);
    await waitFor(() => expect(screen.getByTestId('duel-active')).toBeInTheDocument());

    expect(screen.queryByTestId('rivalry-record')).not.toBeInTheDocument();
    expect(screen.queryByTestId('revenge-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gauntlet-rules-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gauntlet-picks-open-hint')).not.toBeInTheDocument();
    // Legacy footer keeps the v1 copy
    expect(screen.getByTestId('counted-rules-footer')).toHaveTextContent('Top 10 members');
    expect(screen.getByTestId('counted-rules-footer')).toHaveTextContent('best 30 runs');
  });

  it('PAIRED: shows the rivalry record and the revenge badge', async () => {
    mockFetchResponse(200, duelData(gauntletBlock()));
    render(<DuelPanel accessToken="token" />);
    await waitFor(() => expect(screen.getByTestId('rivalry-record')).toBeInTheDocument());

    expect(screen.getByTestId('rivalry-record')).toHaveTextContent('Rivalry 2W-1L');
    expect(screen.getByTestId('revenge-badge')).toHaveTextContent('Revenge match');
  });

  it('PICKS OPEN: shows the blind-lock hint, no rules banner yet', async () => {
    mockFetchResponse(
      200,
      duelData(
        gauntletBlock({
          phase: 'picks_open',
          revealed: false,
          myRules: null,
          theirRules: null,
          theirPicks: null,
          revenge: false,
        })
      )
    );
    render(<DuelPanel accessToken="token" />);
    await waitFor(() =>
      expect(screen.getByTestId('gauntlet-picks-open-hint')).toBeInTheDocument()
    );

    expect(screen.getByTestId('gauntlet-picks-open-hint')).toHaveTextContent('Wednesday 00:00 UTC');
    expect(screen.queryByTestId('gauntlet-rules-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('revenge-badge')).not.toBeInTheDocument();
  });

  it('ACTIVE: rules banner shows dynasty, lens, window and both ban directions', async () => {
    mockFetchResponse(200, duelData(gauntletBlock()));
    render(<DuelPanel accessToken="token" />);
    await waitFor(() =>
      expect(screen.getByTestId('gauntlet-rules-banner')).toBeInTheDocument()
    );

    const banner = screen.getByTestId('gauntlet-rules-banner');
    expect(banner).toHaveTextContent('CYBER');
    expect(banner).toHaveTextContent('Thu–Sun only');
    expect(banner).toHaveTextContent('best 31 runs');
    expect(banner).toHaveTextContent('top 8 members');
    expect(banner).toHaveTextContent('Vanguard');
    expect(screen.getByTestId('gauntlet-ban-received')).toHaveTextContent(
      'Phoenix is banned from your offer pools'
    );
    expect(screen.getByTestId('gauntlet-ban-given')).toHaveTextContent(
      'You banned Shed from Dragon Lords'
    );
    // The contributors footer reflects the effective lens (+1 node baked in)
    expect(screen.getByTestId('counted-rules-footer')).toHaveTextContent(
      'Top 8 members count · best 31 runs each · Thu-Sun window'
    );
  });

  it('neutral side (never picked): banner counts any dynasty', async () => {
    mockFetchResponse(
      200,
      duelData(
        gauntletBlock({
          myPicks: null,
          myRules: {
            dynasty: null,
            dynasty2: null,
            modifier: null,
            topMembers: 10,
            bestRuns: 30,
            weight: 1,
            extractedOnly: false,
            banned: null,
          },
          theirRules: null,
          revenge: false,
          rivalry: null,
        })
      )
    );
    render(<DuelPanel accessToken="token" />);
    await waitFor(() =>
      expect(screen.getByTestId('gauntlet-rules-banner')).toBeInTheDocument()
    );

    expect(screen.getByTestId('gauntlet-rules-banner')).toHaveTextContent('Any dynasty');
    expect(screen.queryByTestId('gauntlet-ban-received')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gauntlet-ban-given')).not.toBeInTheDocument();
  });

  it('dynasty split pick renders both dynasties', async () => {
    mockFetchResponse(
      200,
      duelData(
        gauntletBlock({
          myRules: {
            dynasty: 'CYBER',
            dynasty2: 'PRIMAL',
            modifier: null,
            topMembers: 10,
            bestRuns: 30,
            weight: 1,
            extractedOnly: false,
            banned: null,
          },
        })
      )
    );
    render(<DuelPanel accessToken="token" />);
    await waitFor(() =>
      expect(screen.getByTestId('gauntlet-rules-banner')).toBeInTheDocument()
    );
    expect(screen.getByTestId('gauntlet-rules-banner')).toHaveTextContent('CYBER + PRIMAL');
  });
});

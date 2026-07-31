import { render, screen, waitFor } from '@testing-library/react';
import { EnergyBattlePanel } from './EnergyBattlePanel';

const mockFetch = jest.fn();
const mockUseRecognitionSeen = jest.fn();

jest.mock('@/components/ui/useRecognitionSeen', () => ({
  useRecognitionSeen: (...args: unknown[]) => mockUseRecognitionSeen(...args),
}));

describe('EnergyBattlePanel', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockUseRecognitionSeen.mockReset();
    global.fetch = mockFetch as typeof fetch;
  });

  it('shows aggregate sides and only the viewer’s five contribution details', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        live: true,
        active: true,
        eligible: true,
        cycle: {
          phase: 'active',
          endsAt: '2099-07-30T00:00:00.000Z',
          intermissionEndsAt: '2099-07-31T00:00:00.000Z',
        },
        clan: { name: 'Fang Collective', tag: 'FANG' },
        team: { score: 12_400, outcome: 'pending' },
        opponent: {
          clan: { name: 'Coil Order', tag: 'COIL' },
          score: 11_900,
          outcome: 'pending',
        },
        honors: { total: 2, victories: 1, stalemates: 0, participations: 1 },
        rewardHistory: [
          {
            id: 'reward-1',
            artifactRef: 'battle-reward:reward-1',
            type: 'battle',
            clan: { name: 'Fang Collective', tag: 'FANG' },
            cycleIndex: 3,
            rewardKind: 'victor',
            outcome: 'victor',
            participationDna: 100,
            bonusDna: 100,
            amount: 200,
            countedDepth: 6_200,
            eligibleRunCount: 7,
            countedRunCount: 5,
            awardedAt: '2026-08-11T01:00:00.000Z',
          },
        ],
        you: {
          topFive: [
            {
              sessionId: 'session-1',
              score: 2_500,
              energyCommitted: 6,
              generation: 11,
              rank: 1,
            },
            {
              sessionId: 'session-2',
              score: 2_100,
              energyCommitted: 3,
              generation: 10,
              rank: 2,
            },
            {
              sessionId: 'session-3',
              score: 1_800,
              energyCommitted: 2,
              generation: 10,
              rank: 3,
            },
            {
              sessionId: 'session-4',
              score: 1_400,
              energyCommitted: 1,
              generation: 10,
              rank: 4,
            },
            {
              sessionId: 'session-5',
              score: 1_100,
              energyCommitted: 1,
              generation: 10,
              rank: 5,
            },
          ],
          fifthBest: 1_100,
          scoreToImprove: 1_101,
          contribution: 3_600,
        },
      }),
    });

    render(<EnergyBattlePanel accessToken="token" />);

    expect(await screen.findByText('Three-day battle active')).toBeInTheDocument();
    expect(screen.getByText('12,400')).toBeInTheDocument();
    expect(screen.getByText('11,900')).toBeInTheDocument();
    expect(screen.getByText('Beat 1,100 Yield')).toBeInTheDocument();
    expect(screen.getByText('#1 · 6E · Gen 11')).toBeInTheDocument();
    expect(screen.getByText('#5 · 1E · Gen 10')).toBeInTheDocument();
    expect(screen.getByText('Secured battle rewards')).toBeInTheDocument();
    expect(screen.getByText('+200 DNA')).toBeInTheDocument();
    expect(screen.getByText(/100 participation \+ 100 outcome bonus/)).toBeInTheDocument();
    expect(document.getElementById('clan-run-battle-reward-reward-1')).not.toBeNull();
    expect(screen.queryByText(/member attempts/i)).not.toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/clan/energy-battle', {
      cache: 'no-store',
      headers: { Authorization: 'Bearer token' },
    });
  });

  it('explains that switching clans cannot redirect the current cycle', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        live: true,
        active: true,
        eligible: false,
        reason: 'cycle_locked_to_previous_clan',
        cycle: {
          phase: 'active',
          endsAt: '2099-07-30T00:00:00.000Z',
          intermissionEndsAt: '2099-07-31T00:00:00.000Z',
        },
        team: { score: 0, outcome: 'pending' },
        you: { topFive: [], fifthBest: 0, scoreToImprove: 0, contribution: 0 },
      }),
    });

    render(<EnergyBattlePanel accessToken="token" />);

    expect(
      await screen.findByText(/this cycle remains attached to your previous clan/i)
    ).toBeInTheDocument();
  });

  it('keeps settled receipts visible during intermission and marks only rendered artifacts seen', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        live: false,
        active: false,
        cycle: {
          phase: 'intermission',
          intermissionEndsAt: '2099-07-31T00:00:00.000Z',
        },
        rewardHistory: [
          {
            id: 'reward-1',
            artifactRef: 'battle-reward:reward-1',
            type: 'battle',
            cycleIndex: 4,
            rewardKind: 'victor',
            outcome: 'victor',
            participationDna: 100,
            bonusDna: 100,
            amount: 200,
            countedDepth: 8_200,
            countedRunCount: 5,
            awardedAt: '2026-08-14T01:00:00.000Z',
          },
          {
            id: 'reward-2',
            artifactRef: 'battle-reward:reward-2',
            type: 'battle',
            cycleIndex: 3,
            rewardKind: 'participation',
            outcome: 'defeated',
            participationDna: 100,
            bonusDna: 0,
            amount: 100,
            countedDepth: 5_200,
            countedRunCount: 4,
            awardedAt: '2026-08-10T01:00:00.000Z',
          },
          {
            id: 'reward-3',
            artifactRef: 'battle-reward:reward-3',
            type: 'battle',
            cycleIndex: 2,
            rewardKind: 'stalemate',
            outcome: 'stalemate',
            participationDna: 100,
            bonusDna: 50,
            amount: 150,
            countedDepth: 4_600,
            countedRunCount: 3,
            awardedAt: '2026-08-06T01:00:00.000Z',
          },
        ],
        you: {
          topFive: [
            {
              sessionId: 'hidden-session',
              score: 2_500,
              energyCommitted: 6,
              generation: 11,
              rank: 1,
            },
          ],
          fifthBest: 0,
          scoreToImprove: 0,
          contribution: 2_500,
        },
      }),
    });

    render(<EnergyBattlePanel accessToken="token" compact />);

    expect(await screen.findByText('Results secured')).toBeInTheDocument();
    expect(screen.getByText('+200 DNA')).toBeInTheDocument();
    expect(screen.getByText('+100 DNA')).toBeInTheDocument();
    expect(screen.queryByText('+150 DNA')).not.toBeInTheDocument();
    expect(mockUseRecognitionSeen).toHaveBeenLastCalledWith('clan', true, 'token', {
      artifactRefs: ['battle-reward:reward-1', 'battle-reward:reward-2'],
    });
  });

  it('does not clear recognition while the battle infrastructure is unavailable', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        live: false,
        active: false,
        reason: 'not_deployed',
        rewardHistory: [
          {
            id: 'reward-hidden',
            artifactRef: 'battle-reward:reward-hidden',
            type: 'battle',
            cycleIndex: 1,
            amount: 100,
            countedDepth: 1_000,
            countedRunCount: 1,
            awardedAt: '2026-08-01T01:00:00.000Z',
          },
        ],
      }),
    });

    const { container } = render(<EnergyBattlePanel accessToken="token" />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(mockUseRecognitionSeen).toHaveBeenLastCalledWith('clan', false, 'token', {
      artifactRefs: ['battle-reward:reward-hidden'],
    });
  });
});

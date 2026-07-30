import { render, screen } from '@testing-library/react';
import { EnergyBattlePanel } from './EnergyBattlePanel';

const mockFetch = jest.fn();

describe('EnergyBattlePanel', () => {
  beforeEach(() => {
    mockFetch.mockReset();
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
    expect(screen.queryByText(/member attempts/i)).not.toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/clan/energy-battle', {
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
});

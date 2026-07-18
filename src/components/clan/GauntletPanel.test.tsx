/**
 * GauntletPanel tests (Design v2 section 8) - war-room pick states
 * (officer form / member wait / locked blind picks / revealed picks +
 * scouting), the research tree node states + tithe cap indicator, and
 * pre-migration-020 silence ({ live: false } hides the panel entirely).
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  GauntletPanel,
  availableModifiers,
  nodeState,
  type GauntletData,
} from './GauntletPanel';
import { RESEARCH_NODES, researchNode } from '@/shared/game/gauntlet';

function mockFetch(getBody: unknown, postBody?: unknown, postStatus = 200) {
  global.fetch = jest.fn().mockImplementation(async (_url, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return {
        ok: postStatus >= 200 && postStatus < 300,
        status: postStatus,
        json: async () => postBody ?? { success: true, result: null },
      };
    }
    return { ok: true, status: 200, json: async () => getBody };
  }) as unknown as typeof fetch;
}

function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3600_000).toISOString();
}

function liveData(overrides: Partial<GauntletData> = {}): GauntletData {
  return {
    live: true,
    isOfficer: true,
    research: {
      pool: 7000,
      target: 'protocols_2',
      unlocked: [{ nodeId: 'protocols_1', unlockedAt: '2026-07-01T00:00:00Z' }],
      titheCap: 500,
      myTitheThisWeek: 200,
      recentTithes: [{ name: 'viper', amount: 500, weekStart: '2026-07-13' }],
    },
    gauntlet: {
      phase: 'picks_open',
      picksDeadline: futureIso(30),
      revealed: false,
      opponent: { name: 'Dragon Lords', tag: 'DRAG', rating: 990 },
      myPicks: null,
      theirPicks: null,
      scouting: {
        roster: [
          { name: 'drago', mastery: { CYBER: { level: 4 }, PRIMAL: { level: 1 } } },
        ],
        lastPicks: [
          { weekStart: '2026-07-06', dynasty: 'CYBER', dynasty2: null, modifier: 'vanguard', ban: 'shed' },
        ],
        detail: false,
      },
    },
    ...overrides,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('availableModifiers', () => {
  it('base three are always available; research options gate on nodes', () => {
    const options = availableModifiers([]);
    const byId = new Map(options.map((o) => [o.id, o]));
    expect(byId.get('vanguard')!.locked).toBe(false);
    expect(byId.get('deep_bench')!.locked).toBe(false);
    expect(byId.get('extraction_doctrine')!.locked).toBe(false);
    expect(byId.get('sudden_death')!.locked).toBe(true);
    expect(byId.get('anomaly_doctrine')!.locked).toBe(true);
  });

  it('protocols_2 unlocks sudden_death; anomaly stays gated on the board', () => {
    const options = availableModifiers(['protocols_1', 'protocols_2']);
    const byId = new Map(options.map((o) => [o.id, o]));
    expect(byId.get('sudden_death')!.locked).toBe(false);
    expect(byId.get('anomaly_doctrine')!.locked).toBe(true);
    expect(byId.get('anomaly_doctrine')!.reason).toContain('Anomaly board');
  });
});

describe('nodeState', () => {
  const research = {
    target: 'protocols_2',
    unlocked: [{ nodeId: 'protocols_1', unlockedAt: '' }],
  };

  it('walks unlocked -> target -> available -> locked along a branch', () => {
    expect(nodeState(researchNode('protocols_1'), research)).toBe('unlocked');
    expect(nodeState(researchNode('protocols_2'), research)).toBe('target');
    expect(nodeState(researchNode('protocols_3'), research)).toBe('locked'); // prereq 2 not unlocked
    expect(nodeState(researchNode('logistics_1'), research)).toBe('available'); // tier 1
    expect(nodeState(researchNode('logistics_2'), research)).toBe('locked');
  });
});

describe('GauntletPanel render states', () => {
  it('PRE-020: { live: false } hides the panel entirely', async () => {
    mockFetch({ live: false, research: null, gauntlet: null });
    const { container } = render(<GauntletPanel accessToken="token" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="gauntlet-panel"]')).toBeNull();
  });

  it('PICKS OPEN + officer: renders the blind pick form', async () => {
    mockFetch(liveData());
    render(<GauntletPanel accessToken="token" />);
    await waitFor(() => expect(screen.getByTestId('gauntlet-pick-form')).toBeInTheDocument());

    expect(screen.getByTestId('dynasty-pick-PRIMAL')).toBeInTheDocument();
    expect(screen.getByTestId('dynasty-pick-CYBER')).toBeInTheDocument();
    expect(screen.getByTestId('dynasty-pick-COSMIC')).toBeInTheDocument();
    expect(screen.getByTestId('modifier-select')).toBeInTheDocument();
    expect(screen.getByTestId('ban-select')).toBeInTheDocument();
    expect(screen.getByTestId('submit-picks')).toHaveTextContent('Lock picks');
  });

  it('PICKS OPEN + member: shows the wait copy instead of the form', async () => {
    mockFetch(liveData({ isOfficer: false }));
    render(<GauntletPanel accessToken="token" />);
    await waitFor(() => expect(screen.getByTestId('gauntlet-member-wait')).toBeInTheDocument());
    expect(screen.getByTestId('gauntlet-member-wait')).toHaveTextContent('Wednesday 00:00 UTC');
    expect(screen.queryByTestId('gauntlet-pick-form')).not.toBeInTheDocument();
  });

  it('submitting picks posts the pick and requires a dynasty first', async () => {
    mockFetch(liveData());
    render(<GauntletPanel accessToken="token" />);
    await waitFor(() => expect(screen.getByTestId('gauntlet-pick-form')).toBeInTheDocument());

    // No dynasty picked yet -> local validation error, no POST
    fireEvent.click(screen.getByTestId('submit-picks'));
    expect(screen.getByTestId('gauntlet-error')).toHaveTextContent('Pick a dynasty');

    fireEvent.click(screen.getByTestId('dynasty-pick-CYBER'));
    fireEvent.change(screen.getByTestId('modifier-select'), { target: { value: 'vanguard' } });
    fireEvent.change(screen.getByTestId('ban-select'), { target: { value: 'phoenix' } });
    fireEvent.click(screen.getByTestId('submit-picks'));

    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST'
      );
      expect(calls).toHaveLength(1);
      expect(JSON.parse((calls[0][1] as RequestInit).body as string)).toEqual({
        action: 'submit_picks',
        dynasty: 'CYBER',
        modifier: 'vanguard',
        ban: 'phoenix',
      });
    });
  });

  it('LOCKED own picks render blind; revealed opponent picks render after Wed', async () => {
    const data = liveData();
    data.gauntlet = {
      ...data.gauntlet!,
      phase: 'scoring',
      revealed: true,
      myPicks: { dynasty: 'CYBER', dynasty2: null, modifier: 'vanguard', ban: 'phoenix' },
      theirPicks: { dynasty: 'PRIMAL', dynasty2: null, modifier: null, ban: 'shed' },
    };
    mockFetch(data);
    render(<GauntletPanel accessToken="token" />);
    await waitFor(() => expect(screen.getByTestId('gauntlet-my-picks')).toBeInTheDocument());

    expect(screen.getByTestId('gauntlet-my-picks')).toHaveTextContent('CYBER');
    expect(screen.getByTestId('gauntlet-my-picks')).toHaveTextContent('Vanguard');
    expect(screen.getByTestId('gauntlet-their-picks')).toHaveTextContent('PRIMAL');
    expect(screen.getByTestId('gauntlet-their-picks')).toHaveTextContent('banned vs us: Shed');
    expect(screen.queryByTestId('gauntlet-pick-form')).not.toBeInTheDocument();
  });

  it('scouting shows the opponent roster with mastery levels and last picks', async () => {
    mockFetch(liveData());
    render(<GauntletPanel accessToken="token" />);
    await waitFor(() => expect(screen.getByTestId('gauntlet-scouting')).toBeInTheDocument());

    expect(screen.getByTestId('gauntlet-scouting')).toHaveTextContent('drago');
    expect(screen.getByTestId('gauntlet-scouting')).toHaveTextContent('CYB M4');
    expect(screen.getByTestId('gauntlet-last-picks')).toHaveTextContent('CYBER (Vanguard)');
  });

  it('research tree renders all 12 nodes with their states', async () => {
    mockFetch(liveData());
    render(<GauntletPanel accessToken="token" />);
    await waitFor(() => expect(screen.getByTestId('gauntlet-research')).toBeInTheDocument());

    for (const node of RESEARCH_NODES) {
      expect(screen.getByTestId(`research-node-${node.id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('research-node-protocols_1')).toHaveAttribute('data-state', 'unlocked');
    expect(screen.getByTestId('research-node-protocols_2')).toHaveAttribute('data-state', 'target');
    expect(screen.getByTestId('research-node-protocols_3')).toHaveAttribute('data-state', 'locked');
    expect(screen.getByTestId('research-node-logistics_1')).toHaveAttribute('data-state', 'available');
    // Target progress bar: 7000 pooled / 14000 cost
    expect(screen.getByTestId('research-progress-protocols_2')).toHaveTextContent('7,000 / 14,000');
  });

  it('officers can set an available node as the research target', async () => {
    mockFetch(liveData(), { success: true, result: { target: 'logistics_1', unlocked_node: null } });
    render(<GauntletPanel accessToken="token" />);
    await waitFor(() => expect(screen.getByTestId('set-target-logistics_1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('set-target-logistics_1'));
    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST'
      );
      expect(JSON.parse((calls[0][1] as RequestInit).body as string)).toEqual({
        action: 'set_target',
        nodeId: 'logistics_1',
      });
    });
  });

  it('members see no target buttons', async () => {
    mockFetch(liveData({ isOfficer: false }));
    render(<GauntletPanel accessToken="token" />);
    await waitFor(() => expect(screen.getByTestId('gauntlet-research')).toBeInTheDocument());
    expect(screen.queryByTestId('set-target-logistics_1')).not.toBeInTheDocument();
  });

  it('tithe form shows the weekly cap indicator and posts the amount', async () => {
    mockFetch(liveData(), {
      success: true,
      result: { dna: 900, tithed_this_week: 300, remaining_cap: 200, pool: 7100, unlocked_node: null },
    });
    render(<GauntletPanel accessToken="token" />);
    await waitFor(() => expect(screen.getByTestId('tithe-form')).toBeInTheDocument());

    expect(screen.getByTestId('tithe-cap-indicator')).toHaveTextContent('200/500 this week');

    fireEvent.change(screen.getByTestId('tithe-input'), { target: { value: '100' } });
    fireEvent.click(screen.getByTestId('tithe-submit'));

    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST'
      );
      expect(JSON.parse((calls[0][1] as RequestInit).body as string)).toEqual({
        action: 'tithe',
        amount: 100,
      });
    });
  });

  it('cap reached: tithe input + button disabled', async () => {
    const data = liveData();
    data.research = { ...data.research!, myTitheThisWeek: 500 };
    mockFetch(data);
    render(<GauntletPanel accessToken="token" />);
    await waitFor(() => expect(screen.getByTestId('tithe-form')).toBeInTheDocument());

    expect(screen.getByTestId('tithe-cap-indicator')).toHaveTextContent('cap reached');
    expect(screen.getByTestId('tithe-input')).toBeDisabled();
    expect(screen.getByTestId('tithe-submit')).toBeDisabled();
  });

  it('renders the contribution history', async () => {
    mockFetch(liveData());
    render(<GauntletPanel accessToken="token" />);
    await waitFor(() => expect(screen.getByTestId('tithe-history')).toBeInTheDocument());
    expect(screen.getByTestId('tithe-history')).toHaveTextContent('viper');
    expect(screen.getByTestId('tithe-history')).toHaveTextContent('500');
  });

  it('a POST error surfaces the API message (e.g. tithe cap)', async () => {
    mockFetch(liveData(), { error: 'Weekly tithe cap reached (500 DNA per member per week)', code: 'TITHE_CAP_EXCEEDED' }, 400);
    render(<GauntletPanel accessToken="token" />);
    await waitFor(() => expect(screen.getByTestId('tithe-form')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('tithe-input'), { target: { value: '300' } });
    fireEvent.click(screen.getByTestId('tithe-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('gauntlet-error')).toHaveTextContent('Weekly tithe cap reached')
    );
  });
});

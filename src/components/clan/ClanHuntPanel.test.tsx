/**
 * The clan hunt panel (§9.2–9.4): the N = 1 reading, the rival-less reading,
 * and the flag-off reading.
 *
 * §9.4 makes the self-referential primary the load-bearing block and the rival
 * a layer on top, and that ordering is what makes a clan of one work. So the
 * assertions here are mostly about what survives when everything optional is
 * removed: one member, no rival, no settled week, no laurels.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import { ClanHuntPanel, primarySentence } from './ClanHuntPanel';
import { emptyClanHuntPanel, type ClanHuntPanel as Data } from '@/lib/server/clanHunt';

function liveData(overrides: Partial<Data> = {}): Data {
  return {
    ...emptyClanHuntPanel(),
    live: true,
    clan: {
      id: 'c1',
      name: 'Lone Coil',
      tag: 'LC',
      bannerId: null,
      emblemId: null,
      colorPrimary: null,
      colorSecondary: null,
      memberCount: 1,
      maxMembers: 20,
      softFullMembers: 20,
      inviteCode: 'ABCD1234',
      disbandedAt: null,
    },
    you: { role: 'owner', joinedAt: '2026-07-20T00:00:00Z', tenureSince: '2026-07-20T00:00:00Z' },
    week: {
      id: 'w1',
      weekStart: '2026-07-27',
      startsAt: '2026-07-27T00:00:00.000Z',
      endsAt: '2026-08-03T00:00:00.000Z',
    },
    ...overrides,
  };
}

describe('flag off / no hunt yet', () => {
  it('renders the off state from a live:false body rather than an error', () => {
    render(<ClanHuntPanel data={emptyClanHuntPanel()} />);

    expect(screen.getByTestId('clan-hunt-panel-off')).toBeInTheDocument();
    expect(screen.queryByTestId('clan-hunt-panel')).not.toBeInTheDocument();
    expect(screen.getByText(/not surfacing yet/i)).toBeInTheDocument();
  });

  it('describes what the clan will do rather than what it lacks', () => {
    render(<ClanHuntPanel data={emptyClanHuntPanel()} />);
    expect(
      screen.getByText(/its Depth is read against its own best week/i)
    ).toBeInTheDocument();
  });

  it('renders the off state when the fetch answers live:false', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => emptyClanHuntPanel() });

    render(<ClanHuntPanel accessToken="token" />);

    await waitFor(() =>
      expect(screen.getByTestId('clan-hunt-panel-off')).toBeInTheDocument()
    );
  });

  it('renders the off state rather than a number when the read fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

    render(<ClanHuntPanel accessToken="token" />);

    await waitFor(() =>
      expect(screen.getByTestId('clan-hunt-panel-off')).toBeInTheDocument()
    );
  });
});

describe('N = 1: a clan of one, first week, no rival, nothing settled', () => {
  const solo = liveData({
    primary: {
      depth: 0,
      bestWeekDepth: 0,
      lifetimeDepth: 0,
      deltaVsBestWeek: 0,
      isBestWeekSoFar: false,
    },
    members: [{ playerId: 'p1', handle: 'Sans_Souci', depth: 0, attempts: 0 }],
  });

  it('renders the primary block, which is the block that always works', () => {
    render(<ClanHuntPanel data={solo} />);

    const primary = screen.getByTestId('clan-hunt-primary');
    expect(within(primary).getByText('0 segments')).toBeInTheDocument();
    expect(screen.getByTestId('clan-hunt-primary-line')).toHaveTextContent(
      /first week on the hunt/i
    );
  });

  it('says a clan of one is a clan instead of counting toward a member target', () => {
    render(<ClanHuntPanel data={solo} />);
    expect(screen.getByTestId('clan-hunt-primary')).toHaveTextContent(
      /A clan of one is a clan/i
    );
  });

  it('states the absent rival as a property of the week, not a shortfall', () => {
    render(<ClanHuntPanel data={solo} />);

    const note = screen.getByTestId('clan-hunt-no-rival');
    expect(note).toHaveTextContent(/No clan was matched to yours this week/i);
    expect(note).toHaveTextContent(/resolves either way/i);
    expect(screen.queryByTestId('clan-hunt-rivalry')).not.toBeInTheDocument();
  });

  it('shows the one contribution row and no laurel line at zero', () => {
    render(<ClanHuntPanel data={solo} />);

    expect(screen.getAllByTestId('contribution-row')).toHaveLength(1);
    expect(screen.queryByTestId('clan-hunt-laurels')).not.toBeInTheDocument();
  });

  it('links the running week, so it is an artifact and not just a heading', () => {
    render(<ClanHuntPanel data={solo} />);
    expect(screen.getByRole('link', { name: /Open the Serpent week/i })).toHaveAttribute(
      'href',
      '/serpent?week=2026-07-27'
    );
  });
});

describe('hidden members inside the hunt panel', () => {
  it('keeps the clan total intact and explains the visible rows', () => {
    render(
      <ClanHuntPanel
        data={liveData({
          clan: { ...liveData().clan!, memberCount: 3 },
          primary: {
            depth: 900,
            bestWeekDepth: 0,
            lifetimeDepth: 900,
            deltaVsBestWeek: 900,
            isBestWeekSoFar: true,
          },
          members: [{ playerId: 'p1', handle: 'Sans_Souci', depth: 400, attempts: 2 }],
          hiddenMembers: 2,
        })}
      />
    );

    // The headline is the true sum, not the sum of the rows below it.
    expect(within(screen.getByTestId('clan-hunt-primary')).getByText('900 segments'))
      .toBeInTheDocument();
    expect(screen.getByTestId('hidden-members-note')).toHaveTextContent(
      'Showing 1 of 3 members'
    );
  });
});

describe('primarySentence', () => {
  it('reads a first week as a beginning at zero and above zero', () => {
    expect(primarySentence(0, 0, false)).toMatch(/first week on the hunt/i);
    expect(primarySentence(320, 0, true)).toMatch(/already the week everything after/i);
  });

  it('reads a quieter week as two facts, never as a verdict', () => {
    const sentence = primarySentence(900, 1400, false);
    expect(sentence).toMatch(/deepest week stands at 1,400 segments/);
    expect(sentence).toMatch(/500 segments shy of it/);
  });

  it('reads a deeper week and a level week', () => {
    expect(primarySentence(1600, 1400, true)).toBe(
      'Deeper than any week the clan has had, by +200 segments.'
    );
    expect(primarySentence(1400, 1400, false)).toBe('Level with the clan’s deepest week.');
  });
});

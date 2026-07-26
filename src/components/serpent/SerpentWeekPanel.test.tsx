/**
 * The Serpent week panel: the N = 1 reading, and the flag-off reading.
 *
 * The panel is deliberately given the two payloads it is hardest to render
 * honestly — a solo player in their first week, and the `live: false` body the
 * API returns when `NEXT_PUBLIC_SERPENT_V1` is not set — and asserted to
 * produce prose in both, never an error and never an empty shell.
 */

import { render, screen, within } from '@testing-library/react';
import { SerpentWeekPanel, deltaSentence } from './SerpentWeekPanel';
import { emptySerpentPanel, type SerpentPanel } from '@/lib/server/serpent';

function livePanel(overrides: Partial<SerpentPanel> = {}): SerpentPanel {
  return {
    ...emptySerpentPanel(),
    live: true,
    week: {
      id: 'w1',
      weekStart: '2026-07-27',
      startsAt: '2026-07-27T00:00:00.000Z',
      endsAt: '2026-08-03T00:00:00.000Z',
      seed: 'S0001abc',
      modifiers: [],
      settledAt: null,
    },
    ...overrides,
  };
}

describe('flag off', () => {
  it('renders the off state from a live:false body, not an error', () => {
    render(<SerpentWeekPanel panel={emptySerpentPanel()} />);

    expect(screen.getByTestId('serpent-week-panel-off')).toBeInTheDocument();
    expect(screen.queryByTestId('serpent-week-panel')).not.toBeInTheDocument();
    expect(screen.getByText(/not surfacing yet/i)).toBeInTheDocument();
  });

  it('says nothing is owed and nothing earned is affected', () => {
    render(<SerpentWeekPanel panel={emptySerpentPanel()} />);
    expect(screen.getByText(/Nothing is waiting on you/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing you have earned is affected/i)).toBeInTheDocument();
  });

  it('renders the off state for a live week that somehow has no week row', () => {
    render(<SerpentWeekPanel panel={{ ...emptySerpentPanel(), live: true }} />);
    expect(screen.getByTestId('serpent-week-panel-off')).toBeInTheDocument();
  });
});

describe('N = 1: a solo player, first week, nothing behind them', () => {
  it('renders the whole panel with zeroes and still says something true', () => {
    render(<SerpentWeekPanel panel={livePanel()} />);

    const you = screen.getByTestId('serpent-you');
    expect(within(you).getByText('0 segments')).toBeInTheDocument();
    expect(
      within(you).getByText(/You have no week behind you yet/i)
    ).toBeInTheDocument();
    expect(within(you).getByText(/banked 0 runs/i)).toBeInTheDocument();
  });

  it('tells a clanless player that everything above already counts', () => {
    render(<SerpentWeekPanel panel={livePanel()} />);

    const block = screen.getByTestId('serpent-no-clan');
    expect(within(block).getByText(/hunting on your own/i)).toBeInTheDocument();
    expect(within(block).getByText(/already counts/i)).toBeInTheDocument();
    expect(screen.queryByTestId('serpent-clan')).not.toBeInTheDocument();
  });

  it('reads a clan of one as a clan, not as a shortfall', () => {
    render(
      <SerpentWeekPanel
        panel={livePanel({
          you: { ...emptySerpentPanel().you, depth: 320, attempts: 1 },
          clan: {
            id: 'c1',
            name: 'Lone Coil',
            tag: 'LC',
            memberCount: 1,
            depth: 320,
            bestWeekDepth: 0,
            lifetimeDepth: 320,
            members: [{ playerId: 'p1', handle: 'Sans_Souci', depth: 320, attempts: 1 }],
            hiddenMembers: 0,
          },
        })}
        youPlayerId="p1"
      />
    );

    const clan = screen.getByTestId('serpent-clan');
    expect(within(clan).getByText(/A clan of one is a clan/i)).toBeInTheDocument();
    expect(within(clan).getByText(/first week on the hunt/i)).toBeInTheDocument();
    expect(screen.getByText(/Sans_Souci \(you\)/)).toBeInTheDocument();
  });

  it('says "1 run" and "1 segment" rather than pluralising at N = 1', () => {
    render(
      <SerpentWeekPanel
        panel={livePanel({
          you: { ...emptySerpentPanel().you, depth: 1, attempts: 1 },
        })}
      />
    );
    const you = screen.getByTestId('serpent-you');
    expect(within(you).getByText('1 segment')).toBeInTheDocument();
    expect(within(you).getByText(/banked 1 run\b/i)).toBeInTheDocument();
  });
});

describe('deltaSentence', () => {
  it('reads a first week as a beginning, at zero and above zero', () => {
    expect(deltaSentence(0, 0)).toMatch(/no week behind you yet/i);
    expect(deltaSentence(320, 0)).toMatch(/first week you have fed the hunt/i);
  });

  it('reads a quieter week as a fact about two weeks, never as a failure', () => {
    const sentence = deltaSentence(900, 1400);
    expect(sentence).toMatch(/deepest week stands at 1,400 segments/);
    expect(sentence).toMatch(/500 segments shy of it/);
  });

  it('reads a deeper week and a level week', () => {
    expect(deltaSentence(1600, 1400)).toBe('That is +200 segments past your deepest week.');
    expect(deltaSentence(1400, 1400)).toBe('That is level with your deepest week.');
  });
});

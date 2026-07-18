/**
 * PlayoffBracket tests (Design v2 §8.4): hidden while { live: false }
 * (pre-migration-021) or without playoff content, the QF/SF bracket with
 * seeds + scores + winner highlight, bye rows, and the champions banner
 * history.
 */

import { render, screen, waitFor } from '@testing-library/react';
import {
  PlayoffBracket,
  type ChampionView,
  type PlayoffMatchView,
} from './PlayoffBracket';

function mockFetch(body: unknown) {
  global.fetch = jest.fn().mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  })) as unknown as typeof fetch;
}

function match(overrides: Partial<PlayoffMatchView> = {}): PlayoffMatchView {
  return {
    round: 'quarterfinal',
    slot: 1,
    week_start: '2026-08-24',
    seed_a: 1,
    seed_b: 8,
    clan_a: { id: 'clan-a', name: 'Vipers', tag: 'VIP' },
    clan_b: { id: 'clan-b', name: 'Dragons', tag: 'DRG' },
    score_a: 12000,
    score_b: 9000,
    settled: true,
    winner: 'clan-a',
    ...overrides,
  };
}

const champion: ChampionView = {
  seq: 1,
  season: 'Season 1 — Solstice',
  clan_name: 'Vipers',
  clan_tag: 'VIP',
  decided_at: '2026-09-07T00:00:00Z',
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PlayoffBracket', () => {
  it('renders nothing while { live: false } (pre-021)', async () => {
    mockFetch({ live: false, season: null, playoffs: [], champions: [] });
    const { container } = render(<PlayoffBracket accessToken="token" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing outside playoff weeks with no champion history', async () => {
    mockFetch({
      live: true,
      season: { name: 'Season 1 — Solstice', playoff_phase: 'none' },
      playoffs: [],
      champions: [],
    });
    const { container } = render(<PlayoffBracket accessToken="token" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('renders the bracket: seeds, tags, scores, winner highlighted', async () => {
    mockFetch({
      live: true,
      season: { name: 'Season 1 — Solstice', playoff_phase: 'quarterfinal' },
      playoffs: [
        match(),
        match({ slot: 2, seed_a: 2, seed_b: 7, clan_a: { id: 'c', name: 'Coils', tag: 'COI' }, clan_b: { id: 'd', name: 'Fangs', tag: 'FNG' }, settled: false, winner: null, score_a: 500, score_b: 800 }),
      ],
      champions: [],
    });
    render(<PlayoffBracket accessToken="token" />);

    await waitFor(() =>
      expect(screen.getByTestId('playoff-bracket')).toBeInTheDocument()
    );
    expect(screen.getByText('Quarterfinals')).toBeInTheDocument();
    const first = screen.getByTestId('playoff-quarterfinal-1');
    expect(first).toHaveTextContent('#1');
    expect(first).toHaveTextContent('[VIP] Vipers');
    expect(first).toHaveTextContent('12000');
    expect(first).toHaveTextContent('#8');
    expect(first).toHaveTextContent('[DRG] Dragons');
  });

  it('marks byes: the present clan advances without a duel', async () => {
    mockFetch({
      live: true,
      season: { name: 'Season 1 — Solstice', playoff_phase: 'quarterfinal' },
      playoffs: [
        match({ clan_b: null, seed_b: null, score_a: null, score_b: null, settled: false, winner: 'clan-a' }),
      ],
      champions: [],
    });
    render(<PlayoffBracket accessToken="token" />);

    await waitFor(() =>
      expect(screen.getByTestId('playoff-quarterfinal-1')).toBeInTheDocument()
    );
    expect(screen.getByText(/Bye — advances/)).toBeInTheDocument();
  });

  it('explains the championship-week final on the semifinal round', async () => {
    mockFetch({
      live: true,
      season: { name: 'Season 1 — Solstice', playoff_phase: 'championship' },
      playoffs: [match({ round: 'semifinal', week_start: '2026-08-31' })],
      champions: [],
    });
    render(<PlayoffBracket accessToken="token" />);

    await waitFor(() =>
      expect(screen.getByText('Championship Week')).toBeInTheDocument()
    );
    expect(
      screen.getByText(/higher counted\s+score this week — cosmetics \+ banner, never economy/)
    ).toBeInTheDocument();
  });

  it('renders the champions banner history whenever it exists', async () => {
    mockFetch({
      live: true,
      season: null,
      playoffs: [],
      champions: [champion],
    });
    render(<PlayoffBracket accessToken="token" />);

    await waitFor(() =>
      expect(screen.getByTestId('champions-history')).toBeInTheDocument()
    );
    expect(screen.getByText('[VIP] Vipers')).toBeInTheDocument();
    expect(screen.getByText('Season 1 — Solstice')).toBeInTheDocument();
  });
});

/**
 * Ascension on the board — what a month is actually allowed to say.
 *
 * Three laws are enforced here against RENDERED TEXT, because a constitution
 * kept only in a module's doc comment is a constitution one careless string
 * away from being broken:
 *
 *   Rule 5 — absence is never destructive. The month with three Signals and
 *   twenty-eight unplayed days is swept for the vocabulary of loss. The sweep
 *   catches `close`/`closed` too, since those contain `lose`; that is not a
 *   false positive worth suppressing — "the month is closed" is exactly the
 *   register this rule is trying to keep out.
 *
 *   §12.2 — no second claim and no second currency. The payload is inspected
 *   for a claim URL and a DNA figure, and the DOM for anything a player could
 *   press to collect. Ascension has exactly two interactive elements ever, and
 *   both are links to adjacent months.
 *
 *   §7.1 / Rule 6 — nothing implies something owned was reduced. No rendered
 *   string pairs what was played against the size of the month, and no number
 *   on screen can go down.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import { AscensionMonth } from './AscensionMonth';
import { readAscensionMonth, type AscensionDay } from '@/shared/game/ascension';

jest.mock('@/lib/ascension/config', () => ({ ASCENSION_V1_ENABLED: true }));

let searchParams = new URLSearchParams('month=2026-07');
jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

/** Mid-July: the month is running, with scoring days ahead. */
const MID_JULY = Date.UTC(2026, 6, 15, 12);
/** August: July is over and its reading is final. */
const AUGUST = Date.UTC(2026, 7, 3, 12);

/** Rule 5 / Rule 6. `close` is caught because it contains `lose`. */
const FORBIDDEN = /lost|lose|missed out|broke|expire|decay|debt|behind/i;

function day(d: number, score: number): AscensionDay {
  return { day: `2026-07-${String(d).padStart(2, '0')}`, score };
}

/** The exact shape `GET /api/signal/ascension` publishes. */
function view(scored: AscensionDay[], now: number, currentMonth = '2026-07') {
  return {
    live: true,
    currentMonth,
    reading: readAscensionMonth('2026-07', scored, now),
  };
}

function mockFetch(body: unknown, ok = true) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok,
    json: async () => body,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** Everything the player can read, as one string. */
async function renderedText(body: unknown): Promise<string> {
  mockFetch(body);
  render(<AscensionMonth token="test-token" />);
  const block = await screen.findByTestId('ascension-month');
  return block.textContent ?? '';
}

beforeEach(() => {
  jest.clearAllMocks();
  searchParams = new URLSearchParams('month=2026-07');
});

describe('a month with many unplayed days reads honestly (Rule 5)', () => {
  const SPARSE = [day(2, 900), day(9, 640), day(23, 1_100)];

  it('says what was scored, and never what was not', async () => {
    const text = await renderedText(view(SPARSE, MID_JULY));

    expect(text).toContain('3 Signals scored in July 2026');
    expect(text).toContain('2,640 points');
    expect(text).toContain('Ascent');
    // The month is 31 days long. That comparison is never made.
    expect(text).not.toContain('of 31');
    expect(text).not.toContain('3/31');
    expect(text).not.toContain('28');
  });

  it('renders no row for a day nobody played — absence has no cell', async () => {
    mockFetch(view(SPARSE, MID_JULY));
    render(<AscensionMonth token="test-token" />);

    const list = await screen.findByTestId('ascension-days');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByTestId('ascension-day-2026-07-02')).toBeInTheDocument();
    expect(screen.getByTestId('ascension-day-2026-07-09')).toBeInTheDocument();
    expect(screen.getByTestId('ascension-day-2026-07-23')).toBeInTheDocument();
    // The 28 days with no Signal have no representation at all.
    expect(screen.queryByTestId('ascension-day-2026-07-03')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ascension-day-2026-07-31')).not.toBeInTheDocument();
  });

  const SWEEP: Array<[string, AscensionDay[], number]> = [
    ['no Signal at all, month running', [], MID_JULY],
    ['no Signal at all, month over', [], AUGUST],
    ['one Signal', [day(4, 500)], MID_JULY],
    ['three Signals in a 31-day month', SPARSE, MID_JULY],
    ['three Signals, month over', SPARSE, AUGUST],
    ['ten Signals', Array.from({ length: 10 }, (_, i) => day(i + 1, 900)), MID_JULY],
    [
      'fourteen Signals, four outside the ten',
      Array.from({ length: 14 }, (_, i) => day(i + 1, (i + 1) * 200)),
      MID_JULY,
    ],
    ['an Apex month', Array.from({ length: 10 }, (_, i) => day(i + 1, 5_000)), AUGUST],
  ];

  it.each(SWEEP)('%s uses none of the vocabulary of loss', async (_label, scored, now) => {
    const text = await renderedText(view(scored, now));
    expect(text).not.toMatch(FORBIDDEN);
    expect(text.length).toBeGreaterThan(0);
  });

  it.each(SWEEP)('%s never scolds, warns or urges', async (_label, scored, now) => {
    const text = await renderedText(view(scored, now));
    expect(text).not.toMatch(/streak|don't|do not|last chance|hurry|only \d+ days? left/i);
    expect(text).not.toMatch(/you failed|you didn't|keep it up or/i);
  });
});

describe('§12.2 — no second claim, no second currency', () => {
  it('renders no button of any kind: the only controls are month links', async () => {
    mockFetch(view([day(2, 900)], MID_JULY, '2026-08'));
    const { container } = render(<AscensionMonth token="test-token" />);
    await screen.findByTestId('ascension-month');

    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(container.querySelectorAll('form')).toHaveLength(0);

    const links = Array.from(container.querySelectorAll('a'));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(/^\/leaderboard\?month=\d{4}-\d{2}$/);
    }
  });

  it('never requests a claim URL — the only fetch is the month read', async () => {
    const fetchMock = mockFetch(view([day(2, 900)], MID_JULY));
    render(<AscensionMonth token="test-token" />);
    await screen.findByTestId('ascension-month');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toEqual(['/api/signal/ascension?month=2026-07']);
    for (const url of urls) {
      expect(url).not.toMatch(/claim|collect|grant|reward|settle|purchase|checkout/i);
    }
    // A read, not a write.
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      expect((init?.method ?? 'GET').toUpperCase()).toBe('GET');
    }
  });

  it('shows no currency, price or reward anywhere on screen', async () => {
    const text = await renderedText(
      view(Array.from({ length: 12 }, (_, i) => day(i + 1, (i + 1) * 300)), MID_JULY)
    );
    expect(text).not.toMatch(/\bDNA\b/i);
    expect(text).not.toMatch(/currency|balance|wallet|payout|bonus|reward|claim|collect/i);
    expect(text).not.toMatch(/[€$£]/);
    expect(text).not.toMatch(/premium|unlock for|upgrade|buy|subscribe/i);
  });

  it('carries no currency in the payload it is handed', () => {
    const payload = JSON.stringify(view([day(2, 900)], MID_JULY)).toLowerCase();
    for (const banned of ['dna', 'claim', 'collect', 'reward', 'payout', 'price']) {
      expect(payload).not.toContain(banned);
    }
  });
});

describe('the reading itself', () => {
  it('leads with Score, this month', async () => {
    const text = await renderedText(view([day(2, 900), day(9, 640)], MID_JULY));
    expect(text).toContain('Score, this month');
    expect(text).toContain('July 2026');
  });

  it('marks the days that count, and still shows the ones that do not', async () => {
    mockFetch(
      view(Array.from({ length: 12 }, (_, i) => day(i + 1, (i + 1) * 100)), MID_JULY)
    );
    render(<AscensionMonth token="test-token" />);
    await screen.findByTestId('ascension-month');

    // 12 played; the best ten count. The two smallest are shown, uncounted.
    expect(within(screen.getByTestId('ascension-days')).getAllByRole('listitem')).toHaveLength(12);
    expect(screen.getByTestId('ascension-day-2026-07-12')).toHaveTextContent('counts');
    expect(screen.getByTestId('ascension-day-2026-07-01')).not.toHaveTextContent('counts');
  });

  it('links the previous month, and the next only once it has started', async () => {
    mockFetch(view([day(2, 900)], MID_JULY, '2026-07'));
    const { unmount } = render(<AscensionMonth token="test-token" />);
    await screen.findByTestId('ascension-month');
    expect(screen.getByTestId('ascension-previous')).toHaveAttribute(
      'href',
      '/leaderboard?month=2026-06'
    );
    // July IS the current month on the server, so August is not offered.
    expect(screen.queryByTestId('ascension-next')).not.toBeInTheDocument();
    unmount();

    mockFetch(view([day(2, 900)], AUGUST, '2026-08'));
    render(<AscensionMonth token="test-token" />);
    await screen.findByTestId('ascension-month');
    expect(screen.getByTestId('ascension-next')).toHaveAttribute(
      'href',
      '/leaderboard?month=2026-08'
    );
  });

  it('reads a month with no Signal in it without inventing one', async () => {
    mockFetch(view([], MID_JULY));
    render(<AscensionMonth token="test-token" />);
    await screen.findByTestId('ascension-month');

    expect(screen.getByTestId('ascension-points')).toHaveTextContent('0 points');
    expect(screen.getByTestId('ascension-tier')).toHaveTextContent('Coil');
    expect(screen.queryByTestId('ascension-days')).not.toBeInTheDocument();
  });
});

describe('the states that are not a month', () => {
  it('says so plainly when the reading is unavailable', async () => {
    mockFetch({}, false);
    render(<AscensionMonth token="test-token" />);
    const block = await screen.findByTestId('ascension-month');
    expect(block.textContent).toMatch(/unavailable/i);
    expect(block.textContent).toContain('Your Signals are unaffected');
    expect(block.textContent).not.toMatch(FORBIDDEN);
  });

  it('says so plainly for a month key that is not a month', async () => {
    mockFetch({ live: false, currentMonth: '2026-07', reading: null });
    render(<AscensionMonth token="test-token" />);
    const block = await screen.findByTestId('ascension-month');
    expect(block.textContent).toContain('no Ascension month at that date');
    expect(block.textContent).not.toMatch(FORBIDDEN);
  });

  it('says Ascension has not opened when the server reports it is not live', async () => {
    mockFetch({ live: false, currentMonth: '2026-07', reading: readAscensionMonth('2026-07', [], MID_JULY) });
    render(<AscensionMonth token="test-token" />);
    const block = await screen.findByTestId('ascension-month');
    expect(block.textContent).toContain('has not opened yet');
    expect(block.textContent).toContain('Signals play exactly the same either way');
    expect(block.textContent).not.toMatch(FORBIDDEN);
  });

  it('reads nothing without a token', async () => {
    const fetchMock = mockFetch(view([], MID_JULY));
    const { container } = render(<AscensionMonth token={undefined} />);
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to the current month when the URL asks for a non-month', async () => {
    searchParams = new URLSearchParams('month=banana');
    const fetchMock = mockFetch(view([], MID_JULY));
    render(<AscensionMonth token="test-token" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /^\/api\/signal\/ascension\?month=\d{4}-\d{2}$/
    );
  });
});

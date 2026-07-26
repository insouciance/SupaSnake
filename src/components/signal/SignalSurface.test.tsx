/**
 * The World Signal surface, flag ON (Constitution §7.2, §12.2).
 *
 * The off path is a SEPARATE file — `SignalSurface.flagOff.test.tsx` — because
 * the flag is a module-scope constant and the project rule is that a rollback
 * path is tested, never inferred from an omitted flag.
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SignalSurface, signalDayLabel } from './SignalSurface';
import { signalDayIndex } from '@/shared/game/signal';

jest.mock('@/lib/signal/config', () => ({ SIGNAL_V1_ENABLED: true }));

const DAY_KEY = '2026-07-26';

function livePanel(overrides: Record<string, unknown> = {}) {
  return {
    live: true,
    day: {
      id: 'day-1',
      day: DAY_KEY,
      startsAt: `${DAY_KEY}T00:00:00.000Z`,
      endsAt: '2026-07-27T00:00:00.000Z',
      seed: 'Dabcdef12',
      condition: {
        id: 'blackout',
        name: 'Blackout',
        effect: 'Vision is cut to a narrow cone',
        strainTilt: 'UMBRA',
      },
      objectives: [
        {
          id: 'signal_endure',
          kind: 'endure',
          target: 120,
          label: 'ENDURE',
          description: 'Survive 120 seconds in a single run',
          bonusDna: 150,
        },
        {
          id: 'signal_extract',
          kind: 'extract',
          target: 300,
          label: 'EXTRACT',
          description: 'Bank a run worth 300 Yield',
          bonusDna: 150,
        },
        {
          id: 'signal_engineer',
          kind: 'engineer',
          target: 4,
          label: 'ENGINEER',
          description: 'Accept 4 genes in a single run',
          bonusDna: 150,
        },
      ],
    },
    you: {
      chosen: false,
      objectiveId: null,
      objective: null,
      progress: 0,
      target: 0,
      completed: false,
      bonusPaid: false,
    },
    marks: { signalsCompleted: 12, reached: [], next: 30 },
    ...overrides,
  };
}

function mockPanel(body: unknown, { ok = true, status = 200 } = {}) {
  global.fetch = jest.fn(async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

async function openCard() {
  const chip = await screen.findByTestId('signal-chip');
  fireEvent.click(chip);
  return chip;
}

describe('SignalSurface (flag on)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the day, its condition and its three objectives', async () => {
    mockPanel(livePanel());
    render(<SignalSurface token="test-token" onTake={jest.fn()} />);

    await openCard();

    expect(screen.getByText('Blackout')).toBeInTheDocument();
    expect(screen.getByText('Vision is cut to a narrow cone')).toBeInTheDocument();
    expect(screen.getByTestId('signal-objective-signal_endure')).toBeInTheDocument();
    expect(screen.getByTestId('signal-objective-signal_extract')).toBeInTheDocument();
    expect(screen.getByTestId('signal-objective-signal_engineer')).toBeInTheDocument();
    expect(screen.getByText('Survive 120 seconds in a single run')).toBeInTheDocument();
  });

  it('numbers the day with signalDayIndex and adds no offset', async () => {
    mockPanel(livePanel());
    render(<SignalSurface token="test-token" onTake={jest.fn()} />);

    // `signalDayIndex` is the authoritative 0-based day number. A recent
    // defect came from displaying it with an offset; assert against the
    // engine, not against a copied literal.
    const expected = signalDayIndex(new Date(`${DAY_KEY}T00:00:00.000Z`));
    expect(signalDayLabel(DAY_KEY)).toBe(`Signal #${expected}`);
    expect(await screen.findByText(new RegExp(`Signal #${expected}`))).toBeInTheDocument();
  });

  it('reads the auth token onto the panel request', async () => {
    mockPanel(livePanel());
    render(<SignalSurface token="test-token" onTake={jest.fn()} />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe('/api/signal/panel');
    expect(init.headers).toEqual({ Authorization: 'Bearer test-token' });
  });

  it('hands a tapped objective to onTake and closes the card when it launches', async () => {
    mockPanel(livePanel());
    const onTake = jest.fn().mockResolvedValue(true);
    render(<SignalSurface token="test-token" onTake={onTake} />);

    await openCard();
    fireEvent.click(screen.getByTestId('signal-objective-signal_extract'));

    await waitFor(() => expect(onTake).toHaveBeenCalledWith('signal_extract'));
    await waitFor(() =>
      expect(screen.queryByTestId('signal-card')).not.toBeInTheDocument()
    );
  });

  it('keeps the card open and shows the caller\'s error when a take fails', async () => {
    mockPanel(livePanel());
    const onTake = jest.fn().mockResolvedValue(false);
    render(
      <SignalSurface
        token="test-token"
        onTake={onTake}
        takeError="The Signal run did not start."
      />
    );

    await openCard();
    fireEvent.click(screen.getByTestId('signal-objective-signal_endure'));

    await waitFor(() => expect(onTake).toHaveBeenCalled());
    expect(screen.getByTestId('signal-card')).toBeInTheDocument();
    expect(screen.getByTestId('signal-take-error')).toHaveTextContent(
      'The Signal run did not start.'
    );
  });

  it('reads a day with no objective taken as an open choice', async () => {
    mockPanel(livePanel());
    render(<SignalSurface token="test-token" onTake={jest.fn()} />);

    await openCard();
    expect(screen.getByTestId('signal-objectives')).toBeInTheDocument();
    expect(screen.queryByTestId('signal-taken')).not.toBeInTheDocument();
  });

  it('reads a day already taken as progress, with no second choice offered', async () => {
    const panel = livePanel();
    panel.you = {
      chosen: true,
      objectiveId: 'signal_endure',
      objective: panel.day.objectives[0],
      progress: 45,
      target: 120,
      completed: false,
      bonusPaid: false,
    };
    mockPanel(panel);
    render(<SignalSurface token="test-token" onTake={jest.fn()} />);

    await openCard();
    expect(screen.getByTestId('signal-taken')).toBeInTheDocument();
    expect(screen.getByText('45 / 120')).toBeInTheDocument();
    // One attempt per day per player: re-choosing is not offered, so a player
    // cannot dodge a bad objective or farm the §8.6 exemption.
    expect(screen.queryByTestId('signal-objectives')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('signal-objective-signal_extract')
    ).not.toBeInTheDocument();
  });

  it('says a completed Signal settles itself — there is nothing to claim', async () => {
    const panel = livePanel();
    panel.you = {
      chosen: true,
      objectiveId: 'signal_endure',
      objective: panel.day.objectives[0],
      progress: 150,
      target: 120,
      completed: true,
      bonusPaid: true,
    };
    mockPanel(panel);
    render(<SignalSurface token="test-token" onTake={jest.fn()} />);

    await openCard();
    expect(screen.getByText(/settles on its own/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /claim/i })).not.toBeInTheDocument();
  });

  it('renders live:false as a clean off state, not an error', async () => {
    mockPanel({
      live: false,
      day: null,
      you: {
        chosen: false,
        objectiveId: null,
        objective: null,
        progress: 0,
        target: 0,
        completed: false,
        bonusPaid: false,
      },
      marks: { signalsCompleted: 0, reached: [], next: 30 },
    });
    render(<SignalSurface token="test-token" onTake={jest.fn()} />);

    await openCard();
    expect(screen.getByTestId('signal-off')).toBeInTheDocument();
    expect(screen.queryByTestId('signal-error')).not.toBeInTheDocument();
    expect(screen.getByText(/quiet right now/i)).toBeInTheDocument();
  });

  it('surfaces a non-ok panel response as an error rather than rendering undefined', async () => {
    // The repo's known defect is a bare `.then(res => res.json())` swallowing
    // a 500 and rendering `undefined`. `!response.ok` is checked, so a 500 is
    // an error state and no day field is ever read off a failed body.
    mockPanel({ error: 'boom' }, { ok: false, status: 500 });
    render(<SignalSurface token="test-token" onTake={jest.fn()} />);

    await openCard();
    expect(screen.getByTestId('signal-error')).toBeInTheDocument();
    expect(screen.queryByTestId('signal-objectives')).not.toBeInTheDocument();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  it('re-reads the panel when the player retries after an error', async () => {
    mockPanel({ error: 'boom' }, { ok: false, status: 500 });
    render(<SignalSurface token="test-token" onTake={jest.fn()} />);

    await openCard();
    mockPanel(livePanel());
    fireEvent.click(screen.getByTestId('signal-retry'));

    expect(await screen.findByTestId('signal-objectives')).toBeInTheDocument();
  });

  it('reports the marks as a cumulative total and never as a streak', async () => {
    mockPanel(livePanel());
    render(<SignalSurface token="test-token" onTake={jest.fn()} />);

    await openCard();
    // §7.2: the marks are cumulative and explicitly NON-consecutive.
    expect(screen.getByText(/12 Signals completed in total/)).toBeInTheDocument();
    expect(screen.getByTestId('signal-card').textContent).not.toMatch(/streak/i);
  });

  it('never uses loss, expiry or guilt language (Rule 5)', async () => {
    mockPanel(livePanel());
    render(<SignalSurface token="test-token" onTake={jest.fn()} />);

    await openCard();
    const text = screen.getByTestId('signal-surface').textContent ?? '';
    expect(text).not.toMatch(/lost|lose|missed|expire|expires|don't break|running out/i);
  });

  it('carries no commercial surface (Rule 7)', async () => {
    mockPanel(livePanel());
    render(<SignalSurface token="test-token" onTake={jest.fn()} />);

    await openCard();
    const text = screen.getByTestId('signal-surface').textContent ?? '';
    expect(text).not.toMatch(/\$|€|buy|purchase|upgrade|premium|subscribe|offer/i);
  });

  it('does not read the panel without a token', async () => {
    mockPanel(livePanel());
    render(<SignalSurface token={undefined} onTake={jest.fn()} />);

    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled());
    expect(screen.queryByTestId('signal-chip')).not.toBeInTheDocument();
  });
});

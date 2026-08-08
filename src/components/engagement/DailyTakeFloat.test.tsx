import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DailyTakeFloat } from './DailyTakeFloat';

const READ = '/api/daily-take';
const COLLECT = '/api/daily-take/collect';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function liveSlot(overrides: Record<string, unknown> = {}) {
  return {
    live: true,
    firstRunOfDay: true,
    amount: 150,
    streakDays: 3,
    multiplier: 1.5,
    collected: false,
    ...overrides,
  };
}

/** Routes the component's two calls; every test states both answers. */
function installFetch(answers: {
  read: unknown;
  readStatus?: number;
  collect?: unknown;
  collectStatus?: number;
}) {
  const calls: string[] = [];
  const impl = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url === READ) return jsonResponse(answers.read, answers.readStatus ?? 200);
    if (url === COLLECT) {
      return jsonResponse(answers.collect ?? {}, answers.collectStatus ?? 200);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  global.fetch = impl as unknown as typeof fetch;
  return { calls };
}

afterEach(() => {
  jest.resetAllMocks();
});

describe('DailyTakeFloat', () => {
  it('offers the day’s exact server-stated amount and streak', async () => {
    installFetch({ read: liveSlot() });
    render(<DailyTakeFloat token="tok" />);

    const token = await screen.findByTestId('daily-take-float');
    expect(token).toHaveAttribute('data-phase', 'idle');
    expect(token).toHaveTextContent('+150');
    expect(token).toHaveTextContent('3');
    expect(token).toHaveAccessibleName("Take today's 150 DNA. Day 3 streak.");
  });

  it('renders nothing at all when there is no Take to collect', async () => {
    installFetch({ read: liveSlot({ firstRunOfDay: false, collected: true }) });
    const { container } = render(<DailyTakeFloat token="tok" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByTestId('daily-take-float')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the mechanism is not live', async () => {
    installFetch({ read: { live: false, firstRunOfDay: false } });
    render(<DailyTakeFloat token="tok" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByTestId('daily-take-float')).not.toBeInTheDocument();
  });

  it('never asks the server anything without a token', () => {
    const { calls } = installFetch({ read: liveSlot() });
    render(<DailyTakeFloat token={null} />);
    expect(calls).toHaveLength(0);
    expect(screen.queryByTestId('daily-take-float')).not.toBeInTheDocument();
  });

  it('collects through the one claim endpoint and reports what was paid', async () => {
    const { calls } = installFetch({
      read: liveSlot(),
      collect: { live: true, collected: true, amount: 150, streakDays: 4 },
    });
    render(<DailyTakeFloat token="tok" />);

    const btn = await screen.findByTestId('daily-take-float');
    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() =>
      expect(screen.getByTestId('daily-take-float')).toHaveAttribute(
        'data-phase',
        'collected'
      )
    );
    expect(screen.getByTestId('daily-take-float')).toHaveTextContent('TOOK 150');
    expect(calls).toContain(`POST ${COLLECT}`);
  });

  it('shows the day’s amount when a replayed collect grants nothing', async () => {
    installFetch({
      read: liveSlot(),
      collect: { live: true, collected: false, amount: 0, streakDays: 3 },
    });
    render(<DailyTakeFloat token="tok" />);

    const btn = await screen.findByTestId('daily-take-float');
    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() =>
      expect(screen.getByTestId('daily-take-float')).toHaveTextContent('TOOK 150')
    );
  });

  it('keeps the Take instead of showing a failure when collection breaks', async () => {
    installFetch({ read: liveSlot(), collectStatus: 503, collect: { error: 'nope' } });
    render(<DailyTakeFloat token="tok" />);

    const btn = await screen.findByTestId('daily-take-float');
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(await screen.findByTestId('daily-take-float-error')).toHaveTextContent(
      'Not now — it keeps.'
    );
    expect(screen.getByTestId('daily-take-float')).toHaveAttribute('data-phase', 'error');
  });

  it('treats an undeployed endpoint as a quiet no-op, never an error', async () => {
    installFetch({ read: liveSlot(), collectStatus: 404, collect: {} });
    render(<DailyTakeFloat token="tok" />);

    const btn = await screen.findByTestId('daily-take-float');
    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() =>
      expect(screen.getByTestId('daily-take-float')).toHaveAttribute(
        'data-phase',
        'collected'
      )
    );
    expect(screen.queryByTestId('daily-take-float-error')).not.toBeInTheDocument();
  });

  /**
   * THE COIN IS A SEGMENT OF THE SNAKE (owner ruling, 2026-08-08).
   *
   * Home's controls are cubes of the creature. This token was the one
   * pressable left in the old amber-chip grammar, which is exactly what a
   * player reads as an element that arrived from another product. It now wears
   * the shipped construction — `SnakeCubeChrome` over `.snake-cube` — and it
   * REUSES it rather than forking it, which is the part worth pinning: a
   * second hand-drawn cube would drift from the rail's the first time the
   * creature is restyled.
   */
  it('presses as one of the creature’s cubes, not as a rectangle', async () => {
    installFetch({ read: liveSlot() });
    render(<DailyTakeFloat token="tok" />);

    const token = await screen.findByTestId('daily-take-float');
    expect(token).toHaveClass('snake-cube');
    // The chrome's own two layers, from the shared component.
    expect(token.querySelector('.snake-cube__block')).not.toBeNull();
    expect(token.querySelector('.snake-cube__lift')).not.toBeNull();
    // The block colour is READ OFF THE ART (`snakeCubeVars`), never typed here.
    expect(token.style.getPropertyValue('--cube-block')).toMatch(/^#[0-9a-f]{6}$/i);
    // Nothing left of the rectangle it replaced: no fill, no radius, no border
    // written at this call site.
    expect(token.className).not.toContain('bg-venom-orange');
    expect(token.className).not.toContain('rounded-');
    expect(token.className).not.toContain('border-');
  });

  /**
   * WHAT LEANS AND WHAT DOES NOT.
   *
   * `SnakeCubeButton`'s own rule: the glyph slot is projected into the face's
   * plane, so anything inside it leans with the face — "a badge that leans is
   * a badge that looks broken". The DNA mark is paint and belongs there; the
   * amount and the streak are numbers a player reads and must stay square to
   * the screen, so they ride the cube as siblings of the drawing.
   */
  it('keeps the numbers upright and outside the leaning face', async () => {
    installFetch({ read: liveSlot() });
    render(<DailyTakeFloat token="tok" />);

    const token = await screen.findByTestId('daily-take-float');
    const glyphSlot = token.querySelector('.snake-cube__glyph') as HTMLElement;
    expect(glyphSlot).not.toBeNull();
    // The face is painted; it carries no text at all.
    expect(glyphSlot.textContent).toBe('');
    expect(glyphSlot.querySelector('svg')).not.toBeNull();
    // And the readable numbers are elsewhere on the button.
    expect(token).toHaveTextContent('+150');
    expect(token).toHaveTextContent('3');
  });

  it('carries no daily reading matter, so it cannot become a second daily surface', async () => {
    installFetch({ read: liveSlot() });
    render(<DailyTakeFloat token="tok" />);
    const token = await screen.findByTestId('daily-take-float');
    // The World Signal is Home's one daily SURFACE. This token states an
    // amount and a streak and nothing else — no condition, no objective, no
    // schedule, and no link that would make it a destination.
    expect(token.textContent).toBe("Today's Take+150Day3");
    expect(token.querySelector('a')).toBeNull();
  });
});

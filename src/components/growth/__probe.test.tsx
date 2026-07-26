/**
 * The lead-ladder surface (Constitution §11.7).
 *
 * The claim path is exercised THROUGH the shipped `HandleClaimModal` rather
 * than around it. That is as much the point of the test as of the component:
 * the assertions about reserved and taken names go on passing only while the
 * real ceremony — one debounced availability check against
 * `/api/player/handle?check=`, one `claim_handle` POST — is still the thing
 * being driven. A second identity implementation would fail them.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { commercialTerms } from '@/lib/growth/commercialLanguage';

let ladderEnabled = false;
jest.mock('@/lib/features/leadLadder', () => ({
  get LEAD_LADDER_V1_ENABLED() {
    return ladderEnabled;
  },
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}));

const ladderPrompts: Array<{ rung: string; engaged: boolean }> = [];
const personProperties: Array<Record<string, unknown>> = [];
jest.mock('@/lib/analytics/funnel', () => {
  const actual = jest.requireActual(
    '@/lib/analytics/funnel'
  ) as typeof import('@/lib/analytics/funnel');
  return {
    ...actual,
    setLadderRung: (rung: string, height: number) => {
      personProperties.push({ ladder_rung: rung, ladder_rung_height: height });
    },
    trackLadderPrompt: (rung: string, engaged: boolean) => {
      ladderPrompts.push({ rung, engaged });
    },
  };
});

import { LeadLadder } from './LeadLadder';

/** The handle endpoints, stubbed at the boundary the shipped modal uses. */
function stubHandleApi(
  claim: { ok: boolean; status?: number; body: Record<string, unknown> },
  check: Record<string, unknown> = { live: true, available: true }
) {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      expect(String(input)).toBe('/api/player/handle');
      return {
        ok: claim.ok,
        status: claim.status ?? (claim.ok ? 200 : 409),
        json: async () => claim.body,
      } as Response;
    }
    expect(String(input)).toContain('/api/player/handle?check=');
    return { ok: true, status: 200, json: async () => check } as Response;
  }) as unknown as typeof fetch;
}

/**
 * Type a candidate and wait for the modal's 350ms debounce to answer.
 *
 * Real timers on purpose: the modal's debounce, RTL's `waitFor` polling and
 * the stubbed fetch promises all have to interleave, and driving that with
 * `jest.advanceTimersByTime` deadlocks. `expected` is the status line the
 * check must settle on, so the wait has a definite end.
 */
async function typeHandle(
  modal: HTMLElement,
  candidate: string,
  expected: RegExp
) {
  fireEvent.change(within(modal).getByTestId('handle-claim-input'), {
    target: { value: candidate },
  });
  await waitFor(
    () =>
      expect(within(modal).getByTestId('handle-claim-status')).toHaveTextContent(
        expected
      ),
    { timeout: 3000 }
  );
}

const NAMELESS = { hasPlayed: true, hasHandle: false };

/** Open the ceremony from the ladder's own invitation. */
async function openClaim(): Promise<HTMLElement> {
  fireEvent.click(screen.getByTestId('ladder-prompt-action'));
  return screen.findByTestId('handle-claim-modal');
}

describe('<LeadLadder />', () => {
  beforeEach(() => {
    ladderEnabled = true;
    ladderPrompts.length = 0;
    personProperties.length = 0;
    stubHandleApi({ ok: true, body: { success: true, handle: 'Sans_Souci' } });
  });

  afterEach(() => {
    ladderEnabled = false;
    jest.clearAllMocks();
  });

  it('renders NOTHING while the flag is off — the tested rollback path', () => {
    ladderEnabled = false;
    const { container } = render(
      <LeadLadder state={NAMELESS} displayHandle="handler-0431" />
    );
    expect(container).toBeEmptyDOMElement();
    expect(ladderPrompts).toEqual([]);
    expect(personProperties).toEqual([]);
  });

  it('shows an unclaimed player their provisional entry and the invitation', () => {
    render(<LeadLadder state={NAMELESS} displayHandle="handler-0431" />);
    expect(screen.getByTestId('ladder-provisional')).toHaveTextContent(
      'Unclaimed specimen handler-0431 — is this you?'
    );
    expect(screen.getByTestId('ladder-prompt-action')).toHaveTextContent(
      'Claim your name'
    );
  });

  it('draws the rungs up to advocate and never the one after it (Rule 7)', () => {
    const { container } = render(<LeadLadder state={NAMELESS} />);
    expect(screen.getByTestId('ladder-rung-player')).toHaveAttribute(
      'data-reached',
      'true'
    );
    expect(screen.getByTestId('ladder-rung-named')).toHaveAttribute(
      'data-reached',
      'false'
    );
    expect(screen.getByTestId('ladder-rung-advocate')).toBeInTheDocument();
    expect(screen.queryByTestId('ladder-rung-patron')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/patron/i);
  });

  it('carries no commercial vocabulary on a board screen (Rule 7)', () => {
    const { container } = render(
      <LeadLadder state={NAMELESS} displayHandle="handler-0431" />
    );
    expect(commercialTerms(container.textContent ?? '')).toEqual([]);
    expect(
      Array.from(container.querySelectorAll('a')).map((a) =>
        a.getAttribute('href')
      )
    ).not.toContain('/shop');
  });

  it('stamps the person with the rung, so cohorts read by rung (§11.8)', () => {
    render(<LeadLadder state={NAMELESS} />);
    expect(personProperties).toContainEqual({
      ladder_rung: 'player',
      ladder_rung_height: 1,
    });
  });

  it('measures the ask, and separately the take-up', async () => {
    render(<LeadLadder state={NAMELESS} displayHandle="handler-0431" />);
    expect(ladderPrompts).toContainEqual({ rung: 'named', engaged: false });

    await openClaim();
    expect(ladderPrompts).toContainEqual({ rung: 'named', engaged: true });
  });

  it('claims a valid name through the shipped ceremony', async () => {
    const onClaimed = jest.fn();
    render(
      <LeadLadder
        state={NAMELESS}
        displayHandle="handler-0431"
        onClaimed={onClaimed}
      />
    );

    const modal = await openClaim();
    await typeHandle(modal, 'Sans_Souci', /available/i);

    await act(async () => {
      fireEvent.click(within(modal).getByTestId('handle-claim-submit'));
    });

    await waitFor(() => expect(onClaimed).toHaveBeenCalledWith('Sans_Souci'));
    expect(screen.getByTestId('ladder-claimed')).toHaveTextContent('Sans_Souci');
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockTrackEvent = jest.fn();
jest.mock('@/lib/analytics/posthog', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { DispatchWaitlistForm } from './DispatchWaitlistForm';
import { ATTRIBUTION_STORAGE_KEY } from '@/lib/growth/attribution';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body,
  } as Response;
}

describe('DispatchWaitlistForm', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockTrackEvent.mockClear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('says double opt-in before anything is submitted', () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    render(<DispatchWaitlistForm />);
    expect(
      screen.getByText(/confirmation link first and nothing at all until you click it/i)
    ).toBeInTheDocument();
  });

  it('is not commercial: no price, offer, or purchase language (Rule 7)', () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const { container } = render(<DispatchWaitlistForm />);
    expect(container.textContent).not.toMatch(/€|\bprice\b|\bbuy\b|\boffer\b|\bpremium\b/i);
  });

  it('posts the address with the session channel and reports the pending state', async () => {
    window.sessionStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({
        source: 'hn',
        medium: null,
        campaign: null,
        content: null,
        term: null,
        referrerHost: null,
        landingPath: '/',
        capturedAt: '2026-07-25T12:00:00.000Z',
      })
    );
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(202, { status: 'pending', message: 'Check your inbox.' })
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<DispatchWaitlistForm />);
    fireEvent.change(screen.getByLabelText('The Dispatch'), {
      target: { value: 'player@example.com' },
    });
    fireEvent.click(screen.getByTestId('dispatch-waitlist-submit'));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Check your inbox.')
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      email: 'player@example.com',
      channel: 'hn',
      landingPath: '/',
    });
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'dispatch_waitlist_submitted',
      expect.objectContaining({ channel: 'hn', category: 'growth' })
    );
  });

  it('surfaces the server error and reports nothing to analytics', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(400, { error: 'Enter a valid email address.' })
      ) as unknown as typeof fetch;

    render(<DispatchWaitlistForm />);
    fireEvent.change(screen.getByLabelText('The Dispatch'), {
      target: { value: 'player@example.com' },
    });
    fireEvent.click(screen.getByTestId('dispatch-waitlist-submit'));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Enter a valid email address.'
      )
    );
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it('survives a network failure without losing the form', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    render(<DispatchWaitlistForm />);
    fireEvent.change(screen.getByLabelText('The Dispatch'), {
      target: { value: 'player@example.com' },
    });
    fireEvent.click(screen.getByTestId('dispatch-waitlist-submit'));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/could not reach the server/i)
    );
    expect(screen.getByTestId('dispatch-waitlist-submit')).not.toBeDisabled();
  });
});

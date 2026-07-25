import { fireEvent, render, screen, waitFor } from '@testing-library/react';

let searchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { DispatchTokenAction } from './DispatchTokenAction';

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('DispatchTokenAction', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    searchParams = new URLSearchParams();
  });

  it('never confirms on load — a machine following the link changes nothing', () => {
    searchParams = new URLSearchParams('token=abc123');
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<DispatchTokenAction action="confirm" />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('dispatch-token-submit')).toBeInTheDocument();
  });

  it('confirms only after the human presses the button', async () => {
    searchParams = new URLSearchParams('token=abc123');
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ outcome: 'confirmed' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<DispatchTokenAction action="confirm" />);
    fireEvent.click(screen.getByTestId('dispatch-token-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('dispatch-outcome')).toHaveTextContent(
        /you are on the dispatch/i
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/growth/dispatch/confirm',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('explains an expired link instead of pretending it worked', async () => {
    searchParams = new URLSearchParams('token=abc123');
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ outcome: 'expired' })) as unknown as typeof fetch;

    render(<DispatchTokenAction action="confirm" />);
    fireEvent.click(screen.getByTestId('dispatch-token-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('dispatch-outcome')).toHaveTextContent(/expired/i)
    );
  });

  it('shows the invalid message and no button when the link carries no token', () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<DispatchTokenAction action="confirm" />);

    expect(screen.queryByTestId('dispatch-token-submit')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/not valid/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('unsubscribes in one press, with no retention plea (Rule 7)', async () => {
    searchParams = new URLSearchParams('token=abc123');
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ outcome: 'unsubscribed' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { container } = render(<DispatchTokenAction action="unsubscribe" />);
    expect(container.textContent).toMatch(/no questions/i);

    fireEvent.click(screen.getByTestId('dispatch-token-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('dispatch-outcome')).toHaveTextContent(
        /we will not write again/i
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/growth/dispatch/unsubscribe',
      expect.anything()
    );
  });
});

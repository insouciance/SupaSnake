/**
 * The World Signal surface, flag OFF — the tested rollback path.
 *
 * `src/lib/signal/config.ts` promises that the off path is exercised
 * explicitly rather than inferred from an omitted flag. This file is that
 * proof for the surface half: with `SIGNAL_V1_ENABLED` false the component
 * renders nothing at all and reads nothing at all, so unsetting
 * `NEXT_PUBLIC_SIGNAL_V1` takes the Signal off Home without touching a line of
 * code.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { SignalSurface } from './SignalSurface';

jest.mock('@/lib/signal/config', () => ({ SIGNAL_V1_ENABLED: false }));

describe('SignalSurface (flag off)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('renders nothing and reads nothing', async () => {
    const { container } = render(
      <SignalSurface token="test-token" onTake={jest.fn()} />
    );

    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('signal-surface')).not.toBeInTheDocument();
    expect(screen.queryByTestId('signal-chip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('signal-card')).not.toBeInTheDocument();
  });

  it('leaves no measurable trace a player could tap', () => {
    const { container } = render(
      <SignalSurface token="test-token" onTake={jest.fn()} taking takeError="x" />
    );

    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.textContent).toBe('');
  });
});

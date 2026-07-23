import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConsentBanner } from './ConsentBanner';

const rect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 375,
  bottom: 137,
  width: 375,
  height: 137,
  toJSON: () => ({}),
};

describe('ConsentBanner', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.style.removeProperty('--consent-banner-height');
    delete document.documentElement.dataset.consentVisible;
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('publishes its measured height and keeps all summary actions touch-sized', async () => {
    render(<ConsentBanner />);

    await screen.findByRole('region', { name: /cookie consent/i });
    await waitFor(() => {
      expect(
        document.documentElement.style.getPropertyValue('--consent-banner-height')
      ).toBe('137px');
    });
    expect(document.documentElement.dataset.consentVisible).toBe('true');

    for (const name of ['Customize', 'Reject All', 'Accept All']) {
      expect(screen.getByRole('button', { name })).toHaveClass('min-h-[44px]');
    }
  });

  it('offers accessible switches in a scrollable preference sheet', async () => {
    render(<ConsentBanner />);
    fireEvent.click(await screen.findByRole('button', { name: 'Customize' }));

    const sheet = screen.getByRole('dialog', { name: /cookie preferences/i });
    expect(sheet).toBeVisible();
    const analytics = screen.getByRole('switch', { name: /analytics cookies/i });
    expect(analytics).toHaveAttribute('aria-checked', 'false');
    expect(analytics).toHaveClass('h-11');

    fireEvent.click(analytics);
    expect(analytics).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /cookie consent/i })).not.toBeInTheDocument();
    });
    expect(JSON.parse(window.localStorage.getItem('cookie-consent') ?? '{}')).toEqual(
      expect.objectContaining({
        essential: true,
        functional: false,
        analytics: true,
        marketing: false,
      })
    );
    expect(
      document.documentElement.style.getPropertyValue('--consent-banner-height')
    ).toBe('');
  });

  it('stays hidden when a consent choice already exists', async () => {
    window.localStorage.setItem(
      'cookie-consent',
      JSON.stringify({
        essential: true,
        functional: false,
        analytics: false,
        marketing: false,
        timestamp: new Date().toISOString(),
      })
    );

    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /cookie consent/i })).not.toBeInTheDocument();
    });
  });
});

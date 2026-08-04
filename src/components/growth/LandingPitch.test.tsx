import { render, screen } from '@testing-library/react';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@/lib/analytics/posthog', () => ({ trackEvent: jest.fn() }));

import { LandingPitch } from './LandingPitch';

describe('LandingPitch', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('answers "what is this" for a scroller and a crawler', () => {
    render(<LandingPitch />);
    expect(
      screen.getByRole('heading', { level: 2, name: /what is supasnake\?/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/you know snake/i)).toBeInTheDocument();
  });

  it('leads with the extraction, which is the product', () => {
    render(<LandingPitch />);
    expect(screen.getByText('BANK')).toBeInTheDocument();
    expect(screen.getByText('RIDE ON')).toBeInTheDocument();
    expect(screen.getByText('TRADE UP')).toBeInTheDocument();
  });

  it('publishes the player contract as the pitch (§11.1)', () => {
    const { container } = render(<LandingPitch />);
    expect(container.textContent).toMatch(/No ads\. Ever\./);
    expect(container.textContent).toMatch(/no loot boxes/i);
    expect(container.textContent).toMatch(/Nothing you can buy moves a number/i);
  });

  it('carries the Dispatch waitlist', () => {
    render(<LandingPitch />);
    expect(screen.getByTestId('dispatch-waitlist')).toBeInTheDocument();
  });

  it('is not commerce (Rule 7): no store link and no price', () => {
    const { container } = render(<LandingPitch />);
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href')
    );
    expect(links).not.toContain('/shop');
    expect(container.textContent).not.toMatch(/€|\bbuy now\b|\bsubscribe\b|\bcheckout\b/i);
  });

  it('has no interactive element that could add a tap to the play path', () => {
    render(<LandingPitch />);
    // The only button below the fold is the waitlist submit; nothing here
    // competes with, precedes, or displaces LAUNCH.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute('data-testid', 'dispatch-waitlist-submit');
  });
});

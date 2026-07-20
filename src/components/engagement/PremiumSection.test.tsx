/**
 * PremiumSection tests - the shop subscription card.
 * Consent gating (both boxes required), anonymous CTA, plan toggle, and
 * the subscribed state (stipend claim + manage button).
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PremiumSection } from './PremiumSection';
import { usePremiumStore, initialState } from '@/lib/stores/premiumStore';

const mockUseAuth = jest.fn();
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

function setAuth(opts: { isAnonymous: boolean; authenticated?: boolean }) {
  mockUseAuth.mockReturnValue({
    session: { access_token: 'test-token' },
    isAuthenticated: opts.authenticated ?? true,
    isAnonymous: opts.isAnonymous,
  });
}

describe('PremiumSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePremiumStore.setState({ ...initialState });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ live: true, isPremium: false }),
    }) as jest.Mock;
  });

  it('renders the perk list with the gross EUR price', () => {
    setAuth({ isAnonymous: false });
    render(<PremiumSection onRequireAccount={jest.fn()} />);

    expect(screen.getByTestId('premium-section')).toBeInTheDocument();
    expect(screen.getByText('€9.99')).toBeInTheDocument();
    expect(screen.getByText(/incl\. VAT/)).toBeInTheDocument();
    expect(screen.getByText('Season Pass included')).toBeInTheDocument();
  });

  it('switches to the yearly price via the plan toggle', () => {
    setAuth({ isAnonymous: false });
    render(<PremiumSection onRequireAccount={jest.fn()} />);

    fireEvent.click(screen.getByTestId('premium-plan-premium_yearly'));
    expect(screen.getByText('€89.99')).toBeInTheDocument();
    expect(screen.getByText('2 months free')).toBeInTheDocument();
  });

  it('blocks subscribe until BOTH consents are ticked', async () => {
    setAuth({ isAnonymous: false });
    render(<PremiumSection onRequireAccount={jest.fn()} />);

    fireEvent.click(screen.getByTestId('premium-subscribe'));
    expect(
      screen.getByText('Please confirm both statements below first.')
    ).toBeInTheDocument();

    // One consent alone is not enough
    fireEvent.click(screen.getByLabelText(/I expressly request that the Premium service/));
    fireEvent.click(screen.getByTestId('premium-subscribe'));
    expect(
      screen.getByText('Please confirm both statements below first.')
    ).toBeInTheDocument();

    const checkoutCalls = (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
      String(url).includes('/api/premium/checkout')
    );
    expect(checkoutCalls).toHaveLength(0);
  });

  it('posts to premium checkout with both consents once ticked', async () => {
    setAuth({ isAnonymous: false });
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('/api/premium/checkout')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ sessionId: 'cs_1', url: undefined }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ live: true, isPremium: false }),
      });
    });
    render(<PremiumSection onRequireAccount={jest.fn()} />);

    fireEvent.click(screen.getByLabelText(/I expressly request that the Premium service/));
    fireEvent.click(screen.getByLabelText(/at least 18 years old/));
    fireEvent.click(screen.getByTestId('premium-subscribe'));

    await waitFor(() => {
      const checkoutCalls = (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
        String(url).includes('/api/premium/checkout')
      );
      expect(checkoutCalls).toHaveLength(1);
      const body = JSON.parse(checkoutCalls[0][1].body);
      expect(body).toEqual({
        planId: 'premium_monthly',
        serviceStartConsent: true,
        adultConfirmation: true,
      });
    });
  });

  it('shows the create-account CTA for anonymous users', () => {
    setAuth({ isAnonymous: true });
    const onRequireAccount = jest.fn();
    render(<PremiumSection onRequireAccount={onRequireAccount} />);

    fireEvent.click(screen.getByTestId('premium-create-account'));
    expect(onRequireAccount).toHaveBeenCalled();
    expect(screen.queryByTestId('premium-subscribe')).not.toBeInTheDocument();
  });

  describe('subscribed state', () => {
    beforeEach(() => {
      usePremiumStore.setState({
        live: true,
        isPremium: true,
        status: 'active',
        billingInterval: 'month',
        currentPeriodEnd: '2026-08-19T00:00:00Z',
        cancelAtPeriodEnd: false,
        stipendClaimedToday: false,
        currentDrop: {
          id: 'premium_trail_ion_wake',
          name: 'Ion Wake',
          slot: 'trail',
          rarity: 'epic',
          claimed: false,
        },
      });
    });

    it('shows billing summary, manage button and the stipend claim', () => {
      setAuth({ isAnonymous: false });
      render(<PremiumSection onRequireAccount={jest.fn()} />);

      expect(screen.getByTestId('premium-subscribed')).toBeInTheDocument();
      expect(screen.getByTestId('premium-manage')).toBeInTheDocument();
      expect(screen.getByTestId('premium-claim-stipend')).toBeInTheDocument();
      expect(screen.getByTestId('premium-current-drop')).toHaveTextContent('Ion Wake');
      expect(screen.queryByTestId('premium-subscribe')).not.toBeInTheDocument();
    });

    it('shows the claimed marker once the stipend is taken', () => {
      usePremiumStore.setState({ stipendClaimedToday: true });
      setAuth({ isAnonymous: false });
      render(<PremiumSection onRequireAccount={jest.fn()} />);

      expect(screen.getByTestId('premium-stipend-claimed')).toBeInTheDocument();
      expect(screen.queryByTestId('premium-claim-stipend')).not.toBeInTheDocument();
    });
  });
});

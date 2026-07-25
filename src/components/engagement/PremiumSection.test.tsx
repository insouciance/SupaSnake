/**
 * PremiumSection tests - the shop subscription card.
 * Consent gating (both boxes required), anonymous CTA, plan toggle, the
 * truthfulness of the advertised perk list (§10.2/§10.4), and the subscribed
 * state (cosmetic drop + manage button; there is no stipend to claim).
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

    // The advertised perks are exactly the three that ship, and all three
    // are expressive (Constitution §10.2).
    expect(screen.getByText('Monthly exclusive cosmetic')).toBeInTheDocument();
    expect(screen.getByText('Supporter prestige')).toBeInTheDocument();
    expect(screen.getByText('Lab Analytics')).toBeInTheDocument();
  });

  it('advertises no perk that WP-0.09 removed (§10.4)', () => {
    // "Season Pass included" had no content behind it (Season 1 seeds no
    // premium tiers); "Triple Contracts" and "Extended Lab Uptime" were paid
    // progression rates and are deleted from the server by migration 042.
    // An advertisement is a claim, so an unshipped line here is a false one.
    setAuth({ isAnonymous: false });
    render(<PremiumSection onRequireAccount={jest.fn()} />);

    expect(screen.queryByText(/season pass/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/contracts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/lab uptime/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/breeding/i)).not.toBeInTheDocument();
    // Nothing a subscription delivers is a quantity of energy or DNA.
    expect(screen.queryByText(/energy/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bDNA\b/)).not.toBeInTheDocument();
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

    it('shows billing summary, manage button and the cosmetic drop', () => {
      setAuth({ isAnonymous: false });
      render(<PremiumSection onRequireAccount={jest.fn()} />);

      expect(screen.getByTestId('premium-subscribed')).toBeInTheDocument();
      expect(screen.getByTestId('premium-manage')).toBeInTheDocument();
      expect(screen.getByTestId('premium-current-drop')).toHaveTextContent('Ion Wake');
      expect(screen.queryByTestId('premium-subscribe')).not.toBeInTheDocument();
    });

    it('offers no energy stipend anywhere (Constitution §8.6, §10.4)', () => {
      // Energy is on the never-sold list. A subscription may not reach the
      // pacing layer - not as a purchase, and not as a perk.
      setAuth({ isAnonymous: false });
      render(<PremiumSection onRequireAccount={jest.fn()} />);

      expect(screen.queryByTestId('premium-claim-stipend')).not.toBeInTheDocument();
      expect(screen.queryByTestId('premium-stipend-claimed')).not.toBeInTheDocument();
      expect(screen.queryByText(/stipend/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/energy/i)).not.toBeInTheDocument();
    });
  });
});

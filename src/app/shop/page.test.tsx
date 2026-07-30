/**
 * Shop page tests — one commercial surface, and no one-time storefront.
 *
 * Authority: docs/PRODUCT_CONSTITUTION.md §10.2/§10.4 and Rule 7 (at most one
 * commercial surface per screen).
 *
 * WP-0.09 deleted the one-time storefront: the Energy Packs section (§8.6/§10.4
 * — Energy recovers only and can never be topped up) and the Bundles
 * section (both bundles sold energy, DNA and a variant). What used to be
 * "shows Buy buttons" and "replaces every Buy button with a create-account CTA"
 * is now written against the surviving surface, `PremiumSection`, because that
 * is where the purchase and the anonymous-account gate actually live. The
 * anonymous gate is still real behaviour and is still covered here; the
 * catalogue-wide "no SKU grants energy, DNA or progression" invariant lives in
 * src/lib/stripe/products.test.ts.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import ShopPage from './page';
import { ALL_PRODUCTS } from '@/lib/stripe/products';

const mockUseAuth = jest.fn();
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

// Shop mounts the shared NavBar (uses usePathname)
jest.mock('next/navigation', () => ({
  usePathname: () => '/shop',
}));

jest.mock('@/hooks/useWalletSync', () => ({
  useWalletSync: () => ({
    dnaBalance: 100,
    charge: {
      remaining: 3,
      perDay: 6,
      usedToday: 3,
      day: '2026-07-25',
      refillsAt: '2026-07-26T00:00:00.000Z',
      visible: true,
    },
  }),
}));

/** An account old enough that no first-session gating could hide anything. */
const DAY_3_AGO = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

function setAuth(opts: { isAnonymous: boolean }) {
  mockUseAuth.mockReturnValue({
    user: { id: 'user-1', created_at: DAY_3_AGO },
    session: { access_token: 'test-token' },
    isAuthenticated: true,
    isAnonymous: opts.isAnonymous,
    isLoading: false,
    upgradeAnonymousToEmail: jest.fn(),
    signInWithOAuth: jest.fn(),
  });
}

/** Every `create-account-cta-<productId>` the deleted storefront used to render. */
function oneTimeCtas(): Element[] {
  return Array.from(
    document.querySelectorAll('[data-testid^="create-account-cta-"]')
  );
}

describe('Shop page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    global.fetch = jest.fn() as jest.Mock;
    window.history.replaceState({}, '', '/shop');
  });

  describe('registered users', () => {
    it('renders exactly one commercial surface: the subscription card (R7)', () => {
      setAuth({ isAnonymous: false });
      render(<ShopPage />);

      expect(screen.getByTestId('premium-section')).toBeInTheDocument();
      expect(screen.getByTestId('premium-subscribe')).toBeInTheDocument();
      // The one-time storefront is gone, not hidden: there is no catalogue
      // left for it to render.
      expect(ALL_PRODUCTS).toHaveLength(0);
      expect(screen.queryByText('Buy')).not.toBeInTheDocument();
      expect(screen.queryByText('Buy Bundle')).not.toBeInTheDocument();
      expect(screen.queryByText('Bundles')).not.toBeInTheDocument();
      expect(oneTimeCtas()).toHaveLength(0);
    });

    it('sells no Energy anywhere (Constitution §8.6, §10.4)', () => {
      // Energy is on the never-sold list and recovers only
      // with no balance to top up — those SKUs could no longer deliver
      // anything at all. A listing that takes money for a good that does
      // not exist is worse than a dead code path.
      setAuth({ isAnonymous: false });
      render(<ShopPage />);

      expect(screen.queryByText('Energy Packs')).not.toBeInTheDocument();
      // Nothing on the page mentions energy at all — not a section, not a
      // SKU name, and not a bundle line item ("20 Energy").
      expect(screen.queryByText(/energy/i)).not.toBeInTheDocument();
    });

    it('states in the fair-play notice that nothing earned is for sale', () => {
      setAuth({ isAnonymous: false });
      render(<ShopPage />);

      expect(
        screen.getByText(/Every variant, gene and record is earned by playing/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/never power, currency or progress/)
      ).toBeInTheDocument();
    });
  });

  describe('anonymous users', () => {
    it('replaces the purchase button with a create-account CTA', () => {
      setAuth({ isAnonymous: true });
      render(<ShopPage />);

      expect(screen.getByTestId('premium-create-account')).toBeInTheDocument();
      expect(screen.queryByTestId('premium-subscribe')).not.toBeInTheDocument();
      expect(screen.queryByText('Buy')).not.toBeInTheDocument();
      expect(screen.queryByText('Buy Bundle')).not.toBeInTheDocument();
    });

    it('opens the account upgrade modal from the CTA without calling checkout', () => {
      setAuth({ isAnonymous: true });
      render(<ShopPage />);

      fireEvent.click(screen.getByTestId('premium-create-account'));

      expect(screen.getByTestId('account-upgrade-modal')).toBeInTheDocument();
      // The premium section may read /api/premium/status on mount, but no
      // checkout request may ever fire for an anonymous account
      const checkoutCalls = (global.fetch as jest.Mock).mock.calls.filter(
        ([url]) =>
          String(url).includes('/api/checkout') ||
          String(url).includes('/api/premium/checkout')
      );
      expect(checkoutCalls).toHaveLength(0);
    });

    it('shows the save-progress notice with an account button', () => {
      setAuth({ isAnonymous: true });
      render(<ShopPage />);

      expect(screen.getByText('Save your progress!')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Create Account'));
      expect(screen.getByTestId('account-upgrade-modal')).toBeInTheDocument();
    });
  });
});

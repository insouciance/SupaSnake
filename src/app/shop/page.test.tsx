/**
 * Shop page tests - anonymous purchase protection
 * Purchases must land on real accounts, never ephemeral anonymous ones.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import ShopPage from './page';
import { BUNDLE_PRODUCTS, ENERGY_PRODUCTS } from '@/lib/stripe/products';

const mockUseAuth = jest.fn();
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

// Shop now mounts the shared NavBar (uses usePathname)
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

/** Bundles only render from account Day 2 (shouldShowBundles). */
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

describe('Shop page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    global.fetch = jest.fn() as jest.Mock;
    window.history.replaceState({}, '', '/shop');
  });

  describe('registered users', () => {
    it('shows Buy buttons', () => {
      setAuth({ isAnonymous: false });
      render(<ShopPage />);

      expect(screen.getAllByText('Buy Bundle').length).toBeGreaterThan(0);
      expect(
        screen.queryByText('Create an account to purchase')
      ).not.toBeInTheDocument();
    });

    it('sells no Energy anywhere (Constitution §8.6, §10.4)', () => {
      // Energy is on the never-sold list, and charges are a daily allotment
      // with no balance to top up - these SKUs could no longer deliver
      // anything at all. A listing that takes money for a good that does
      // not exist is worse than a dead code path.
      setAuth({ isAnonymous: false });
      render(<ShopPage />);

      expect(screen.queryByText('Energy Packs')).not.toBeInTheDocument();
      for (const product of ENERGY_PRODUCTS) {
        expect(screen.queryByText(product.name)).not.toBeInTheDocument();
        expect(
          screen.queryByTestId(`create-account-cta-${product.id}`)
        ).not.toBeInTheDocument();
      }
      // Bundles must not advertise an energy component either.
      expect(screen.queryByText(/\d+ Energy/)).not.toBeInTheDocument();
    });
  });

  describe('anonymous users', () => {
    it('replaces every Buy button with a create-account CTA', () => {
      setAuth({ isAnonymous: true });
      render(<ShopPage />);

      expect(screen.queryByText('Buy')).not.toBeInTheDocument();
      expect(screen.queryByText('Buy Bundle')).not.toBeInTheDocument();
      expect(
        screen.getAllByText('Create an account to purchase').length
      ).toBeGreaterThanOrEqual(BUNDLE_PRODUCTS.length);
    });

    it('opens the account upgrade modal from the CTA without calling checkout', () => {
      setAuth({ isAnonymous: true });
      render(<ShopPage />);

      fireEvent.click(
        screen.getByTestId(`create-account-cta-${BUNDLE_PRODUCTS[0].id}`)
      );

      expect(screen.getByTestId('account-upgrade-modal')).toBeInTheDocument();
      // The premium section may read /api/premium/status on mount, but no
      // checkout request may ever fire for an anonymous account
      const checkoutCalls = (global.fetch as jest.Mock).mock.calls.filter(
        ([url]) => String(url).includes('/api/checkout') || String(url).includes('/api/premium/checkout')
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

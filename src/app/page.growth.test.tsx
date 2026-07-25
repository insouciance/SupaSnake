/**
 * The growth flag's two states on the landing page, asserted explicitly.
 *
 * Project rule: never let CI infer a rollback path from an omitted flag. The
 * flag-off case gets the same coverage as the flag-on case, and both assert
 * that the §5-protected fold is untouched either way — LAUNCH is present and
 * the pitch lives strictly after the chamber.
 */

import { render, screen } from '@testing-library/react';

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    const DynamicStub = () => <div data-testid="specimen-chamber" />;
    return DynamicStub;
  },
}));

jest.mock('@/components/ui/Navigation', () => ({
  Navigation: () => <div data-testid="navigation" />,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@/components/ftue/StarterSelection', () => ({
  StarterSelection: () => <div data-testid="starter-selection" />,
}));

jest.mock('@/lib/analytics/posthog', () => ({
  trackEvent: jest.fn(),
  setUserProperties: jest.fn(),
  isAnalyticsInitialized: () => false,
  onAnalyticsReady: () => () => {},
}));

const mockUseAuth = jest.fn();
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

// The flag's env parsing is proven in src/lib/features/growth.test.ts. Here
// the resolved value is swapped through a getter, because re-requiring the
// page under jest.resetModules() would hand it a second React instance.
let growthSurfacesEnabled = false;
jest.mock('@/lib/features/growth', () => ({
  get GROWTH_SURFACES_V1_ENABLED() {
    return growthSurfacesEnabled;
  },
}));

import Home from './page';

function renderHome(enabled: boolean, authenticated = false) {
  growthSurfacesEnabled = enabled;
  mockUseAuth.mockReturnValue({
    isAuthenticated: authenticated,
    isLoading: false,
    signInAnonymously: jest.fn(),
    session: null,
  });
  return render(<Home />);
}

describe('landing page — growth surfaces flag', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }) as unknown as typeof fetch;
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    growthSurfacesEnabled = false;
  });

  describe('flag off (the default and the rollback path)', () => {
    it('renders no below-the-fold pitch', () => {
      renderHome(false);
      expect(screen.queryByTestId('landing-pitch')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dispatch-waitlist')).not.toBeInTheDocument();
    });

    it('still renders the protected fold', () => {
      renderHome(false);
      expect(screen.getByText('SUPASNAKE')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /launch/i })).toBeInTheDocument();
    });
  });

  describe('flag on', () => {
    it('renders the pitch and the waitlist for a logged-out visitor', () => {
      renderHome(true);
      expect(screen.getByTestId('landing-pitch')).toBeInTheDocument();
      expect(screen.getByTestId('dispatch-waitlist')).toBeInTheDocument();
    });

    it('keeps the pitch strictly after the chamber, so the fold is unchanged', () => {
      const { container } = renderHome(true);
      const main = container.querySelector('main');
      const pitch = screen.getByTestId('landing-pitch');
      expect(main).not.toBeNull();
      expect(main!.contains(pitch)).toBe(false);
      expect(
        main!.compareDocumentPosition(pitch) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: /launch/i })).toBeInTheDocument();
    });

    it('shows a signed-in player the game, not the pitch', () => {
      renderHome(true, true);
      expect(screen.queryByTestId('landing-pitch')).not.toBeInTheDocument();
    });
  });
});

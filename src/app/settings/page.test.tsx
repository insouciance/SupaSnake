/**
 * Settings Page Tests
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock the auth hook. useAuth delegates to a mutable implementation so
// individual tests can swap the auth state without jest.resetModules()
// (resetting modules would re-import a second React copy and break hooks).
const mockSignOut = jest.fn();
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  created_at: '2024-01-01T00:00:00Z',
};

const authenticatedAuthState = () => ({
  user: mockUser,
  signOut: mockSignOut,
  getToken: jest.fn().mockResolvedValue('mock-token'),
});
let mockUseAuthImpl: () => object = authenticatedAuthState;

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuthImpl(),
}));

// Mock the profile components
jest.mock('@/components/profile/CareerStats', () => ({
  CareerStats: () => <div data-testid="career-stats">Career Stats Component</div>,
}));

// Mock the Identity panel (it fetches /api/player/identity - covered by
// its own tests; the page test only cares that it is mounted)
jest.mock('@/components/identity/IdentityPanel', () => ({
  IdentityPanel: () => <div data-testid="identity-panel">Identity Panel Component</div>,
}));

// Identity v1 I2 (section 6.6): the achievements display surface
// retired from settings into the Chronicle (/profile) - the page must
// NOT mount it anymore (no mock needed; its absence is asserted below).

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    ...rest
  }: { children: React.ReactNode; href: string } & Record<string, unknown>) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  };
});

// Mock next/navigation (NavBar uses usePathname)
jest.mock('next/navigation', () => ({
  usePathname: () => '/settings',
  useRouter: () => ({ push: jest.fn() }),
}));

import SettingsPage from './page';

describe('SettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the profile header', () => {
      render(<SettingsPage />);
      // "Profile" also appears in the NavBar link, so scope to the heading
      // (Identity v1 renamed the page to "Handler Profile")
      expect(screen.getByRole('heading', { name: 'Handler Profile' })).toBeInTheDocument();
    });

    it('renders the Identity panel (Player Identity v1)', () => {
      render(<SettingsPage />);
      expect(screen.getByTestId('identity-panel')).toBeInTheDocument();
    });

    it('displays user email', () => {
      render(<SettingsPage />);
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('renders CareerStats component', () => {
      render(<SettingsPage />);
      expect(screen.getByTestId('career-stats')).toBeInTheDocument();
    });

    it('no longer renders the achievements panel (retired into the Chronicle, section 6.6)', () => {
      render(<SettingsPage />);
      expect(screen.queryByTestId('achievement-badges')).not.toBeInTheDocument();
    });

    it('links to the Chronicle (the career surface owns achievements now)', () => {
      render(<SettingsPage />);
      const link = screen.getByTestId('chronicle-link');
      expect(link).toHaveAttribute('href', '/profile');
      expect(link).toHaveTextContent('The Chronicle');
    });

    it('displays quick links', () => {
      render(<SettingsPage />);
      // "Leaderboard" and "Shop" also appear in the NavBar, so expect multiple
      expect(screen.getAllByText('Leaderboard').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Breeding Lab')).toBeInTheDocument();
      expect(screen.getAllByText('Shop').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Privacy')).toBeInTheDocument();
    });

    it('displays sign out button', () => {
      render(<SettingsPage />);
      expect(screen.getByText('Sign Out')).toBeInTheDocument();
    });

    it('shows link back to the game', () => {
      render(<SettingsPage />);
      // The page's return-to-game affordance is the "Play" link
      const playLink = screen.getByRole('link', { name: 'Play' });
      expect(playLink).toHaveAttribute('href', '/game');
    });
  });

  describe('sign out', () => {
    it('calls signOut when button clicked', async () => {
      render(<SettingsPage />);
      const signOutButton = screen.getByText('Sign Out');
      signOutButton.click();
      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});

describe('SettingsPage unauthenticated', () => {
  afterEach(() => {
    mockUseAuthImpl = authenticatedAuthState;
  });

  it('shows sign in prompt when not authenticated', () => {
    mockUseAuthImpl = () => ({
      user: null,
      signOut: jest.fn(),
      getToken: jest.fn(),
    });

    render(<SettingsPage />);

    expect(screen.getByRole('heading', { name: /please sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign In' })).toBeInTheDocument();
  });
});

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

jest.mock('@/components/profile/AchievementBadges', () => ({
  AchievementBadges: () => <div data-testid="achievement-badges">Achievement Badges Component</div>,
}));

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
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
      expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    });

    it('displays user email', () => {
      render(<SettingsPage />);
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('renders CareerStats component', () => {
      render(<SettingsPage />);
      expect(screen.getByTestId('career-stats')).toBeInTheDocument();
    });

    it('renders AchievementBadges component', () => {
      render(<SettingsPage />);
      expect(screen.getByTestId('achievement-badges')).toBeInTheDocument();
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

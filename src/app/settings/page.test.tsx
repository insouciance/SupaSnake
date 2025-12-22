/**
 * Settings Page Tests
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock the auth hook
const mockSignOut = jest.fn();
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  created_at: '2024-01-01T00:00:00Z',
};

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: mockUser,
    signOut: mockSignOut,
    getToken: jest.fn().mockResolvedValue('mock-token'),
  }),
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

import SettingsPage from './page';

describe('SettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the profile header', () => {
      render(<SettingsPage />);
      expect(screen.getByText('Profile')).toBeInTheDocument();
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
      expect(screen.getByText('Leaderboard')).toBeInTheDocument();
      expect(screen.getByText('Breeding Lab')).toBeInTheDocument();
      expect(screen.getByText('Shop')).toBeInTheDocument();
      expect(screen.getByText('Privacy')).toBeInTheDocument();
    });

    it('displays sign out button', () => {
      render(<SettingsPage />);
      expect(screen.getByText('Sign Out')).toBeInTheDocument();
    });

    it('shows back link', () => {
      render(<SettingsPage />);
      expect(screen.getByText('Back')).toBeInTheDocument();
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
  beforeEach(() => {
    jest.resetModules();
  });

  it('shows sign in prompt when not authenticated', async () => {
    jest.doMock('@/lib/auth/AuthProvider', () => ({
      useAuth: () => ({
        user: null,
        signOut: jest.fn(),
        getToken: jest.fn(),
      }),
    }));

    // Re-import after mock update
    const { default: UnauthPage } = await import('./page');
    render(<UnauthPage />);

    expect(screen.getByText('Please sign in')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });
});

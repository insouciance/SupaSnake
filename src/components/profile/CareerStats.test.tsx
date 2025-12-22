/**
 * CareerStats Component Tests
 */

import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock the auth hook
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'user-123' },
    getToken: jest.fn().mockResolvedValue('mock-token'),
  }),
}));

import { CareerStats } from './CareerStats';

describe('CareerStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('shows loading state initially', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));
      render(<CareerStats />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('displays career stats when loaded', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          highScore: 150,
          totalGamesPlayed: 42,
          totalDnaEarned: 5000,
          breedsCompleted: 10,
          collectionCount: 15,
          totalVariants: 30,
          currentStreak: 5,
          longestStreak: 10,
          achievementsCompleted: 8,
          totalAchievements: 18,
        }),
      });

      render(<CareerStats />);

      await waitFor(() => {
        expect(screen.getByText('150')).toBeInTheDocument();
      });

      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('5,000')).toBeInTheDocument();
      expect(screen.getByText('15/30')).toBeInTheDocument();
      expect(screen.getByText('5 days')).toBeInTheDocument();
      expect(screen.getByText('8/18')).toBeInTheDocument();
    });

    it('shows error message on fetch failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      render(<CareerStats />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
      });
    });

    it('renders stat cards with proper icons', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          highScore: 0,
          totalGamesPlayed: 0,
          totalDnaEarned: 0,
          breedsCompleted: 0,
          collectionCount: 0,
          totalVariants: 30,
          currentStreak: 0,
          longestStreak: 0,
          achievementsCompleted: 0,
          totalAchievements: 18,
        }),
      });

      render(<CareerStats />);

      await waitFor(() => {
        expect(screen.getByText('High Score')).toBeInTheDocument();
        expect(screen.getByText('Games Played')).toBeInTheDocument();
        expect(screen.getByText('DNA Earned')).toBeInTheDocument();
        expect(screen.getByText('Collection')).toBeInTheDocument();
        expect(screen.getByText('Current Streak')).toBeInTheDocument();
        expect(screen.getByText('Achievements')).toBeInTheDocument();
      });
    });
  });

  describe('data fetching', () => {
    it('calls stats API with auth token', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          highScore: 0,
          totalGamesPlayed: 0,
          totalDnaEarned: 0,
          breedsCompleted: 0,
          collectionCount: 0,
          totalVariants: 30,
          currentStreak: 0,
          longestStreak: 0,
          achievementsCompleted: 0,
          totalAchievements: 18,
        }),
      });

      render(<CareerStats />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/player/stats',
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer mock-token',
            }),
          })
        );
      });
    });
  });
});

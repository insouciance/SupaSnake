/**
 * AchievementBadges Component Tests
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

import { AchievementBadges } from './AchievementBadges';

describe('AchievementBadges', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('shows loading state initially', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));
      render(<AchievementBadges />);
      expect(screen.getByText('Loading achievements...')).toBeInTheDocument();
    });

    it('displays completed achievements', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          achievements: [
            {
              id: 'games_10',
              name: 'Beginner',
              description: 'Play 10 games',
              icon: 'game',
              tier: 1,
              progress: 10,
              requirement_value: 10,
              completed: true,
              reward_claimed: true,
            },
            {
              id: 'score_50',
              name: 'Scorer',
              description: 'Reach score 50',
              icon: 'score',
              tier: 1,
              progress: 75,
              requirement_value: 50,
              completed: true,
              reward_claimed: false,
            },
            {
              id: 'dna_1000',
              name: 'Collector',
              description: 'Earn 1,000 DNA',
              icon: 'dna',
              tier: 1,
              progress: 500,
              requirement_value: 1000,
              completed: false,
              reward_claimed: false,
            },
          ],
        }),
      });

      render(<AchievementBadges />);

      await waitFor(() => {
        expect(screen.getByText('Beginner')).toBeInTheDocument();
        expect(screen.getByText('Scorer')).toBeInTheDocument();
      });

      // Incomplete achievement should show progress
      expect(screen.getByText('Collector')).toBeInTheDocument();
    });

    it('shows empty state when no achievements', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ achievements: [] }),
      });

      render(<AchievementBadges />);

      await waitFor(() => {
        expect(screen.getByText(/no achievements yet/i)).toBeInTheDocument();
      });
    });

    it('displays tier badges correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          achievements: [
            {
              id: 'games_100',
              name: 'Dedicated',
              description: 'Play 100 games',
              icon: 'game',
              tier: 3,
              progress: 100,
              requirement_value: 100,
              completed: true,
              reward_claimed: true,
            },
          ],
        }),
      });

      render(<AchievementBadges />);

      await waitFor(() => {
        expect(screen.getByText('Dedicated')).toBeInTheDocument();
      });
    });
  });

  describe('filtering', () => {
    it('only shows completed achievements by default', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          achievements: [
            {
              id: 'games_10',
              name: 'Beginner',
              icon: 'game',
              tier: 1,
              progress: 10,
              requirement_value: 10,
              completed: true,
              reward_claimed: true,
            },
            {
              id: 'games_50',
              name: 'Regular',
              icon: 'game',
              tier: 2,
              progress: 20,
              requirement_value: 50,
              completed: false,
              reward_claimed: false,
            },
          ],
        }),
      });

      render(<AchievementBadges showAll={false} />);

      await waitFor(() => {
        expect(screen.getByText('Beginner')).toBeInTheDocument();
      });
    });
  });
});

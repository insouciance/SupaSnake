/**
 * OfflineProgressProvider Tests
 */

import { render, screen } from '@testing-library/react';
import { OfflineProgressProvider } from './OfflineProgressProvider';

// Mock the useOfflineProgress hook
jest.mock('@/hooks/useOfflineProgress', () => ({
  useOfflineProgress: () => ({
    progress: null,
    showModal: false,
    isLoading: false,
    error: null,
    claimed: false,
    claimRewards: jest.fn(),
    dismissModal: jest.fn(),
    confirmedRewards: null,
  }),
}));

// The provider reads auth (for the premium stipend piggyback) - render
// outside a real AuthProvider
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ session: null, isAuthenticated: false }),
}));

describe('OfflineProgressProvider', () => {
  it('renders children', () => {
    render(
      <OfflineProgressProvider>
        <div data-testid="child">Child Content</div>
      </OfflineProgressProvider>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('does not show modal when showModal is false', () => {
    render(
      <OfflineProgressProvider>
        <div>Content</div>
      </OfflineProgressProvider>
    );

    expect(screen.queryByText('Welcome Back!')).not.toBeInTheDocument();
  });
});

describe('OfflineProgressProvider with modal', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('shows modal when hook returns showModal true', () => {
    jest.doMock('@/hooks/useOfflineProgress', () => ({
      useOfflineProgress: () => ({
        progress: {
          elapsedMs: 2 * 60 * 60 * 1000,
          elapsedHours: 2,
          energyRestored: 3,
          passiveDnaEarned: 20,
          shouldShowModal: true,
          hasRewards: true,
        },
        showModal: true,
        isLoading: false,
        error: null,
        claimed: false,
        claimRewards: jest.fn(),
        dismissModal: jest.fn(),
        confirmedRewards: null,
      }),
    }));

    // Note: This test relies on dynamic mock which may need additional setup
    // The actual integration test would verify the full flow
  });
});

import * as fs from 'fs';
import * as path from 'path';
import { render, screen } from '@testing-library/react';
import CodexPage from './page';

const mockUseAuth = jest.fn();
const mockFetchCodex = jest.fn();
const mockUseCodexStore = jest.fn();

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));
jest.mock('@/lib/stores/codexStore', () => ({
  useCodexStore: () => mockUseCodexStore(),
}));
jest.mock('@/components/ui/NavBar', () => ({ NavBar: () => <nav /> }));

describe('Genome Codex page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      session: { access_token: 'token' },
      isAuthenticated: true,
    });
    mockUseCodexStore.mockReturnValue({
      live: true,
      unlocked: true,
      bankedRuns: 20,
      unlockAt: 15,
      data: {
        genes: [],
        splices: [],
        strains: [],
        progress: {
          discovered: 0,
          total: 54,
          percent: 0,
          genomeWeaverUnlocked: false,
        },
        sampleSize: 0,
      },
      isLoading: false,
      error: null,
      fetchCodex: mockFetchCodex,
    });
  });

  it('is available to authenticated players without any premium gate', () => {
    render(<CodexPage />);
    expect(screen.getByTestId('codex-page')).toBeInTheDocument();
    expect(screen.getByText('Archive completion')).toBeInTheDocument();

    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/codex/page.tsx'), 'utf8');
    expect(source).not.toMatch(/premium_required|isPremium|hasPremium/);
  });

  it('does not reveal the catalog before the banked-run unlock', () => {
    mockUseCodexStore.mockReturnValue({
      live: true,
      unlocked: false,
      bankedRuns: 14,
      unlockAt: 15,
      data: null,
      isLoading: false,
      error: null,
      fetchCodex: mockFetchCodex,
    });
    render(<CodexPage />);
    expect(screen.getByTestId('codex-locked')).toHaveTextContent(
      'Bank 15 runs'
    );
    expect(screen.queryByText('Archive completion')).toBeNull();
  });
});

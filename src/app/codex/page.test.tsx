import * as fs from 'fs';
import * as path from 'path';
import { render, screen } from '@testing-library/react';
import CodexPage from './page';
import { lexiconSection } from '@/shared/game/lexicon';

const mockUseAuth = jest.fn();
const mockFetchCodex = jest.fn();
const mockResetCodex = jest.fn();
const mockUseCodexStore = jest.fn();

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));
jest.mock('@/lib/stores/codexStore', () => ({
  useCodexStore: () => mockUseCodexStore(),
}));
jest.mock('@/components/ui/NavBar', () => ({ NavBar: () => <nav /> }));
jest.mock('@/lib/features/genomeV2', () => ({ GENOME_V2_ENABLED: false }));

const EMPTY_DATA = {
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
};

describe('Genome Codex page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      session: { access_token: 'token', user: { id: 'user-a' } },
      isAuthenticated: true,
    });
    mockUseCodexStore.mockReturnValue({
      ownerId: 'user-a',
      live: true,
      unlocked: true,
      bankedRuns: 20,
      unlockAt: 15,
      data: EMPTY_DATA,
      isLoading: false,
      error: null,
      fetchCodex: mockFetchCodex,
      reset: mockResetCodex,
    });
  });

  it('is available to authenticated players without any premium gate', () => {
    render(<CodexPage />);
    expect(screen.getByTestId('codex-page')).toBeInTheDocument();
    expect(screen.getByText('Archive completion')).toBeInTheDocument();

    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/codex/page.tsx'), 'utf8');
    expect(source).not.toMatch(/premium_required|isPremium|hasPremium/);
  });

  /**
   * REWRITTEN, not deleted (WP-2.07a). The old assertion — that a player
   * below the banked-run unlock sees `codex-locked` and NO catalog — was the
   * only guard on the discovery gate, and that gate is being kept. What
   * changed is its scope: it gates *discoveries*, never *rules*. The
   * narrower promise is asserted here instead.
   */
  it('reads the rules before the banked-run unlock, and says the archive is still waiting', () => {
    mockUseCodexStore.mockReturnValue({
      ownerId: 'user-a',
      live: true,
      unlocked: false,
      bankedRuns: 14,
      unlockAt: 15,
      data: EMPTY_DATA,
      isLoading: false,
      error: null,
      fetchCodex: mockFetchCodex,
      reset: mockResetCodex,
    });
    render(<CodexPage />);

    // The rules are there at 14 banked runs.
    expect(screen.getByTestId('codex-rules')).toBeInTheDocument();
    expect(screen.getByTestId('lexicon-mechanic-extraction_bank')).toBeInTheDocument();

    // The gate is still stated, and still states the same two numbers.
    const pending = screen.getByTestId('codex-discovery-pending');
    expect(pending).toHaveTextContent('15 banked runs');
    expect(pending).toHaveTextContent('You have banked 14');
  });

  it('renders every documented section for a signed-out visitor, with no fetch', () => {
    mockUseAuth.mockReturnValue({ session: null, isAuthenticated: false });
    render(<CodexPage />);

    // The contradiction this resolves: /codex sits in the public sitemap and
    // the public footer. A visitor who follows either must be able to read it.
    expect(screen.getByTestId('codex-rules')).toBeInTheDocument();
    for (const testId of [
      'lexicon-mechanics',
      'lexicon-dynasties',
      'lexicon-traits',
      'lexicon-strains',
      'lexicon-anomalies',
    ]) {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
    // The three extraction verbs, documented nowhere before this WP.
    expect(screen.getByText('BANK')).toBeInTheDocument();
    expect(screen.getByText('PASS')).toBeInTheDocument();
    expect(screen.getByText('INFUSE')).toBeInTheDocument();

    // The discovery layer, and only it, asks for an account.
    expect(screen.getByTestId('codex-signed-out')).toBeInTheDocument();
    expect(screen.queryByText('Archive completion')).toBeNull();
    expect(mockFetchCodex).not.toHaveBeenCalled();
    expect(mockResetCodex).toHaveBeenCalled();
  });

  it('lays out all fifteen strain tiers', () => {
    mockUseAuth.mockReturnValue({ session: null, isAuthenticated: false });
    render(<CodexPage />);
    const tiers = lexiconSection('strainTier');
    expect(tiers).toHaveLength(15);
    for (const entry of tiers) {
      const [strain, tier] = entry.id.split(':');
      expect(screen.getByTestId(`lexicon-tier-${strain}-${tier}`)).toBeInTheDocument();
    }
  });

  it('shows every tactical recipe while discovery remains separate history', () => {
    mockUseCodexStore.mockReturnValue({
      ownerId: 'user-a',
      live: true,
      unlocked: true,
      bankedRuns: 20,
      unlockAt: 15,
      data: {
        ...EMPTY_DATA,
        splices: [
          {
            id: 'splice_dragon_hoard',
            name: 'Dragon Hoard',
            parents: ['gold_trail', 'compound_interest'],
            strains: [],
            effect: 'dragon hoard effect',
            cost: 'dragon hoard cost',
            discoveries: 2,
            banks: 1,
            discovered: true,
            firstDiscoveredAt: null,
            worldFirstAt: null,
            rewardDna: 250,
          },
          {
            id: 'splice_all_in',
            name: 'All In',
            parents: null,
            strains: [],
            effect: 'all in effect',
            cost: 'all in cost',
            discoveries: 0,
            banks: 0,
            discovered: false,
            firstDiscoveredAt: null,
            worldFirstAt: null,
            rewardDna: 250,
          },
        ],
      },
      isLoading: false,
      error: null,
      fetchCodex: mockFetchCodex,
      reset: mockResetCodex,
    });
    render(<CodexPage />);

    expect(screen.getByTestId('codex-recipe-splice_dragon_hoard')).toHaveTextContent(
      'Gold Trail + Compound Interest'
    );
    expect(screen.getByTestId('codex-recipe-splice_all_in')).toHaveTextContent(
      'Recipe undiscovered'
    );
    expect(screen.queryByText('Compound Interest + Mirror Wager')).not.toBeInTheDocument();
    // Legacy discovery still changes archive history while v2 is off.
    expect(screen.getAllByText('All In').length).toBeGreaterThan(0);
    expect(screen.getByText('all in effect')).toBeInTheDocument();
    expect(screen.getByText('all in cost')).toBeInTheDocument();
  });

  it('fails closed synchronously when authenticated player B sees player A store state', () => {
    mockUseAuth.mockReturnValue({
      session: { access_token: 'token-b', user: { id: 'user-b' } },
      isAuthenticated: true,
    });
    mockUseCodexStore.mockReturnValue({
      ownerId: 'user-a',
      live: true,
      unlocked: true,
      bankedRuns: 99,
      unlockAt: 15,
      data: EMPTY_DATA,
      isLoading: false,
      error: null,
      fetchCodex: mockFetchCodex,
      reset: mockResetCodex,
    });

    render(<CodexPage />);

    expect(screen.getByText('Opening the Codex…')).toBeInTheDocument();
    expect(screen.queryByText('Archive completion')).not.toBeInTheDocument();
    expect(mockFetchCodex).toHaveBeenCalledWith('user-b', 'token-b');
  });

  it('puts the interactive strategy atlas before the reference grids', () => {
    mockUseAuth.mockReturnValue({ session: null, isAuthenticated: false });
    render(<CodexPage />);
    expect(screen.getByTestId('genome-strategy-atlas')).toBeInTheDocument();
    expect(screen.getByTestId('genome-strategy-atlas')).toHaveAttribute('data-rules-version', '1');
    expect(screen.getByLabelText('Genome consequence chain')).toHaveTextContent(
      /Offer.*Strain.*Splice.*BANK \/ crash/
    );
  });
});

import * as fs from 'fs';
import * as path from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import CodexPage from './page';
import { genomeResearchCopy } from './researchCopy';

const mockUseAuth = jest.fn();
const mockFetchCodex = jest.fn();
const mockResetCodex = jest.fn();
const mockUseCodexStore = jest.fn();

jest.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('@/lib/stores/codexStore', () => ({
  useCodexStore: () => mockUseCodexStore(),
}));
jest.mock('@/components/ui/NavBar', () => ({ NavBar: () => <nav /> }));
jest.mock('@/components/workbench/WorkbenchView', () => ({
  WorkbenchView: ({ studyRef }: { studyRef?: string | null }) => (
    <div data-testid="workbench-view" data-study-ref={studyRef ?? ''} />
  ),
}));
jest.mock('@/lib/features/genomeV2', () => ({ GENOME_V2_ENABLED: true }));
jest.mock('@/lib/features/workbench', () => ({ WORKBENCH_V1_ENABLED: true }));

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

describe('Genome Research compatibility page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState(null, '', '/codex');
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

  it('opens one Workbench destination without a premium gate or archive tab', () => {
    render(<CodexPage />);
    expect(screen.getByTestId('codex-page')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-view')).toBeInTheDocument();
    expect(screen.getByText('Genome Research')).toBeInTheDocument();
    expect(screen.queryByTestId('codex-views')).not.toBeInTheDocument();
    expect(screen.queryByTestId('codex-rules')).not.toBeInTheDocument();

    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/codex/page.tsx'), 'utf8');
    expect(source).not.toMatch(/premium_required|isPremium|hasPremium/);
  });

  it('keeps production, mixed rollback, and full rollback copy truthful', () => {
    expect(genomeResearchCopy(true, true)).toMatchObject({
      intro: expect.stringContaining('Touch a possible Genome'),
      signedOutRecord: expect.stringContaining('Workbench is open to everyone'),
    });
    expect(genomeResearchCopy(false, true)).toMatchObject({
      intro: expect.stringContaining('Sign in to plan a Genome'),
      signedOutRecord: expect.not.stringContaining('Workbench is open to everyone'),
    });
    expect(genomeResearchCopy(false, false)).toMatchObject({
      intro: expect.stringContaining('not active in this version'),
      signedOutRecord: expect.not.stringContaining('Workbench is open to everyone'),
    });
  });

  it('keeps Research open before personal discovery history unlocks', () => {
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

    expect(screen.getByTestId('workbench-view')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Your Research Record'));
    const pending = screen.getByTestId('codex-discovery-pending');
    expect(pending).toHaveTextContent('15 banked runs');
    expect(pending).toHaveTextContent('You have banked 14');
  });

  it('keeps the public Workbench visible while account history alone asks for sign-in', () => {
    mockUseAuth.mockReturnValue({ session: null, isAuthenticated: false });
    render(<CodexPage />);

    expect(screen.getByTestId('workbench-view')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Your Research Record'));
    expect(screen.getByTestId('codex-signed-out')).toHaveTextContent(
      'The Workbench is open to everyone'
    );
    expect(mockFetchCodex).not.toHaveBeenCalled();
    expect(mockResetCodex).toHaveBeenCalled();
  });

  it('preserves discovery recipes and history inside the subordinate record', () => {
    mockUseCodexStore.mockReturnValue({
      ownerId: 'user-a',
      live: true,
      unlocked: true,
      bankedRuns: 20,
      unlockAt: 15,
      data: {
        ...EMPTY_DATA,
        splices: [{
          id: 'splice_dragon_hoard',
          rulesVersion: 2,
          name: 'Dragon Hoard',
          parents: ['gold_trail', 'compound_interest'],
          strains: [],
          discoveries: 2,
          banks: 1,
          discovered: true,
        }],
      },
      isLoading: false,
      error: null,
      fetchCodex: mockFetchCodex,
      reset: mockResetCodex,
    });
    render(<CodexPage />);
    fireEvent.click(screen.getByText('Your Research Record'));

    expect(screen.getByText('Genome Weaver')).toBeInTheDocument();
    expect(screen.getByTestId('codex-recipe-splice_dragon_hoard')).toHaveTextContent(
      'Gold Trail + Compound Interest'
    );
  });

  it('fails closed synchronously when player B sees player A store state', () => {
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
    fireEvent.click(screen.getByText('Your Research Record'));
    expect(screen.getByText('Reading your Genome history…')).toBeInTheDocument();
    expect(screen.queryByText('Genome Weaver')).not.toBeInTheDocument();
    expect(mockFetchCodex).toHaveBeenCalledWith('user-b', 'token-b');
  });

  it('opens old notification anchors into the Research Record', () => {
    window.history.replaceState(null, '', '/codex#codex-genome-weaver');
    render(<CodexPage />);
    expect(screen.getByTestId('research-record')).toHaveAttribute('open');
    expect(screen.getByText('Genome Weaver')).toBeInTheDocument();
  });
});

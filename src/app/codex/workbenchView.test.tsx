import { render, screen } from '@testing-library/react';
import CodexPage from './page';

const mockSearchParams = jest.fn();
jest.mock('next/navigation', () => ({ useSearchParams: () => mockSearchParams() }));

const mockUseAuth = jest.fn();
const mockUseCodexStore = jest.fn();
jest.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('@/lib/stores/codexStore', () => ({ useCodexStore: () => mockUseCodexStore() }));
jest.mock('@/components/ui/NavBar', () => ({ NavBar: () => <nav /> }));
jest.mock('@/components/workbench/WorkbenchView', () => ({
  WorkbenchView: ({ studyRef }: { studyRef?: string | null }) => (
    <div data-testid="workbench-view" data-study-ref={studyRef ?? ''} />
  ),
}));
jest.mock('@/lib/features/genomeV2', () => ({ GENOME_V2_ENABLED: true }));

function params(values: Record<string, string | null>) {
  return { get: (key: string) => values[key] ?? null };
}

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, '', '/codex');
  mockSearchParams.mockReturnValue(params({}));
  mockUseAuth.mockReturnValue({ session: null, isAuthenticated: false });
  mockUseCodexStore.mockReturnValue({
    ownerId: null,
    live: false,
    unlocked: false,
    bankedRuns: 0,
    unlockAt: 0,
    data: null,
    isLoading: false,
    error: null,
    fetchCodex: jest.fn(),
    reset: jest.fn(),
  });
});

describe('the Workbench is the only visible Genome Research destination', () => {
  it.each([null, 'archive', 'workbench', 'workbenchh'])(
    'keeps the compatibility URL on the Workbench for view=%s',
    (view) => {
      mockSearchParams.mockReturnValue(params({ view }));
      render(<CodexPage />);
      expect(screen.getByTestId('workbench-view')).toBeInTheDocument();
      expect(screen.queryByTestId('codex-views')).not.toBeInTheDocument();
      expect(screen.queryByTestId('codex-rules')).not.toBeInTheDocument();
    }
  );

  it('survives a search-params hook that returns nothing', () => {
    mockSearchParams.mockReturnValue(null);
    render(<CodexPage />);
    expect(screen.getByTestId('workbench-view')).toBeInTheDocument();
  });

  it('passes only the opaque settled-run reference into the Workbench', () => {
    mockSearchParams.mockReturnValue(params({
      view: 'archive',
      result: '123e4567-e89b-42d3-a456-426614174000',
    }));
    render(<CodexPage />);
    expect(screen.getByTestId('workbench-view')).toHaveAttribute(
      'data-study-ref',
      '123e4567-e89b-42d3-a456-426614174000'
    );
  });

  it('keeps personal history subordinate and closed until requested', () => {
    render(<CodexPage />);
    expect(screen.getByTestId('research-record')).not.toHaveAttribute('open');
    expect(screen.getByTestId('workbench-view')).toBeInTheDocument();
  });
});

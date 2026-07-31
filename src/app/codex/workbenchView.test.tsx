/**
 * The Codex's second view (WP-2.08).
 *
 * The Workbench is a VIEW of the Codex, not a route of its own: `?view=
 * workbench` is shareable and back-button honest, adds no nav entry, and adds
 * zero taps before a run. Three things have to hold for that to be true rather
 * than merely intended, and none of them is provable by reading the file:
 *
 *   1. The archive is the DEFAULT — for a missing `view`, an unrecognised one,
 *      and the flag being off. `page.test.tsx` asserts the archive still
 *      renders; this file asserts that it keeps doing so under a query.
 *   2. The Workbench inherits the Codex's own state and adds NO gate of its
 *      own. §10.4 forbids selling planning information; walling a reference is
 *      the mistake WP-2.07a had just finished undoing.
 *   3. The rollout flag hides the tab entirely, so a rollback leaves the Codex
 *      exactly as it shipped.
 */

import { render, screen } from '@testing-library/react';
import CodexPage from './page';
import { useNotificationStore } from '@/lib/stores/notificationStore';

const mockSearchParams = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams(),
}));

const mockUseAuth = jest.fn();
const mockUseCodexStore = jest.fn();
jest.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('@/lib/stores/codexStore', () => ({ useCodexStore: () => mockUseCodexStore() }));
jest.mock('@/components/ui/NavBar', () => ({ NavBar: () => <nav /> }));
jest.mock('@/components/workbench/WorkbenchView', () => ({
  WorkbenchView: () => <div data-testid="workbench-view" />,
}));

let flagEnabled = true;
jest.mock('@/lib/features/workbench', () => ({
  get WORKBENCH_V1_ENABLED() {
    return flagEnabled;
  },
}));

function params(view: string | null) {
  return { get: (key: string) => (key === 'view' ? view : null) };
}

beforeEach(() => {
  jest.clearAllMocks();
  flagEnabled = true;
  mockSearchParams.mockReturnValue(params(null));
  mockUseAuth.mockReturnValue({
    session: { access_token: 'token' },
    isAuthenticated: true,
  });
  mockUseCodexStore.mockReturnValue({
    live: true,
    unlocked: true,
    bankedRuns: 20,
    unlockAt: 15,
    data: null,
    isLoading: false,
    error: null,
    fetchCodex: jest.fn(),
  });
  useNotificationStore.setState({ notifications: {}, hasHydrated: true });
  global.fetch = jest.fn() as jest.Mock;
});

describe('the archive is the default view', () => {
  it('renders the archive with no query at all', () => {
    render(<CodexPage />);
    expect(screen.getByTestId('codex-rules')).toBeInTheDocument();
    expect(screen.queryByTestId('workbench-view')).not.toBeInTheDocument();
  });

  it('renders the archive for a view nobody defined', () => {
    mockSearchParams.mockReturnValue(params('workbenchh'));
    render(<CodexPage />);
    expect(screen.getByTestId('codex-rules')).toBeInTheDocument();
    expect(screen.queryByTestId('workbench-view')).not.toBeInTheDocument();
  });

  it('renders the archive for an explicit ?view=archive', () => {
    mockSearchParams.mockReturnValue(params('archive'));
    render(<CodexPage />);
    expect(screen.getByTestId('codex-rules')).toBeInTheDocument();
  });

  it('survives a search-params hook that returns nothing', () => {
    mockSearchParams.mockReturnValue(null);
    render(<CodexPage />);
    expect(screen.getByTestId('codex-rules')).toBeInTheDocument();
  });
});

describe('?view=workbench opens the Workbench, in place', () => {
  it('shows the Workbench and hides the archive', () => {
    mockSearchParams.mockReturnValue(params('workbench'));
    render(<CodexPage />);
    expect(screen.getByTestId('workbench-view')).toBeInTheDocument();
    expect(screen.queryByTestId('codex-rules')).not.toBeInTheDocument();
  });

  it('does not clear an archive recognition while its exact artifact is hidden', () => {
    useNotificationStore.getState().replaceServerItems([{
      id: 'codex-recognition',
      kind: 'recognition',
      status: 'unseen',
      destination: 'codex',
      headline: 'Phase Shift discovered',
      momentId: 'moment-1',
      artifactRef: 'gene:phase_shift',
      source: { type: 'run', id: 'session-1' },
      createdAt: '2026-07-30T12:00:00.000Z',
    }]);
    mockUseCodexStore.mockReturnValue({
      live: true,
      unlocked: true,
      bankedRuns: 20,
      unlockAt: 15,
      data: {
        genes: [{ id: 'phase_shift', discovered: true }],
        splices: [],
        strains: [],
        progress: { genomeWeaverUnlocked: false },
      },
      isLoading: false,
      error: null,
      fetchCodex: jest.fn(),
    });
    mockSearchParams.mockReturnValue(params('workbench'));

    render(<CodexPage />);

    expect(screen.getByTestId('workbench-view')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().notifications['codex-recognition']).toBeDefined();
  });

  it('keeps both views one tap apart, and marks which one is open', () => {
    mockSearchParams.mockReturnValue(params('workbench'));
    render(<CodexPage />);
    const tabs = screen.getByTestId('codex-views');
    expect(tabs).toBeInTheDocument();
    expect(screen.getByTestId('codex-view-archive')).toHaveAttribute('href', '/codex');
    expect(screen.getByTestId('codex-view-workbench')).toHaveAttribute(
      'href',
      '/codex?view=workbench'
    );
    expect(screen.getByTestId('codex-view-workbench')).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('adds no gate of its own — the same page state opens it', () => {
    // A player at 0 banked runs, whose discovery archive has not started
    // recording, still reaches the Workbench. §10.4 forbids SELLING planning
    // information; it does not ask for it to be walled.
    mockUseCodexStore.mockReturnValue({
      live: true,
      unlocked: false,
      bankedRuns: 0,
      unlockAt: 15,
      data: null,
      isLoading: false,
      error: null,
      fetchCodex: jest.fn(),
    });
    mockSearchParams.mockReturnValue(params('workbench'));
    render(<CodexPage />);
    expect(screen.getByTestId('workbench-view')).toBeInTheDocument();
  });

  it('introduces no premium check on the page', () => {
    mockSearchParams.mockReturnValue(params('workbench'));
    render(<CodexPage />);
    // The source assertion `page.test.tsx` makes, repeated for the view that
    // was added after it: a planning surface must not grow a paywall.
    const source = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/app/codex/page.tsx'),
      'utf8'
    );
    expect(source).not.toMatch(/premium_required|isPremium|hasPremium/);
  });
});

describe('the rollout flag', () => {
  it('hides the tabs entirely when it is off', () => {
    flagEnabled = false;
    render(<CodexPage />);
    expect(screen.queryByTestId('codex-views')).not.toBeInTheDocument();
    expect(screen.getByTestId('codex-rules')).toBeInTheDocument();
  });

  it('ignores ?view=workbench when it is off, rather than showing an empty page', () => {
    flagEnabled = false;
    mockSearchParams.mockReturnValue(params('workbench'));
    render(<CodexPage />);
    expect(screen.queryByTestId('workbench-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('codex-rules')).toBeInTheDocument();
  });
});

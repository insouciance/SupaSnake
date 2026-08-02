import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GenomeV2WorkbenchView } from './WorkbenchView';
import {
  createGenomeV2State,
  genomeV2RunRecord,
  settleGenomeV2,
} from '@/shared/game/genomeV2';

const mockUseAuth = jest.fn();
jest.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('@/lib/features/workbench', () => ({ WORKBENCH_V1_ENABLED: true }));
jest.mock('@/lib/features/genomeV2', () => ({ GENOME_V2_ENABLED: true }));

const PANEL = {
  snakes: [
    {
      id: 'cyber-4',
      name: 'Cyber Spark',
      dynasty: 'CYBER',
      generation: 4,
      equipped: true,
    },
    {
      id: 'primal-2',
      name: 'Primal Thorn',
      dynasty: 'PRIMAL',
      generation: 2,
      equipped: false,
    },
  ],
};

const PANEL_B = {
  snakes: [
    {
      id: 'cosmic-7',
      name: 'Cosmic Crown',
      dynasty: 'COSMIC',
      generation: 7,
      equipped: true,
    },
  ],
};

function response(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function renderResearch() {
  global.fetch = jest.fn().mockResolvedValue(response(PANEL)) as unknown as typeof fetch;
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<GenomeV2WorkbenchView />);
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    session: { access_token: 'token', user: { id: 'user-a' } },
    isAuthenticated: true,
  });
});

describe('Genome v2 Research table', () => {
  it('renders six tactile loci and the three player-owned lenses', async () => {
    await renderResearch();
    expect(screen.getByTestId('workbench-loci').children).toHaveLength(6);
    expect(screen.getByTestId('workbench-lens-yield')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-lens-risk')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-lens-space')).toBeInTheDocument();
  });

  it('keeps dynasty legality visible instead of flattening every pool', async () => {
    await renderResearch();
    expect(screen.queryByTestId('workbench-gene-time_dilation')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('workbench-snake-primal'));
    expect(screen.getByTestId('workbench-gene-time_dilation')).toBeInTheDocument();
  });

  it('reveals exact Strain and future Splice consequences by tap', async () => {
    await renderResearch();
    fireEvent.click(screen.getByTestId('workbench-tier-AURUM-3'));
    expect(screen.getByTestId('workbench-strain-disclosure')).toHaveTextContent(
      /AURUM 3/i
    );
    expect(screen.getByTestId('workbench-strain-disclosure').textContent?.length).toBeGreaterThan(40);

    fireEvent.click(screen.getByTestId('workbench-gene-gold_trail'));
    fireEvent.click(screen.getByTestId('workbench-splice-path-splice_gilded_fork'));
    const disclosure = screen.getByTestId('workbench-splice-disclosure');
    expect(disclosure).toHaveTextContent('Rule');
    expect(disclosure).toHaveTextContent('Cost');
    expect(disclosure).toHaveTextContent(/Every fifth target/i);
  });

  it('lets the player discover a reaction without ranking the answer', async () => {
    await renderResearch();
    fireEvent.click(screen.getByTestId('workbench-gene-gold_trail'));
    fireEvent.click(screen.getByTestId('workbench-thread'));
    fireEvent.click(screen.getByTestId('workbench-gene-overgrowth'));
    fireEvent.click(screen.getByTestId('workbench-thread'));

    expect(screen.getAllByText('Gilded Fork').length).toBeGreaterThan(0);
    const text = screen.getByTestId('workbench-view').textContent ?? '';
    expect(text).not.toMatch(/\bscore\b|recommended|ranking|best build/i);
  });

  it('invites a signed-out player without exposing a dead surface', async () => {
    mockUseAuth.mockReturnValue({ session: null, isAuthenticated: false });
    const view = await renderResearch();
    expect(screen.getByTestId('workbench-signed-out')).toBeInTheDocument();

    mockUseAuth.mockReturnValue({
      session: { access_token: 'token', user: {} },
      isAuthenticated: true,
    });
    view.rerender(<GenomeV2WorkbenchView />);
    expect(screen.getByTestId('workbench-signed-out')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fails closed across player A logout and player B login while B loads', async () => {
    let authState = {
      session: { access_token: 'token-a', user: { id: 'user-a' } },
      isAuthenticated: true,
    };
    mockUseAuth.mockImplementation(() => authState);
    const playerB = deferred<Response>();
    global.fetch = jest.fn((_, init) => {
      const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return authorization === 'Bearer token-b'
        ? playerB.promise
        : Promise.resolve(response(PANEL));
    }) as unknown as typeof fetch;

    const view = render(<GenomeV2WorkbenchView />);
    await waitFor(() => {
      expect(screen.getByTestId('workbench-snake-cyber')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('workbench-gene-gold_trail'));
    fireEvent.click(screen.getByTestId('workbench-thread'));
    expect(screen.getByText('1 move')).toBeInTheDocument();

    authState = { session: null, isAuthenticated: false } as unknown as typeof authState;
    view.rerender(<GenomeV2WorkbenchView />);
    expect(screen.getByTestId('workbench-signed-out')).toBeInTheDocument();
    expect(screen.queryByTestId('workbench-snake-cyber')).not.toBeInTheDocument();
    expect(screen.queryByText('1 move')).not.toBeInTheDocument();

    authState = {
      session: { access_token: 'token-b', user: { id: 'user-b' } },
      isAuthenticated: true,
    };
    view.rerender(<GenomeV2WorkbenchView />);
    expect(screen.getByTestId('workbench-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('workbench-snake-cyber')).not.toBeInTheDocument();
    expect(screen.queryByText('1 move')).not.toBeInTheDocument();

    await act(async () => {
      playerB.resolve(response(PANEL_B));
      await playerB.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId('workbench-snake-cosmic')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('workbench-snake-cyber')).not.toBeInTheDocument();
    expect(screen.getByText('0 moves')).toBeInTheDocument();
  });

  it('ignores a stale slow response after the authenticated owner changes', async () => {
    let authState = {
      session: { access_token: 'token-a', user: { id: 'user-a' } },
      isAuthenticated: true,
    };
    mockUseAuth.mockImplementation(() => authState);
    const playerA = deferred<Response>();
    const playerB = deferred<Response>();
    global.fetch = jest.fn((_, init) => {
      const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return authorization === 'Bearer token-a' ? playerA.promise : playerB.promise;
    }) as unknown as typeof fetch;

    const view = render(<GenomeV2WorkbenchView />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    authState = {
      session: { access_token: 'token-b', user: { id: 'user-b' } },
      isAuthenticated: true,
    };
    view.rerender(<GenomeV2WorkbenchView />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    await act(async () => {
      playerB.resolve(response(PANEL_B));
      await playerB.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId('workbench-snake-cosmic')).toBeInTheDocument();
    });

    await act(async () => {
      playerA.resolve(response(PANEL));
      await playerA.promise;
    });
    expect(screen.getByTestId('workbench-snake-cosmic')).toBeInTheDocument();
    expect(screen.queryByTestId('workbench-snake-cyber')).not.toBeInTheDocument();
  });

  it('shows player B load failures without falling back to player A data', async () => {
    let authState = {
      session: { access_token: 'token-a', user: { id: 'user-a' } },
      isAuthenticated: true,
    };
    mockUseAuth.mockImplementation(() => authState);
    global.fetch = jest.fn((_, init) => {
      const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return Promise.resolve(authorization === 'Bearer token-b'
        ? response({ error: 'Player B collection is unavailable.' }, false)
        : response(PANEL));
    }) as unknown as typeof fetch;

    const view = render(<GenomeV2WorkbenchView />);
    await waitFor(() => {
      expect(screen.getByTestId('workbench-snake-cyber')).toBeInTheDocument();
    });
    authState = {
      session: { access_token: 'token-b', user: { id: 'user-b' } },
      isAuthenticated: true,
    };
    view.rerender(<GenomeV2WorkbenchView />);

    await waitFor(() => {
      expect(screen.getByTestId('workbench-error')).toHaveTextContent(
        'Player B collection is unavailable.'
      );
    });
    expect(screen.queryByTestId('workbench-snake-cyber')).not.toBeInTheDocument();
    expect(screen.queryByText('1 move')).not.toBeInTheDocument();
  });

  it('preserves the current experiment across a same-owner token refresh', async () => {
    let authState = {
      session: { access_token: 'token-a-1', user: { id: 'user-a' } },
      isAuthenticated: true,
    };
    mockUseAuth.mockImplementation(() => authState);
    const refreshed = deferred<Response>();
    global.fetch = jest.fn((_, init) => {
      const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return authorization === 'Bearer token-a-2'
        ? refreshed.promise
        : Promise.resolve(response(PANEL));
    }) as unknown as typeof fetch;

    const view = render(<GenomeV2WorkbenchView />);
    await waitFor(() => {
      expect(screen.getByTestId('workbench-snake-cyber')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('workbench-gene-gold_trail'));
    fireEvent.click(screen.getByTestId('workbench-thread'));
    expect(screen.getByText('1 move')).toBeInTheDocument();

    authState = {
      session: { access_token: 'token-a-2', user: { id: 'user-a' } },
      isAuthenticated: true,
    };
    view.rerender(<GenomeV2WorkbenchView />);
    expect(screen.getByTestId('workbench-snake-cyber')).toBeInTheDocument();
    expect(screen.getByText('1 move')).toBeInTheDocument();

    await act(async () => {
      refreshed.resolve(response(PANEL));
      await refreshed.promise;
    });
    await waitFor(() => {
      expect(screen.getByText('1 move')).toBeInTheDocument();
    });
  });

  it('re-opens a settled run through its opaque authenticated reference', async () => {
    const state = createGenomeV2State('CYBER');
    const record = genomeV2RunRecord(state, settleGenomeV2(state, 'bank'));
    global.fetch = jest.fn(async (input) => {
      const url = String(input);
      return {
        ok: true,
        json: async () => url.includes('/api/workbench/result/')
          ? { sessionId: '123e4567-e89b-42d3-a456-426614174000', genome: record }
          : PANEL,
      } as Response;
    }) as unknown as typeof fetch;

    await act(async () => {
      render(
        <GenomeV2WorkbenchView studyRef="123e4567-e89b-42d3-a456-426614174000" />
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('workbench-run-study')).toBeInTheDocument();
    });
    expect(screen.getByTestId('workbench-run-study')).toHaveTextContent('BANK secured');
    expect(screen.getByTestId('workbench-study-loci').children).toHaveLength(6);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/workbench/result/123e4567-e89b-42d3-a456-426614174000',
      expect.objectContaining({
        cache: 'no-store',
        headers: { Authorization: 'Bearer token' },
      })
    );
  });
});

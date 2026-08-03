import { useCodexStore } from './codexStore';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function response(status: number, body: object) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function payload(id: string) {
  return {
    live: true,
    unlocked: true,
    genes: [{ id }],
    splices: [],
    strains: [],
    progress: { discovered: 1, total: 54, percent: 2 },
    sampleSize: 1,
  };
}

describe('codexStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCodexStore.getState().reset();
  });

  it('hydrates the free Codex API payload', async () => {
    mockFetch.mockReturnValue(
      response(200, {
        live: true,
        unlocked: true,
        genes: [],
        splices: [],
        strains: [],
        progress: { discovered: 0, total: 54, percent: 0 },
        sampleSize: 0,
      })
    );
    await useCodexStore.getState().fetchCodex('user-a', 'token');
    expect(mockFetch).toHaveBeenCalledWith('/api/codex', {
      cache: 'no-store',
      headers: { Authorization: 'Bearer token' },
    });
    expect(useCodexStore.getState()).toMatchObject({
      ownerId: 'user-a',
      live: true,
      unlocked: true,
      error: null,
    });
  });

  it('retains server FTUE progress without hydrating the hidden catalog', async () => {
    mockFetch.mockReturnValue(
      response(200, { live: true, unlocked: false, bankedRuns: 14, unlockAt: 15 })
    );
    await useCodexStore.getState().fetchCodex('user-a', 'token');
    expect(useCodexStore.getState()).toMatchObject({
      live: true,
      unlocked: false,
      bankedRuns: 14,
      unlockAt: 15,
      data: null,
    });
  });

  it('degrades cleanly before migration 031', async () => {
    mockFetch.mockReturnValue(response(200, { live: false }));
    await useCodexStore.getState().fetchCodex('user-a', 'token');
    expect(useCodexStore.getState()).toMatchObject({
      live: false,
      unlocked: false,
      data: null,
    });
  });

  it('keeps B authoritative when A resolves after B', async () => {
    const playerA = deferred<Awaited<ReturnType<typeof response>>>();
    const playerB = deferred<Awaited<ReturnType<typeof response>>>();
    mockFetch.mockImplementation((_, init) => {
      const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return authorization === 'Bearer token-a' ? playerA.promise : playerB.promise;
    });

    const loadA = useCodexStore.getState().fetchCodex('user-a', 'token-a');
    const loadB = useCodexStore.getState().fetchCodex('user-b', 'token-b');
    playerB.resolve(await response(200, payload('gene-b')));
    await loadB;
    expect(useCodexStore.getState()).toMatchObject({
      ownerId: 'user-b',
      isLoading: false,
      data: expect.objectContaining({ genes: [{ id: 'gene-b' }] }),
    });

    playerA.resolve(await response(200, payload('gene-a')));
    await loadA;
    expect(useCodexStore.getState()).toMatchObject({
      ownerId: 'user-b',
      isLoading: false,
      data: expect.objectContaining({ genes: [{ id: 'gene-b' }] }),
    });
  });

  it('invalidates a pending account response when logout resets the store', async () => {
    const playerA = deferred<Awaited<ReturnType<typeof response>>>();
    mockFetch.mockReturnValue(playerA.promise);
    const loadA = useCodexStore.getState().fetchCodex('user-a', 'token-a');

    useCodexStore.getState().reset();
    playerA.resolve(await response(200, payload('gene-a')));
    await loadA;

    expect(useCodexStore.getState()).toMatchObject({
      ownerId: null,
      live: false,
      data: null,
      isLoading: false,
      error: null,
    });
  });

  it('retains same-owner data while a refreshed token is in flight', async () => {
    mockFetch.mockReturnValueOnce(response(200, payload('gene-a')));
    await useCodexStore.getState().fetchCodex('user-a', 'token-a-1');
    const refreshed = deferred<Awaited<ReturnType<typeof response>>>();
    mockFetch.mockReturnValueOnce(refreshed.promise);

    const refresh = useCodexStore.getState().fetchCodex('user-a', 'token-a-2');
    expect(useCodexStore.getState()).toMatchObject({
      ownerId: 'user-a',
      isLoading: true,
      data: expect.objectContaining({ genes: [{ id: 'gene-a' }] }),
    });

    refreshed.resolve(await response(200, payload('gene-a-new')));
    await refresh;
    expect(useCodexStore.getState()).toMatchObject({
      ownerId: 'user-a',
      isLoading: false,
      data: expect.objectContaining({ genes: [{ id: 'gene-a-new' }] }),
    });
  });
});

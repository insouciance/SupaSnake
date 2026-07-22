import { useCodexStore } from './codexStore';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function response(status: number, body: object) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  });
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
    await useCodexStore.getState().fetchCodex('token');
    expect(mockFetch).toHaveBeenCalledWith('/api/codex', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(useCodexStore.getState()).toMatchObject({
      live: true,
      unlocked: true,
      error: null,
    });
  });

  it('retains server FTUE progress without hydrating the hidden catalog', async () => {
    mockFetch.mockReturnValue(
      response(200, { live: true, unlocked: false, bankedRuns: 14, unlockAt: 15 })
    );
    await useCodexStore.getState().fetchCodex('token');
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
    await useCodexStore.getState().fetchCodex('token');
    expect(useCodexStore.getState()).toMatchObject({
      live: false,
      unlocked: false,
      data: null,
    });
  });
});

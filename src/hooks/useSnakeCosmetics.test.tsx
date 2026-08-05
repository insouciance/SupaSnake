/**
 * The wardrobe's client contract.
 *
 * The premise worth testing is not "does it fetch". It is that the OPTIMISTIC
 * PAINT IS NOT THE TRUTH:
 *
 *   - a hover paints the snake immediately, because a wardrobe that makes you
 *     wait is not a wardrobe;
 *   - a refusal drops that paint and SAYS WHY (doctrine FM-2 — surface the
 *     reason, never a generic boolean);
 *   - a success does not keep the guess either. The hook re-reads, so
 *     `owned`/`equipped` on every row is what the database says rather than
 *     what this client inferred.
 *
 * Keeping an optimistic paint after a refusal would be a client showing a
 * player a cosmetic the server says they do not have — which is the client
 * granting itself a cosmetic, one screen removed (Constitution R11).
 */

import { act, renderHook, waitFor } from '@testing-library/react';

import { useSnakeCosmetics } from '@/hooks/useSnakeCosmetics';
import type { SnakeCosmeticItem } from '@/lib/cosmetics/snakeCosmetics';

const OWNED: SnakeCosmeticItem = {
  id: 'face_shades_deadpan',
  slot: 'face',
  component: 'shades_deadpan',
  name: 'Deadpan Shades',
  rarity: 'uncommon',
  supporterOnly: false,
  owned: true,
  equipped: false,
};

const SUPPORTER: SnakeCosmeticItem = {
  ...OWNED,
  id: 'face_shades_gilded',
  component: 'shades_gilded',
  owned: false,
  supporterOnly: true,
};

function catalogPayload(over: Record<string, unknown> = {}) {
  return {
    loadout: { face: null, crown: null, food_skin: null },
    items: [{ ...OWNED }],
    ...over,
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('useSnakeCosmetics', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads nothing at all without a session', () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const { result } = renderHook(() => useSnakeCosmetics(undefined));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.catalog.live).toBe(false);
  });

  it('leaves the snake bare when the wardrobe cannot be read', async () => {
    // A failed read is a bare snake, never a broken Home.
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse({ error: 'boom' }, false, 500));
    const { result } = renderHook(() => useSnakeCosmetics('token'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.catalog.live).toBe(false);
    expect(result.current.displayLoadout.face).toBeNull();
  });

  it('survives a thrown fetch the same way', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useSnakeCosmetics('token'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.catalog.live).toBe(false);
  });

  it('paints a hovered item on the snake straight away', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(catalogPayload()));
    const { result } = renderHook(() => useSnakeCosmetics('token'));
    await waitFor(() => expect(result.current.catalog.live).toBe(true));

    expect(result.current.displayLoadout.face).toBeNull();
    act(() => result.current.preview(OWNED));
    expect(result.current.displayLoadout.face).toBe('shades_deadpan');
    act(() => result.current.preview(null));
    expect(result.current.displayLoadout.face).toBeNull();
  });

  it('refuses to paint an item the player could not put on', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(catalogPayload({ items: [SUPPORTER] })));
    const { result } = renderHook(() => useSnakeCosmetics('token'));
    await waitFor(() => expect(result.current.catalog.live).toBe(true));

    act(() => result.current.preview(SUPPORTER));
    expect(result.current.displayLoadout.face).toBeNull();
  });

  it('re-reads after a successful equip rather than trusting its own guess', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(catalogPayload()))
      .mockResolvedValueOnce(jsonResponse({ success: true, equipped: OWNED.id }))
      .mockResolvedValueOnce(
        jsonResponse(
          catalogPayload({
            loadout: { face: 'shades_deadpan', crown: null, food_skin: null },
            items: [{ ...OWNED, equipped: true }],
          })
        )
      );

    const { result } = renderHook(() => useSnakeCosmetics('token'));
    await waitFor(() => expect(result.current.catalog.live).toBe(true));

    await act(async () => {
      await result.current.equip(OWNED);
    });

    await waitFor(() =>
      expect(result.current.catalog.loadout.face).toBe('shades_deadpan')
    );
    expect(result.current.catalog.items[0].equipped).toBe(true);
    expect(result.current.error).toBeNull();

    const equipCall = fetchSpy.mock.calls[1];
    expect(equipCall[0]).toBe('/api/player/cosmetics/equip');
    expect(JSON.parse(String((equipCall[1] as RequestInit).body))).toEqual({
      slot: 'face',
      position: 1,
      cosmeticId: 'face_shades_deadpan',
    });
  });

  it('sends null to take something off, through the same one control', async () => {
    const worn = { ...OWNED, equipped: true };
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(catalogPayload({ items: [worn] })))
      .mockResolvedValue(jsonResponse({ success: true, equipped: null }));

    const { result } = renderHook(() => useSnakeCosmetics('token'));
    await waitFor(() => expect(result.current.catalog.live).toBe(true));

    await act(async () => {
      await result.current.equip(worn);
    });

    expect(
      JSON.parse(String((fetchSpy.mock.calls[1][1] as RequestInit).body)).cosmeticId
    ).toBeNull();
  });

  it('drops the optimistic paint on a refusal and says why', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(catalogPayload()))
      .mockResolvedValueOnce(
        jsonResponse({ error: 'not_owned' }, false, 409)
      );

    const { result } = renderHook(() => useSnakeCosmetics('token'));
    await waitFor(() => expect(result.current.catalog.live).toBe(true));

    await act(async () => {
      await result.current.equip(OWNED);
    });

    // The snake goes back to what it was actually wearing...
    expect(result.current.displayLoadout.face).toBeNull();
    // ...and the player is told, in words, not in a status code.
    expect(result.current.error).toBe('You do not have that one yet.');
    expect(result.current.busy).toBe(false);
  });

  it('never writes for an item the player cannot wear', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(catalogPayload({ items: [SUPPORTER] })));
    const { result } = renderHook(() => useSnakeCosmetics('token'));
    await waitFor(() => expect(result.current.catalog.live).toBe(true));

    await act(async () => {
      await result.current.equip(SUPPORTER);
    });

    // Only the initial read happened; no equip was attempted.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('keeps nothing in browser storage (R11)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(catalogPayload()));
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useSnakeCosmetics('token'));
    await waitFor(() => expect(result.current.catalog.live).toBe(true));
    act(() => result.current.preview(OWNED));
    expect(setItem).not.toHaveBeenCalled();
  });
});

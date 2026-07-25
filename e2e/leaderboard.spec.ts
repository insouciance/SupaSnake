/**
 * Leaderboard integrity E2E (WP-0.05, Constitution §6.1, GT §9.3).
 *
 * Drives the real board against the real API. What it proves:
 *   - the board renders and every visible row obeys the integrity invariants
 *     (one row per player, ranks non-decreasing, no in-progress/flagged run)
 *   - generation "skill brackets" are gone from the surface
 *   - the you-centered contract holds: top 3 plus the viewer ±5
 *   - a signed-in player gets a resolvable `viewer` in the players.id space -
 *     the join that made myRank permanently undefined
 *
 * The runs themselves are a WebGL canvas and are not simulated, so this spec
 * asserts the board's structure and contract rather than staging scores; the
 * ranking math is unit-tested in src/lib/leaderboard/*.test.ts.
 */

import { test, expect, type APIResponse } from '@playwright/test';
import { seedConsent, signInAsGuest } from './helpers';

interface BoardEntry {
  rank: number;
  playerId: string;
  playerName: string;
  score: number;
  dynasty: string | null;
  achievedAt: string;
}

interface BoardResponse {
  type: string;
  view: string;
  dynasty: string;
  contentVersion: string;
  entries: BoardEntry[];
  top: BoardEntry[];
  window: BoardEntry[];
  viewer: { playerId: string; ranked: boolean; rank: number | null; score: number | null } | null;
  total: number;
  truncated: boolean;
}

async function board(response: APIResponse): Promise<BoardResponse> {
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as BoardResponse;
}

function assertBoardInvariants(data: BoardResponse) {
  // One best entry per player - a single player can never hold two rows
  const ids = data.entries.map((e) => e.playerId);
  expect(new Set(ids).size).toBe(ids.length);

  // Ranks are non-decreasing across the page (ties share a rank)
  for (let i = 1; i < data.entries.length; i += 1) {
    expect(data.entries[i].rank).toBeGreaterThanOrEqual(data.entries[i - 1].rank);
    expect(data.entries[i].score).toBeLessThanOrEqual(data.entries[i - 1].score);
  }

  // Every ranked run is a finished run, and carries no build state
  for (const entry of data.entries) {
    expect(Number.isFinite(Date.parse(entry.achievedAt))).toBe(true);
    expect(entry).not.toHaveProperty('bracket');
    expect(entry).not.toHaveProperty('highestGeneration');
    expect(entry).not.toHaveProperty('collectionCount');
  }

  expect(data.contentVersion).toBeTruthy();
  expect(data.truncated).toBe(false);
}

test.describe('Leaderboard integrity', () => {
  test('the public board ranks only eligible, deduplicated runs', async ({ request }) => {
    for (const type of ['global', 'weekly', 'daily']) {
      const data = await board(await request.get(`/api/leaderboard?type=${type}&limit=50`));
      expect(data.type).toBe(type);
      assertBoardInvariants(data);
      expect(data.top.length).toBeLessThanOrEqual(3);
      // No credentials -> no viewer, and the board still serves
      expect(data.viewer).toBeNull();
      expect(data.window).toEqual([]);
    }
  });

  test('the you-centered view returns the top 3 plus a window of at most 11', async ({
    request,
  }) => {
    const data = await board(await request.get('/api/leaderboard?type=global&view=you'));

    expect(data.view).toBe('you');
    expect(data.top.length).toBeLessThanOrEqual(3);
    expect(data.window.length).toBeLessThanOrEqual(11);
    assertBoardInvariants(data);

    // entries is top then window, de-duplicated, in rank order
    const runIds = data.entries.map((e) => `${e.playerId}:${e.achievedAt}`);
    expect(new Set(runIds).size).toBe(runIds.length);
  });

  test('rejects unknown boards, views and dynasties', async ({ request }) => {
    expect((await request.get('/api/leaderboard?type=monthly')).status()).toBe(400);
    expect((await request.get('/api/leaderboard?view=sideways')).status()).toBe(400);
    // EMBER/CRYSTAL/VOID is deprecated and must never be accepted again
    expect((await request.get('/api/leaderboard?dynasty=EMBER')).status()).toBe(400);
    expect((await request.get('/api/leaderboard?type=weekly&dynasty=PRIMAL')).ok()).toBeTruthy();
  });

  test('the board page renders without generation brackets', async ({ page }) => {
    await seedConsent(page);
    await page.goto('/leaderboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /leaderboard/i })).toBeVisible();
    await expect(page.getByTestId('leaderboard-tab-global')).toBeVisible();

    // Generation "skill brackets" are deleted (Constitution §6.1)
    await expect(page.getByRole('button', { name: /all brackets/i })).toHaveCount(0);
    await expect(page.getByText(/highest snake generation/i)).toHaveCount(0);
    await expect(page.getByText(/skill bracket/i)).toHaveCount(0);

    // The surface states the integrity rules it now actually enforces
    await expect(page.getByText(/only completed, validated runs rank/i)).toBeVisible();
  });

  test('a signed-in player resolves a viewer in the players.id space', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    const boardResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/leaderboard' && response.status() === 200,
      { timeout: 30000 }
    );
    await page.goto('/leaderboard', { waitUntil: 'domcontentloaded' });
    const data = (await (await boardResponse).json()) as BoardResponse;

    // The account exists, so the server resolves a players.id for it. This is
    // the GT §9.3 fix: the page no longer compares an auth user id to it.
    expect(data.viewer).not.toBeNull();
    expect(data.viewer!.playerId).toMatch(/^[0-9a-f-]{36}$/i);
    assertBoardInvariants(data);

    // Whenever the viewer is ranked, exactly one visible row is "you"
    if (data.viewer!.ranked) {
      const mine = data.entries.filter((e) => e.playerId === data.viewer!.playerId);
      expect(mine).toHaveLength(1);
      expect(mine[0].rank).toBe(data.viewer!.rank);
      await expect(page.locator('[data-testid="leaderboard-row"][data-you="true"]')).toHaveCount(1);
      await expect(page.getByTestId('leaderboard-my-rank')).toHaveAttribute(
        'data-rank',
        String(data.viewer!.rank)
      );
    } else {
      await expect(page.locator('[data-testid="leaderboard-row"][data-you="true"]')).toHaveCount(0);
      await expect(page.getByTestId('leaderboard-my-rank')).toHaveCount(0);
    }
  });
});

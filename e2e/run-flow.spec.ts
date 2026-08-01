/**
 * WP-1.06 — Run Setup + Results three layers (Constitution §5, §12.2).
 *
 * The acceptance criteria are tap counts, so they are counted here rather
 * than inspected: every interaction goes through `taps()`, which increments a
 * counter, and the assertions are on the counter.
 *
 *   §5 / cap §12.2:  open → PLAY → START → board     ≤ 3 taps
 *                    Results → REPLAY → next run     ≤ 2 taps
 *
 * The suite splits on NEXT_PUBLIC_RUN_FLOW_V1: the flag-on describe asserts
 * the new shape, the flag-off describe asserts the shipped screen is intact.
 * One of the two runs in any given build; both are exercised by running the
 * suite twice, which is what the WP's report does.
 */

import { test, expect, type Page } from '@playwright/test';
import {
  openRunSetupControls,
  releaseHeldBoard,
  seedConsent,
  signInAsGuest,
} from './helpers';
import { SnakeGameLogic } from '../src/lib/game/SnakeGameLogic';
import { RULESETS } from '../src/shared/game/rulesets';

const RUN_FLOW_ENABLED = process.env.NEXT_PUBLIC_RUN_FLOW_V1 === 'true';

/** A counted interaction. Every tap in this file goes through one of these. */
class Taps {
  count = 0;

  async click(page: Page, testId: string) {
    this.count += 1;
    // The WebGL canvas repaints under the overlay; the shipped specs click
    // start controls forced for exactly this reason. `force` skips the
    // actionability wait, and a DISABLED button fires no onClick at all, so
    // the enabled check has to be made explicitly: PLAY is disabled while
    // Home's first load settles, and a forced tap in that window is swallowed
    // in silence.
    const control = page.getByTestId(testId);
    await expect(control).toBeEnabled({ timeout: 30_000 });
    await control.click({ force: true });
  }

  /**
   * The deliberate first movement, counted as the one tap it is. See
   * `releaseHeldBoard` for why the key may have to be dispatched more than
   * once before the board's listener exists to receive it.
   */
  async press(page: Page) {
    this.count += 1;
    await releaseHeldBoard(page);
  }
}

const ENERGY = {
  available: 6,
  capacity: 6,
  recoveryIntervalSeconds: 3600,
  recoveryStartedAt: '2026-07-29T08:00:00.000Z',
  nextRecoveryAt: null,
  recoveryProgress: 1,
  serverNow: '2026-07-29T08:30:00.000Z',
  // Compatibility aliases remain part of the rollout response contract.
  remaining: 6,
  perDay: 6,
  usedToday: 0,
  day: '2026-07-29',
  refillsAt: null,
  visible: true,
};

interface SettlementOptions {
  /** Include WP-1.04's `dailyTake` block (the day's first run). */
  withTake?: boolean;
  /** Mutable server truth used to prove stale Setup drafts are re-clamped. */
  authority?: {
    available: number;
    attemptable: number;
  };
}

/**
 * Deterministic fixtures for a returning player with one equipped PRIMAL
 * snake. Real auth, stubbed data - the house pattern from cockpit.spec.ts.
 */
async function installRunFlowFixtures(
  page: Page,
  options: SettlementOptions = {}
): Promise<void> {
  const authority = options.authority ?? { available: ENERGY.available, attemptable: 3 };
  await page.route('**/api/player', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        player: {
          id: 'run-flow-player',
          total_games_played: 20,
          high_score: 10_000,
        },
        energy: {
          ...ENERGY,
          available: authority.available,
          remaining: authority.available,
        },
        charge: {
          ...ENERGY,
          available: authority.available,
          remaining: authority.available,
        },
        ladder: { available: true, attemptable: authority.attemptable },
        needsStarterSelection: false,
        hasCompletedFirstRun: true,
        aimSystem: 'deadeye',
      },
    });
  });

  await page.route('**/api/collection', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        dnaBalance: 2_500,
        snakes: [
          {
            id: 'run-flow-snake',
            playerId: 'run-flow-player',
            isEquipped: true,
            isFavorited: false,
            generation: 3,
            variantName: 'Ouroboros',
            variantId: 'primal',
            snakeVariantId: 'run-flow-primal-variant',
            dynastyName: 'PRIMAL',
            parent1Id: null,
            parent2Id: null,
            acquiredAt: '2026-07-01T12:00:00.000Z',
            acquiredMethod: 'tutorial',
            traits: [],
            lineage: null,
          },
        ],
      },
    });
  });

  await page.route('**/api/dynasties', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        dynasties: [
          {
            id: 'run-flow-primal-dynasty',
            name: 'PRIMAL',
            displayName: 'Primal Dynasty',
            description: 'Pressure through living length.',
            colorPrimary: '#facc15',
            colorSecondary: '#a855f7',
            statBonusType: 'size',
            statBonusValue: 0,
            sortOrder: 1,
            isActive: true,
            createdAt: '2026-07-01T12:00:00.000Z',
            updatedAt: '2026-07-01T12:00:00.000Z',
          },
        ],
      },
    });
  });

  await page.route('**/api/variants', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        variants: [
          {
            id: 'run-flow-primal-variant',
            dynastyId: 'run-flow-primal-dynasty',
            name: 'Ouroboros',
            rarity: 'common',
            loreText: 'A patient wall-coiler.',
            artUrl: null,
            baseStats: { speed: 10, size: 5, hp: 100 },
            unlockCostDna: 0,
            isStarter: true,
            sortOrder: 1,
            isActive: true,
            createdAt: '2026-07-01T12:00:00.000Z',
            updatedAt: '2026-07-01T12:00:00.000Z',
          },
        ],
      },
    });
  });

  await page.route('**/api/mastery', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        mastery: [],
      },
    });
  });

  await page.route('**/api/progression/lineage', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { live: true, dossiers: [] },
    });
  });

  let sessionSequence = 0;
  let currentManifest: Record<string, unknown> | null = null;
  let currentCommitment = 1;
  let checkpointRevision = 0;
  await page.route('**/api/game/session', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { activeRun: null },
      });
    }
    const body = route.request().postDataJSON() as {
      action?: string;
      mode?: string;
      energyCommitment?: number;
      ladderRung?: number;
      sessionId?: string;
      expectedRevision?: number;
      checkpoint?: unknown;
    } | null;
    if (body?.action === 'start') {
      const committed = Math.max(0, Math.min(6, body.energyCommitment ?? 1));
      const multiplierBps = [2_500, 10_000, 22_000, 36_000, 52_000, 72_000, 100_000][committed];
      sessionSequence += 1;
      currentCommitment = committed;
      checkpointRevision = 0;
      const sessionId = `run-flow-session-${sessionSequence}`;
      const energy = {
        state: committed > 0 ? 'charged' : body.mode === 'free' ? 'exempt' : 'lean',
        ...ENERGY,
        available: Math.max(0, authority.available - committed),
        remaining: Math.max(0, authority.available - committed),
        committed,
        commitmentMultiplierBps: multiplierBps,
        energyAvailableBefore: authority.available,
        energyRecoveredAtStart: 0,
      };
      currentManifest = {
        sessionId,
        simulation: { seed: `run-flow-seed-${sessionSequence}`, version: 1 },
        runSnake: {
          id: 'run-flow-snake',
          name: 'Ouroboros',
          generation: 3,
          dynasty: 'PRIMAL',
          traits: [],
          lineage: null,
        },
        energy,
        freePlay: body.mode === 'free',
        traits: [],
        mutationPool: [],
        growthProfile: 'dynasty',
        ladder: { rung: body.ladderRung ?? 0 },
        mastery: { dynasty: 'PRIMAL', xp: 0, level: 2 },
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: currentManifest,
      });
    }

    if (body?.action === 'activate' && currentManifest && body.checkpoint) {
      checkpointRevision = 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          activeRun: {
            sessionId: currentManifest.sessionId,
            phase: 'active',
            startedAt: '2026-07-29T08:30:00.000Z',
            activatedAt: '2026-07-29T08:30:01.000Z',
            energyCommitted: currentCommitment,
            canContinue: true,
            requiresAbandon: false,
            manifest: currentManifest,
            checkpoint: body.checkpoint,
            checkpointRevision,
            checkpointSavedAt: '2026-07-29T08:30:01.000Z',
            leaseToken: 'run-flow-exclusive-lease-token',
            leaseEpoch: 1,
            startIntent: null,
          },
        },
      });
    }

    if (body?.action === 'checkpoint') {
      checkpointRevision = Math.max(
        checkpointRevision + 1,
        Number(body.expectedRevision ?? 0) + 1
      );
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          checkpoint: {
            revision: checkpointRevision,
            savedAt: '2026-07-29T08:30:03.000Z',
          },
        },
      });
    }

    if (body?.action === 'terminal' || body?.action === 'end') {
      const sessionId = body.sessionId ?? 'run-flow-session-settled';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          success: true,
          player: { dna: 1234, total_games_played: 21, high_score: 10_000 },
          validation: {
            valid: true,
            adjustedDna: 96,
            baseDna: 120,
            rawDna: 120,
            genelessRawDna: 120,
            score: 40,
            extracted: false,
            yieldDna: 120,
            chargeState: 'charged',
          },
          impact: {
            version: 1,
            sessionId,
            settledAt: '2026-07-29T08:45:00.000Z',
            outcome: 'crashed',
            dynasty: 'PRIMAL',
            receipt: {
              validated: true,
              score: 40,
              yieldDna: 120,
              dnaCredited: 96,
              energyCommitted: currentCommitment,
              commitmentMultiplierBps:
                [2_500, 10_000, 22_000, 36_000, 52_000, 72_000, 100_000][currentCommitment],
              generation: 3,
              personalBest: {
                eligible: true,
                before: 10_000,
                after: 10_000,
                improved: false,
              },
            },
            impacts: [
              {
                key: 'mastery-xp',
                pillar: 'mastery',
                kind: 'mastery_xp',
                significance: 'routine',
                headline: '+40 PRIMAL Mastery XP',
                before: 220,
                after: 260,
                destination: 'mastery',
              },
              {
                key: 'record-tier',
                pillar: 'mastery',
                kind: 'record_tier',
                significance: 'milestone',
                headline: 'Coil discipline reached Tier 2',
                before: 1,
                after: 2,
                metadata: { target: 5 },
                destination: 'records',
                artifactRef: 'coil_discipline',
              },
            ],
            featuredImpactKeys: ['record-tier'],
            recommendedAction: {
              headline: 'Review Coil discipline Tier 2',
              destination: 'records',
            },
          },
          ...(options.withTake
            ? {
                dailyTake: {
                  firstRunOfDay: true,
                  amount: 150,
                  streakDays: 3,
                  multiplier: 1.25,
                  collected: false,
                },
              }
            : {}),
        },
      });
    }
    return route.continue();
  });
}

test.describe('Run Flow v1 — Run Setup and three-layer Results', () => {
  test.skip(
    !RUN_FLOW_ENABLED,
    'NEXT_PUBLIC_RUN_FLOW_V1 is off in this build; the flag-off suite below runs instead.'
  );

  // Most of these tests play a run to its natural end against the wall, and
  // the run is real time: sign-in, setup, board, ~15s of ticks and the
  // settlement round trip come to roughly 25s on a warm local machine. The
  // default 60s per test left no headroom on a cold CI worker, which is how a
  // slow step and a broken step produced the same symptom. The budget is
  // raised rather than the waits shortened: nothing here should pass because
  // it was lucky.
  test.describe.configure({ timeout: 150_000 });

  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('open → PLAY → START → board in at most 3 taps (§5, cap §12.2)', async ({
    page,
  }) => {
    await installRunFlowFixtures(page);
    await signInAsGuest(page);

    const taps = new Taps();

    // Tap 0 is not a tap: arriving on the site.
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Tap 1 — PLAY. It opens Run Setup; it does not start a run.
    await taps.click(page, 'launch-cta');
    await page.waitForURL(/\/game/, { timeout: 60_000 });

    // Run Setup: fully preset, START the only emphasised action.
    const setup = page.getByTestId('run-setup');
    await expect(setup).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Preparing board/i)).toHaveCount(0);
    await expect(page.getByTestId('run-setup-summary')).toBeVisible();
    // Mode is an ordinary cockpit choice; advanced tuning stays behind one
    // closed disclosure and neither requires a tap before launch.
    await expect(page.getByTestId('run-setup-mode-control')).toBeVisible();
    await expect(page.getByTestId('mode-earn')).toBeVisible();
    await expect(page.getByTestId('run-setup-adjust')).toHaveJSProperty(
      'open',
      false
    );

    // Tap 2 — START.
    await taps.click(page, 'earn-start');
    await expect(page.getByTestId('game-board-viewport')).toBeVisible({
      timeout: 60_000,
    });

    // Tap 3 — the deliberate first movement (§5 input semantics). The board
    // is live from here.
    await taps.press(page);

    expect(taps.count).toBeLessThanOrEqual(3);
  });

  test('maximum Energy commitment is explicit, previewed, and confirmed in the start request', async ({
    page,
  }) => {
    await installRunFlowFixtures(page);
    await signInAsGuest(page);
    await page.goto('/game', { waitUntil: 'domcontentloaded' });

    const setup = page.getByTestId('run-setup');
    await expect(setup).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('energy-summary')).toContainText('Commit 1 Energy');
    await expect(page.getByTestId('energy-summary')).toContainText('×1.0');

    const maximum = page.getByTestId('energy-commit-6');
    await maximum.click();
    await expect(page.getByTestId('energy-max-confirmation')).toBeVisible();
    await expect(page.getByTestId('energy-summary')).toContainText('Commit 1 Energy');

    await page.getByTestId('energy-max-confirm').click();
    await expect(page.getByTestId('energy-max-confirmation')).toHaveCount(0);
    await expect(page.getByTestId('energy-summary')).toContainText('Commit 6 Energy');
    await expect(page.getByTestId('energy-summary')).toContainText('×10.0');

    const startRequest = page.waitForRequest((request) => {
      if (request.method() !== 'POST') return false;
      return new URL(request.url()).pathname === '/api/game/session';
    });
    await page.getByTestId('earn-start').click({ force: true });
    const payload = (await startRequest).postDataJSON() as Record<string, unknown>;
    expect(payload.energyCommitment).toBe(6);
    expect(payload.confirmMaxEnergy).toBe(true);
  });

  test('the Energy reactor is in the initial mobile cockpit at supported short viewports', async ({
    page,
  }) => {
    await installRunFlowFixtures(page);
    await signInAsGuest(page);

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 375, height: 667 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/game', { waitUntil: 'domcontentloaded' });
      const setup = page.getByTestId('run-setup');
      await expect(setup).toBeVisible({ timeout: 60_000 });
      // The containing panel has a 350ms decorative pop-in. Measure the
      // settled cockpit, not a cubic-bezier overshoot between paint frames.
      await page.waitForTimeout(400);

      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(horizontalOverflow).toBeLessThanOrEqual(1);

      const reactor = page.getByTestId('energy-commitment');
      const reactorBox = await reactor.boundingBox();
      const lineageBox = await page
        .getByRole('region', { name: 'Selected snake launch chamber' })
        .boundingBox();
      const modeBox = await page.getByTestId('run-setup-mode-control').boundingBox();
      const startBox = await page.getByTestId('earn-start').boundingBox();
      expect(lineageBox).not.toBeNull();
      expect(modeBox).not.toBeNull();
      expect(reactorBox).not.toBeNull();
      expect(startBox).not.toBeNull();
      expect(lineageBox!.y + lineageBox!.height).toBeLessThanOrEqual(modeBox!.y + 1);
      expect(modeBox!.y + modeBox!.height).toBeLessThanOrEqual(reactorBox!.y + 1);
      expect(startBox!.y).toBeGreaterThanOrEqual(reactorBox!.y + reactorBox!.height - 1);
      expect(reactorBox!.y).toBeGreaterThanOrEqual(0);
      expect(reactorBox!.y + reactorBox!.height).toBeLessThanOrEqual(viewport.height + 1);
      await expect(page.getByRole('heading', { name: /ready to launch/i })).toBeVisible();
      await expect(page.getByTestId('energy-summary')).toBeVisible();
      await expect(page.getByTestId('earn-start')).toBeVisible();

      for (const control of [
        page.getByTestId('energy-commit-6'),
        page.getByRole('link', { name: 'Snake Lab' }),
        page.getByTestId('earn-start'),
      ]) {
        await control.scrollIntoViewIfNeeded();
        await expect(control).toBeVisible();
        await expect(control).toHaveCSS('white-space', 'nowrap');
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      }
    }

    await page.getByTestId('run-setup-favorite-primal').click();
    await expect(
      page.getByRole('heading', { name: 'Choose PRIMAL favorite' })
    ).toBeVisible();
    await expect(page.getByTestId('snake-picker-option-run-flow-snake')).toBeVisible();
  });

  test('Setup survives a Lab detour while current server limits remain authoritative', async ({
    page,
  }) => {
    const authority = { available: 6, attemptable: 3 };
    await installRunFlowFixtures(page, { authority });
    await signInAsGuest(page);

    let startRequests = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/game/session' &&
        (request.postDataJSON() as { action?: string } | null)?.action === 'start'
      ) {
        startRequests += 1;
      }
    });

    await page.goto(
      '/game?seed=e2eSetupSeed&target=4200&challenge=signal%3A214&by=CoilAce',
      { waitUntil: 'domcontentloaded' }
    );
    await expect(page.getByTestId('run-setup')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('energy-commitment-slider').fill('4');
    await expect(page.getByTestId('energy-summary')).toContainText('Commit 4 Energy');
    await openRunSetupControls(page);
    await page.getByTestId('ladder-rung-2').click();
    await expect(page.getByTestId('ladder-readout')).toContainText('Rung 2');
    await page.getByTestId('mode-free').click();
    await expect(page.getByTestId('mode-free')).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('link', { name: 'Snake Lab' }).click();
    await page.waitForURL(/\/lab\?/, { timeout: 60_000 });
    const labUrl = new URL(page.url());
    expect(labUrl.searchParams.get('returnTo')).toBe(
      '/game?seed=e2eSetupSeed&target=4200&challenge=signal%3A214&by=CoilAce&setupMode=free&setupEnergy=4&setupRung=2'
    );
    const backToSetup = page.getByRole('link', { name: 'Back to Setup' });
    await expect(backToSetup).toBeVisible({ timeout: 60_000 });

    // The URL carries navigation intent, never authority. A lower balance and
    // Ladder ceiling discovered in the Lab must win when Setup is restored.
    authority.available = 2;
    authority.attemptable = 1;
    await backToSetup.click();
    await page.waitForURL(/\/game\?/, { timeout: 60_000 });
    await expect(page.getByTestId('run-setup')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('mode-free')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('ladder-readout')).toContainText('Rung 1');
    await page.getByTestId('mode-earn').click();
    await expect(page.getByTestId('energy-summary')).toContainText('Commit 1 Energy');

    const restoredUrl = new URL(page.url());
    expect(restoredUrl.searchParams.get('seed')).toBe('e2eSetupSeed');
    expect(restoredUrl.searchParams.get('target')).toBe('4200');
    expect(restoredUrl.searchParams.get('challenge')).toBe('signal:214');
    expect(restoredUrl.searchParams.get('by')).toBe('CoilAce');
    expect(restoredUrl.searchParams.get('setupEnergy')).toBe('4');
    expect(restoredUrl.searchParams.get('setupRung')).toBe('2');

    const setupStorageKeys = await page.evaluate(() => [
      ...Object.keys(window.localStorage),
      ...Object.keys(window.sessionStorage),
    ].filter((key) => /setup/i.test(key)));
    expect(setupStorageKeys).toEqual([]);
    expect(startRequests).toBe(0);
  });

  test('reload preserves a committed run and Continue restores its held checkpoint', async ({
    page,
  }) => {
    await installRunFlowFixtures(page);

    const simulationSeed = 'e2e-resume-seed';
    const activatedAt = Date.parse('2026-07-31T08:00:00.000Z');
    const engine = new SnakeGameLogic({
      ruleset: RULESETS.PRIMAL,
      simulationSeed,
    });
    engine.setGrowthProfile('dynasty');
    engine.setLadderRung(0);
    engine.setTraits([]);
    engine.setMutationPool([]);
    engine.prepare();
    engine.activatePrepared(activatedAt);
    const checkpoint = engine.exportCheckpoint(activatedAt + 2_000);
    const manifest = {
      sessionId: 'resume-session',
      simulation: { seed: simulationSeed, version: 1 as const },
      runSnake: {
        id: 'resume-snake',
        name: 'Ouroboros',
        generation: 3,
        dynasty: 'PRIMAL',
        traits: [],
        lineage: null,
      },
      energy: {
        state: 'charged' as const,
        ...ENERGY,
        available: 4,
        remaining: 4,
        committed: 2,
        commitmentMultiplierBps: 22_000,
      },
      traits: [],
      mutationPool: [],
      growthProfile: 'dynasty',
      ladder: { rung: 0 },
      mastery: { dynasty: 'PRIMAL', xp: 0, level: 2 },
    };
    const activeRun = {
      sessionId: 'resume-session',
      phase: 'active' as const,
      startedAt: '2026-07-31T08:00:00.000Z',
      activatedAt: '2026-07-31T08:00:00.000Z',
      energyCommitted: 2,
      canContinue: true,
      requiresAbandon: false,
      manifest,
      checkpoint,
      checkpointRevision: 4,
      checkpointSavedAt: '2026-07-31T08:00:02.000Z',
      leaseToken: null,
      leaseEpoch: 1,
      startIntent: null,
    };

    let exposeActiveRun = false;
    let startRequests = 0;
    let resumeRequests = 0;
    await page.route('**/api/game/session', async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          json: { activeRun: exposeActiveRun ? activeRun : null },
        });
      }
      const body = request.postDataJSON() as {
        action?: string;
        sessionId?: string;
      } | null;
      if (body?.action === 'start') {
        startRequests += 1;
        return route.fulfill({ status: 409, json: { error: 'unexpected start' } });
      }
      if (body?.action === 'resume') {
        resumeRequests += 1;
        expect(body.sessionId).toBe('resume-session');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          json: {
            activeRun: {
              ...activeRun,
              leaseToken: 'e2e-exclusive-lease-token-long-enough',
              leaseEpoch: 2,
            },
          },
        });
      }
      if (body?.action === 'checkpoint') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          json: {
            checkpoint: {
              revision: 5,
              savedAt: '2026-07-31T08:00:03.000Z',
            },
          },
        });
      }
      return route.continue();
    });

    await signInAsGuest(page);
    await expect(page.getByTestId('run-setup')).toBeVisible({ timeout: 60_000 });
    exposeActiveRun = true;

    await page.reload({ waitUntil: 'domcontentloaded' });
    const recovery = page.getByTestId('interrupted-run-recovery');
    await expect(recovery).toBeVisible({ timeout: 60_000 });
    await expect(recovery.getByRole('heading', { name: 'Continue your run' })).toBeVisible();
    await expect(recovery).toContainText('2 Energy');
    const continueRun = recovery.getByRole('button', { name: 'Continue run' });
    await expect(continueRun).toBeVisible();
    await continueRun.click();

    await expect(recovery).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByTestId('game-board-viewport')).toBeVisible();
    const resumeGate = page.getByTestId('resume-gate');
    await expect(resumeGate).toBeVisible();
    await expect(resumeGate).toContainText(/direction.*resume|tactical hold/i);
    expect(resumeRequests).toBe(1);
    expect(startRequests).toBe(0);
  });

  test('the ladder adds a readout but no tap (WP-3.12, §5)', async ({ page }) => {
    // The rung selector is allowed "<=1 tap added" and takes ZERO: it lives
    // inside the disclosure the growth selector already lives in, which is
    // still closed on arrival. This asserts the structure rather than the
    // count, because the count above only stays 3 for as long as no control
    // escapes that disclosure - and a selector beside START would be the
    // obvious, plausible mistake.
    await installRunFlowFixtures(page);
    await signInAsGuest(page);
    await page.goto('/game', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('run-setup')).toBeVisible({ timeout: 60_000 });

    // The readout is ALWAYS visible and never gated on the ladder flag: with
    // the flag off it must still say which rung this run plays, which is what
    // makes it a diagnostic. Two playtests in this wave were distorted by a
    // surface that vanished with its feature.
    const readout = page.getByTestId('ladder-readout');
    await expect(readout).toBeVisible();
    await expect(readout).toContainText(/Rung \d/);

    // ...and it is OUTSIDE the disclosure, which is still closed.
    const adjust = page.getByTestId('run-setup-adjust');
    await expect(adjust).toHaveJSProperty('open', false);
    await expect(adjust.getByTestId('ladder-readout')).toHaveCount(0);

    // The SELECTOR, where it exists at all, is inside it — so it is reachable
    // only through a disclosure tap that was already the sanctioned one.
    const selector = page.getByTestId('ladder-selector');
    if ((await selector.count()) > 0) {
      await expect(adjust.getByTestId('ladder-selector')).toHaveCount(1);
      await expect(selector).not.toBeVisible();
    }
  });

  test('Results → REPLAY → next run in at most 2 taps (§5, cap §12.2)', async ({
    page,
  }) => {
    await installRunFlowFixtures(page);
    await signInAsGuest(page);

    await page.goto('/game', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('run-setup')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('earn-start').click({ force: true });
    await expect(page.getByTestId('game-board-viewport')).toBeVisible({
      timeout: 60_000,
    });
    await releaseHeldBoard(page);

    // The run ends by itself against the wall.
    await expect(page.getByTestId('run-results')).toBeVisible({ timeout: 60_000 });

    const taps = new Taps();

    // Tap 1 — REPLAY. It skips setup entirely.
    await taps.click(page, 'results-replay');
    await expect(page.getByTestId('run-results')).toBeHidden({ timeout: 60_000 });
    await expect(page.getByTestId('run-setup')).toHaveCount(0);
    await expect(page.getByTestId('game-board-viewport')).toBeVisible({
      timeout: 60_000,
    });

    // Tap 2 — the deliberate first movement.
    await taps.press(page);

    expect(taps.count).toBeLessThanOrEqual(2);
  });

  test('Results is exactly three layers with exactly one next action and no commerce', async ({
    page,
  }) => {
    await installRunFlowFixtures(page);
    await signInAsGuest(page);

    await page.goto('/game', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('run-setup')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('earn-start').click({ force: true });
    await expect(page.getByTestId('game-board-viewport')).toBeVisible({
      timeout: 60_000,
    });
    await releaseHeldBoard(page);

    const results = page.getByTestId('run-results');
    await expect(results).toBeVisible({ timeout: 60_000 });

    // Cap §12.2: three layers.
    await expect(results.locator('[data-testid^="results-layer-"]')).toHaveCount(3);
    await expect(page.getByTestId('results-layer-1')).toBeVisible();
    await expect(page.getByTestId('results-layer-2')).toBeVisible();
    await expect(page.getByTestId('results-layer-3')).toBeVisible();

    // Cap §12.2: exactly one recommended next action.
    await expect(results.getByTestId('results-next-action')).toHaveCount(1);

    // Layer 3 is one visible recognition digest, not a hidden menu.
    const digest = results.getByTestId('results-digest');
    if (await digest.count()) {
      await expect(digest).toHaveCount(1);
      await expect(digest).toBeVisible();
      expect(await digest.evaluate((element) => element.tagName)).toBe('DIV');
    }

    // Layer 2 carries the two numbers.
    await expect(page.getByTestId('results-score')).toBeVisible();
    await expect(page.getByTestId('results-yield')).toBeVisible();

    // Rule 7: zero commercial surfaces on Results.
    const hrefs = await results.locator('a[href]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('href') ?? '')
    );
    for (const href of hrefs) {
      expect(href).not.toMatch(/shop|premium|checkout|billing|stripe/i);
    }
    await expect(results).not.toContainText(
      /\b(buy|purchase|subscribe|season pass|keeper)\b/i
    );
  });

  test('the Take collect slot renders only on the day first run', async ({
    page,
  }) => {
    // No `dailyTake` in the settlement → the server did not call this the
    // day's first run → no slot, and nothing errors.
    await installRunFlowFixtures(page);
    await signInAsGuest(page);
    await page.goto('/game', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('run-setup')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('earn-start').click({ force: true });
    await releaseHeldBoard(page);
    await expect(page.getByTestId('run-results')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('results-take')).toHaveCount(0);
  });

  test('the Take collect slot renders on a first-run-of-day settlement', async ({
    page,
  }) => {
    await installRunFlowFixtures(page, { withTake: true });
    await signInAsGuest(page);
    await page.goto('/game', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('run-setup')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('earn-start').click({ force: true });
    await releaseHeldBoard(page);
    await expect(page.getByTestId('run-results')).toBeVisible({ timeout: 60_000 });

    const take = page.getByTestId('results-take');
    await expect(take).toBeVisible();
    await expect(take).toContainText('150 DNA');
    // It belongs to Layer 1.
    await expect(page.getByTestId('results-layer-1').getByTestId('results-take'))
      .toHaveCount(1);

    // Collecting settles the Take. When this spec was written WP-1.04 had not
    // shipped `/api/daily-take/collect` and the only requirement was that the
    // button be a quiet no-op ("Your Take settles with the day."). The route
    // exists now - `src/app/api/daily-take/collect` - so the assertion is the
    // stronger one it always wanted to be: the collect lands, and the surface
    // never shows the failure state (Rule 5 — nothing here may read as a
    // loss).
    await page.getByTestId('results-take-collect').click({ force: true });
    const takeStatus = page.getByTestId('results-take-status');
    await expect(takeStatus).toContainText(/collected/i, { timeout: 20_000 });
    await expect(takeStatus).not.toContainText(/could not collect/i);
  });

  test('SETUP reopens the setup page over a finished run', async ({ page }) => {
    await installRunFlowFixtures(page);
    await signInAsGuest(page);
    await page.goto('/game', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('run-setup')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('earn-start').click({ force: true });
    await releaseHeldBoard(page);
    await expect(page.getByTestId('run-results')).toBeVisible({ timeout: 60_000 });

    await page.getByTestId('results-setup').click({ force: true });
    await expect(page.getByTestId('run-setup')).toBeVisible();
    await expect(page.getByTestId('run-results')).toHaveCount(0);
  });

  test('mobile Results keeps Replay and Setup immediately accessible while progress stays ceremonial', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await installRunFlowFixtures(page);
    await signInAsGuest(page);
    await page.goto('/game', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('run-setup')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('earn-start').click({ force: true });
    await releaseHeldBoard(page);
    await expect(page.getByTestId('run-results')).toBeVisible({ timeout: 60_000 });

    const dock = page.getByTestId('results-action-dock');
    const dockBox = await dock.boundingBox();
    expect(dockBox).not.toBeNull();
    expect(dockBox!.y).toBeGreaterThanOrEqual(0);
    expect(dockBox!.y + dockBox!.height).toBeLessThanOrEqual(569);
    for (const control of [
      page.getByTestId('results-replay'),
      page.getByTestId('results-setup'),
    ]) {
      await expect(control).toBeVisible();
      await expect(control).toBeEnabled();
      await expect(control).toHaveCSS('white-space', 'nowrap');
    }

    await page.getByTestId('impact-victory-lap').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('impact-routine-summary')).toContainText(
      '+40 PRIMAL Mastery XP'
    );
    await expect(page.getByRole('button', { name: /Accept progress/i })).toHaveCount(0);
    await expect(page.getByTestId('impact-collect-remaining')).toBeVisible();
  });
});

test.describe('Run Flow v1 off — the shipped screens are the rollback path', () => {
  test.skip(
    RUN_FLOW_ENABLED,
    'NEXT_PUBLIC_RUN_FLOW_V1 is on in this build; the flag-on suite above runs instead.'
  );

  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('the released pre-run and game-over screens render, and the new ones do not', async ({
    page,
  }) => {
    await installRunFlowFixtures(page);
    await signInAsGuest(page);

    await page.goto('/game', { waitUntil: 'domcontentloaded' });

    // The shipped pre-run screen, unchanged.
    await expect(
      page.getByRole('heading', { name: /ready to play/i })
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('run-setup')).toHaveCount(0);
    await expect(page.getByTestId('mode-earn')).toBeVisible();
    await expect(page.getByTestId('ruleset-explainer')).toBeVisible();

    await page.getByTestId('earn-start').click({ force: true });
    await expect(page.getByTestId('game-board-viewport')).toBeVisible({
      timeout: 60_000,
    });
    await releaseHeldBoard(page);

    // The shipped game-over screen, unchanged.
    await expect(page.getByTestId('gameover-crashed')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId('run-results')).toHaveCount(0);
    await expect(page.getByTestId('results-layer-1')).toHaveCount(0);
    await expect(page.getByTestId('results-next-action')).toHaveCount(0);
    await expect(page.getByTestId('earn-start')).toBeVisible();
  });
});

/**
 * WP-F — the Genome Discovery curriculum, in the browser, in both flag states.
 *
 * The four-shape flag matrix already runs this file twice with the whole
 * suite: once on the `production` leg, where the manifest arms
 * `NEXT_PUBLIC_PLAYER_EVOLUTION_V1` together with the Career Spine and Genome
 * v2, and once on `rollback`, where nothing is armed. So the two describes
 * below are not alternatives — each is the only one that runs on its leg, and
 * between them the flag-on path and the rollback are both DEMONSTRATED rather
 * than asserted (WP-F acceptance).
 *
 * The fixtures compose their payloads from the PRODUCTION modules —
 * `GENOME_V2_STARTER_POOLS`, `genomeV2ActivePool`, `curriculumAnnotations`,
 * `curriculumUnlockBeat`, `curriculumInvitation` — so a rules change that
 * broke the journey cannot be hidden by a hand-written fixture that still
 * agrees with itself. Only the transport is stubbed.
 */

import { test, expect, type Page } from '@playwright/test';
import {
  closeWorkbenchPicker,
  openWorkbenchPicker,
  releaseHeldBoard,
  seedConsent,
  signInAsGuest,
  startRunIfSetupPresent,
} from './helpers';
import {
  curriculumAnnotations,
  curriculumArtifactRef,
  curriculumInvitation,
  curriculumUnlockBeat,
  CURRICULUM_SOURCE_TYPE,
} from '../src/shared/game/curriculum';
import {
  GENOME_V2_STARTER_POOLS,
  genomeV2ActivePool,
  GENOME_V2_GENES,
  type GenomeV2ActiveGeneId,
  type GenomeV2Dynasty,
} from '../src/shared/game/genes';

const CURRICULUM_ENABLED =
  process.env.NEXT_PUBLIC_PLAYER_EVOLUTION_V1 === 'true';

/** The Dynasty every fixture in this file plays. */
const DYNASTY: GenomeV2Dynasty = 'PRIMAL';
const STARTERS = GENOME_V2_STARTER_POOLS[DYNASTY];
const ROSTER = genomeV2ActivePool(DYNASTY);
/** The Gene the settled run promotes. Not a starter — that is the whole point. */
const UNLOCKED: GenomeV2ActiveGeneId = ROSTER.filter(
  (geneId) => !STARTERS.includes(geneId)
)[0];

const ENERGY = {
  available: 6,
  capacity: 6,
  recoveryIntervalSeconds: 3600,
  recoveryStartedAt: '2026-08-05T08:00:00.000Z',
  nextRecoveryAt: null,
  recoveryProgress: 1,
  serverNow: '2026-08-05T08:30:00.000Z',
  remaining: 6,
  perDay: 6,
  usedToday: 0,
  day: '2026-08-05',
  refillsAt: null,
  visible: true,
};

/**
 * The account state a curriculum read composes from.
 *
 * `eligibleGeneIds` is deliberately EXACTLY the starter seven: the assertion
 * this file exists to make is that a new account's live vocabulary is that
 * prefix and not the full roster.
 */
interface CurriculumAccount {
  eligibleGeneIds: GenomeV2ActiveGeneId[];
  trialGeneId: GenomeV2ActiveGeneId | null;
  bankedRuns: number;
}

function curriculumBody(account: CurriculumAccount) {
  const facts = {
    eligibleGeneIds: account.eligibleGeneIds,
    trialGeneId: account.trialGeneId,
    bankedRuns: account.bankedRuns,
  };
  const genes = curriculumAnnotations(DYNASTY, facts);
  return {
    live: true,
    dynasty: DYNASTY,
    cohort: 'player',
    bankedRuns: account.bankedRuns,
    trialsOpen: account.bankedRuns >= 1,
    trialGeneId: account.trialGeneId,
    candidates: genes.filter((gene) => gene.selectable).map((gene) => gene.geneId),
    genes,
  };
}

/**
 * The transitions that CLOSE an invitation.
 *
 * `seen` is deliberately excluded: reading the banner is not declining, so a
 * surface that marks the row seen must not register as an answer here
 * (decision 14). Only **Show me** and **Not now** are answers.
 */
function terminalTransitions(
  transitions: Array<{ id: string; transition: string }>
): string[] {
  return transitions
    .map((entry) => entry.transition)
    .filter((transition) => transition !== 'seen');
}

/** Serve `/api/genome/curriculum` from one mutable account. */
async function installCurriculumApi(
  page: Page,
  account: CurriculumAccount
): Promise<{ account: CurriculumAccount }> {
  const held = account;
  await page.route('**/api/genome/curriculum**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { geneId?: GenomeV2ActiveGeneId };
      // `select_gene_trial` retires the previous selection and sets the new
      // one; nothing earned is demoted, which is why switching is free.
      if (body?.geneId) held.trialGeneId = body.geneId;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: curriculumBody(held),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: curriculumBody(held),
    });
  });
  return { account: held };
}

test.describe('Genome Discovery — the curriculum flag ON', () => {
  test.skip(
    !CURRICULUM_ENABLED,
    'NEXT_PUBLIC_PLAYER_EVOLUTION_V1 is off in this build; the rollback describe runs instead.'
  );
  test.describe.configure({ timeout: 150_000 });

  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('a new account plays its starter seven, and can choose the next trial', async ({
    page,
  }) => {
    // Pin the equipped Dynasty: the Workbench composes its plan from the
    // equipped snake, and the assertions below are about PRIMAL's seven.
    installReturningPrimalAccount(page);
    const { account } = await installCurriculumApi(page, {
      eligibleGeneIds: [...STARTERS],
      trialGeneId: null,
      bankedRuns: 1,
    });
    await signInAsGuest(page);

    await page.goto('/codex', { waitUntil: 'domcontentloaded' });
    const table = page.getByTestId('workbench-research-table');
    await expect(table).toBeVisible({ timeout: 60_000 });

    // The picker offers only powers NOT YET TAKEN by the current plan
    // (`genomeV2Workbench.ts:588`), and the Workbench opens with a plan already
    // computed. Clearing it returns as much of the roster to the picker as the
    // reading's own base state allows.
    //
    // CLEAR COMES BEFORE THE PICKER OPENS, and that order is load-bearing
    // under slot-first: Clear calls `closePicker()` on its way to rewriting the
    // plan (WorkbenchView.tsx:1053), so clearing with the picker open would
    // shut the very list this test is about.
    const clear = table.getByRole('button', { name: /^clear$/i });
    if (await clear.isEnabled().catch(() => false)) {
      await clear.click();
    }

    // SLOT-FIRST (owner ruling D1) MOVED THE PALETTE, NOT THE CURRICULUM.
    // The permanent rail at the foot of the tray is gone; the powers are the
    // contents of the picker that opens on the slot being filled. Every claim
    // below is unchanged, and is now read where a player reads it. The unit
    // contracts moved the same way (`CurriculumTrials.test.tsx`, `openBenchSlot`).
    const picker = await openWorkbenchPicker(page);
    const palette = picker.getByTestId('workbench-gene-palette');
    await expect(palette).toBeVisible({ timeout: 30_000 });

    // THE STARTER-POOL DROP, asserted against the picker's ACTUAL membership
    // rather than against the roster's length. How many powers a reading's base
    // state consumes is the Workbench's business and changes with the plan; the
    // curriculum's claim is about WHICH powers may reach a real run's Pods, and
    // that claim has to hold for every Gene the picker is showing.
    // THE ANNOTATION RACE (#35). Each option renders
    // `data-eligibility={annotation?.state}` (WorkbenchView.tsx:705) and React
    // OMITS an attribute whose value is undefined — so before `useCurriculum`'s
    // fetch resolves, every option is present and NONE carries the attribute.
    // Reading the list in the frame right after it opens therefore legitimately
    // snapshotted zero annotated options: `railIds.length = 0`, and the failure
    // looked like a curriculum bug rather than a read taken too early.
    //
    // Waiting for the list to MOUNT is not enough — that is what the earlier
    // fix waited for, and it mounts unannotated.
    //
    // Nor is "every option carries the attribute" the right condition, though
    // it reads like it should be: the picker iterates `reading.availableGenes`
    // (WorkbenchView.tsx:683, fed at :1091) while the curriculum annotates only
    // `genomeV2ActivePool(dynasty)` (curriculum.ts:174), so an option outside
    // the active pool NEVER gets annotated and that wait can never come true.
    //
    // The honest signal is that ANY option is annotated. `annotations` is
    // derived from one `curriculum` state value, so every annotatable option
    // gains its attribute in a single React commit — the first annotated option
    // and the last arrive in the same frame. One is therefore proof the fetch
    // resolved, which is the only thing this wait needs to establish.
    const annotatedTiles = palette.locator('> button[data-eligibility]');
    await expect(annotatedTiles.first()).toBeAttached({ timeout: 30_000 });

    const railIds = await annotatedTiles.evaluateAll((nodes) =>
      nodes.map((node) =>
        (node.getAttribute('data-testid') ?? '').replace('workbench-gene-', '')
      )
    );
    expect(railIds.length).toBeGreaterThan(0);
    const railStarters = railIds.filter((id) =>
      (STARTERS as readonly string[]).includes(id)
    );
    const railStaged = railIds.filter(
      (id) => !(STARTERS as readonly string[]).includes(id)
    );
    // Both halves must actually be represented, or the assertions below would
    // pass vacuously on a list that happened to show only one kind.
    expect(railStarters.length).toBeGreaterThan(0);
    expect(railStaged.length).toBeGreaterThan(0);

    // Exactly seven Genes are staged for this Dynasty — not six (a six-pool
    // starves before it can fill six loci) — and NOTHING outside them is
    // offerable. That second half is the real claim: the eligible set is the
    // starter prefix, never the whole roster.
    expect(STARTERS.length).toBe(7);
    await expect(
      palette.locator('[data-eligibility="offer_eligible"]')
    ).toHaveCount(railStarters.length);
    for (const geneId of railStarters) {
      await expect(page.getByTestId(`workbench-gene-${geneId}`)).toHaveAttribute(
        'data-eligibility',
        'offer_eligible'
      );
    }
    for (const geneId of railStaged) {
      const button = page.getByTestId(`workbench-gene-${geneId}`);
      await expect(button).toHaveAttribute('data-eligibility', 'visible_locked');
      // Annotated, never gated: the rule is still there to read, and the word
      // "locked" never appears (boundary 2, §9.4).
      const note = page.getByTestId(`workbench-gene-${geneId}-eligibility`);
      await expect(note).toBeVisible();
      await expect(note).not.toContainText(/locked|stronger|better|rare/i);
    }

    // Hand the page back before choosing a trial. The picker's catcher is a
    // fixed full-screen layer, so the trial panel below is genuinely
    // unreachable while the picker is open — closing it is what a player does,
    // not a workaround for one.
    await closeWorkbenchPicker(page);

    // A TRIAL APPEARS. Two candidates, because one is an assignment and three
    // is a menu, and the panel recommends neither. The panel lives outside the
    // slot tray (WorkbenchView.tsx:1159), so slot-first neither moved it nor
    // put it behind a slot: choosing the next trial is still a decision the
    // Workbench offers on arrival.
    const trials = page.getByTestId('curriculum-trials');
    await expect(trials).toBeVisible();
    await expect(trials).toHaveAttribute('data-state', 'open');
    const candidates = trials.locator('button[data-testid^="curriculum-choose-"]');
    await expect(candidates).toHaveCount(2);

    const chosen = curriculumBody(account).candidates[0];
    await page.getByTestId(`curriculum-choose-${chosen}`).click();
    await expect(trials).toHaveAttribute('data-state', 'chosen');
    await expect(trials).toContainText(GENOME_V2_GENES[chosen].name);
    // Switching costs nothing and loses nothing — the panel says so, because a
    // player who suspects a hidden cost will not experiment (§4.4).
    await expect(trials).toContainText(/switching costs nothing/i);

    // AND THE CHOICE REACHES THE POWERS. The trial annotation is read where
    // the power is picked, so this reopens the picker rather than asserting
    // against a rail that no longer exists — the same claim, one tap later.
    const reopened = await openWorkbenchPicker(page);
    await expect(
      reopened.getByTestId(`workbench-gene-${chosen}`)
    ).toHaveAttribute('data-eligibility', 'trial');
  });

  test('a promoted Gene invites on Results, and Show me / Not now both answer the server', async ({
    page,
  }) => {
    const transitions: Array<{ id: string; transition: string }> = [];
    const attention = installSettledCurriculumRun(page, transitions);
    await installCurriculumApi(page, {
      eligibleGeneIds: [...STARTERS, UNLOCKED],
      trialGeneId: null,
      bankedRuns: 2,
    });
    await signInAsGuest(page);
    await upgradeGuestToAccount(page);

    await playToTerminalResult(page);

    // THE INVITATION (§5). One recommended action, and it is the run's actual
    // news rather than the standing Lab invitation.
    const nextAction = page.getByTestId('results-next-action');
    await expect(nextAction).toBeVisible({ timeout: 60_000 });
    await expect(nextAction).toHaveAttribute(
      'data-next-action',
      'curriculum-reveal'
    );
    await expect(nextAction).toContainText(
      curriculumInvitation(UNLOCKED).label
    );
    // Still exactly one recommendation on the screen (cap §12.2).
    await expect(page.getByTestId('results-next-action')).toHaveCount(1);

    // **Not now** beside it, never "Later" (decision 13), and the run loop's
    // own controls never wait behind either of them (§5).
    const decline = page.getByTestId('results-next-action-decline');
    await expect(decline).toHaveText('Not now');
    await expect(page.getByTestId('results-replay')).toBeEnabled();
    await expect(page.getByTestId('results-setup')).toBeEnabled();

    await decline.click({ force: true });
    // The decline is a SERVER transition. Nothing about it is remembered in
    // this browser, which is what makes a **Not now** on a phone hold on a
    // laptop (boundary 9).
    await expect
      .poll(() => terminalTransitions(transitions), { timeout: 15_000 })
      .toEqual(['dismissed']);
    await expect(nextAction).not.toHaveAttribute(
      'data-next-action',
      'curriculum-reveal'
    );
    await expect(page.getByTestId('results-replay')).toBeEnabled();

    // **Show me** on the next settlement: the same invitation, taken.
    attention.reopen();
    await page.getByTestId('results-replay').click({ force: true });
    await playToTerminalResult(page, { replay: true });
    await expect(nextAction).toHaveAttribute(
      'data-next-action',
      'curriculum-reveal',
      { timeout: 60_000 }
    );
    await nextAction.click({ force: true });
    await page.waitForURL(/\/codex/, { timeout: 60_000 });
    await expect
      .poll(() => terminalTransitions(transitions), { timeout: 15_000 })
      .toEqual(['dismissed', 'resolved']);

    // REFERENCE (§5): the destination names the Gene and where to read it,
    // rather than saying "something is new" and making the player hunt.
    //
    // THIS IS NOW AN EXACT CLAIM RATHER THAN A LUCKY ONE. A bare
    // `getByText(name).first()` used to land on the Workbench's permanent gene
    // rail simply because the rail came first in the document. With the rail
    // gone it landed instead on a HIDDEN recipe line inside the collapsed
    // Research Record — "Recipe: Double or Nothing + Phoenix" — and failed on
    // visibility. That was never the reference this test meant: a recipe that
    // mentions a power in passing, inside a closed disclosure, is exactly the
    // "make the player hunt" outcome §5 forbids. So the assertion now names
    // the power WHERE THE PLAYER READS IT — as its own option, in the picker
    // the destination's one live slot opens — which is both the honest
    // slot-first reading and a stronger claim than the one it replaces.
    await expect(page.getByTestId('workbench-view')).toBeVisible({
      timeout: 60_000,
    });
    const picker = await openWorkbenchPicker(page);
    const promoted = picker.getByTestId(`workbench-gene-${UNLOCKED}`);
    await expect(promoted).toBeVisible({ timeout: 60_000 });
    await expect(promoted).toContainText(GENOME_V2_GENES[UNLOCKED].name);
  });
});

test.describe('Genome Discovery — the curriculum flag OFF (rollback)', () => {
  test.skip(
    CURRICULUM_ENABLED,
    'NEXT_PUBLIC_PLAYER_EVOLUTION_V1 is on in this build; the flag-on describe runs instead.'
  );
  test.describe.configure({ timeout: 120_000 });

  test('Research carries no curriculum at all, and never asks for one', async ({
    page,
  }) => {
    await seedConsent(page);
    // The server route is dormant with the flag off and answers `live: false`.
    // This fixture serves the LIVE body regardless, so a client that rendered
    // annotations from a response it should never request would fail here: the
    // rollback has to be the build's too, not only the server's.
    const asked: string[] = [];
    await page.route('**/api/genome/curriculum**', async (route) => {
      asked.push(route.request().method());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: curriculumBody({
          eligibleGeneIds: [...STARTERS],
          trialGeneId: null,
          bankedRuns: 3,
        }),
      });
    });
    installReturningPrimalAccount(page);
    await signInAsGuest(page);

    await page.goto('/codex', { waitUntil: 'domcontentloaded' });
    // The house rules render for everyone under every flag shape, so this is
    // a stable "the page is up" marker that does not assume the Workbench —
    // on this leg NEXT_PUBLIC_WORKBENCH_V1 and NEXT_PUBLIC_GENOME_V2 are off
    // too, and `/codex` is the legacy instrument.
    await expect(page.getByTestId('codex-mechanics')).toBeVisible({
      timeout: 60_000,
    });

    // Nothing the curriculum owns exists: no eligibility annotation, no trial
    // panel, no guided-reveal banner. A run composes the complete Dynasty
    // roster, which is the shipped behaviour this feature replaces.
    await expect(page.locator('[data-eligibility]')).toHaveCount(0);
    await expect(page.getByTestId('curriculum-trials')).toHaveCount(0);
    await expect(page.getByTestId('curriculum-no-candidates')).toHaveCount(0);
    for (const geneId of ROSTER) {
      await expect(
        page.getByTestId(`workbench-gene-${geneId}-eligibility`)
      ).toHaveCount(0);
    }
    expect(asked).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Turn the signed-in guest into a registered account.
 *
 * NOT INCIDENTAL. `chooseNextAction` puts `save-progress` above every lesson
 * for an anonymous account — "account safety outranks every lesson" (§5) — so
 * a guest structurally never sees the curriculum invitation. Reaching it means
 * reaching a real account, through the shipped upgrade the product offers.
 *
 * Self-skips on the two live conditions `auth.spec.ts` also skips on, because
 * neither is a defect in this journey.
 */
async function upgradeGuestToAccount(page: Page): Promise<void> {
  await page.goto('/shop', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^create account$/i }).click();
  const modal = page.getByTestId('account-upgrade-modal');
  await expect(modal).toBeVisible({ timeout: 30_000 });

  const email = `e2e-curriculum-${Date.now()}@example.com`;
  await modal.getByLabel(/^email$/i).fill(email);
  await modal.getByLabel(/^password$/i).fill('E2eCurriculumPass123');
  await modal.getByLabel(/confirm password/i).fill('E2eCurriculumPass123');
  await modal.getByLabel(/I agree to the Terms of Service/i).check();
  await modal.getByRole('button', { name: /create account/i }).click();

  const success = page.getByTestId('upgrade-success');
  const rateLimited = modal.getByText(/too many attempts|rate limit/i);
  await success.or(rateLimited).first().waitFor({ state: 'visible', timeout: 30_000 });
  if (await rateLimited.isVisible().catch(() => false)) {
    test.skip(true, 'Supabase signup rate limit hit — the upgrade cannot complete now.');
  }
  if (
    await success
      .getByText(/check your email/i)
      .isVisible()
      .catch(() => false)
  ) {
    test.skip(
      true,
      'Email confirmations are enabled — the upgraded account stays anonymous until the link is clicked.'
    );
  }
  await success.getByRole('button', { name: /^close$/i }).click();
  await expect(page.getByText(/save your progress/i)).toHaveCount(0);
}

/** Play a run to its natural end against the wall and wait for Results. */
async function playToTerminalResult(
  page: Page,
  options: { replay?: boolean } = {}
): Promise<void> {
  if (!options.replay) {
    await page.goto('/game', { waitUntil: 'domcontentloaded' });
    // The house helper, not a hand-rolled equivalent. `locator.isVisible()`
    // resolves IMMEDIATELY — its `timeout` option is inert — so a hand-rolled
    // "click START if it is there" reads the DOM one commit before Setup
    // mounts, skips the click, and then waits out the clock on a held-board
    // prompt for a run that was never started. `startRunIfSetupPresent` waits
    // for START properly and uses Setup's disappearance as the signal.
    await startRunIfSetupPresent(page);
  }
  await expect(page.getByTestId('game-board-viewport')).toBeVisible({
    timeout: 60_000,
  });
  await releaseHeldBoard(page);
  await expect(page.getByTestId('run-results')).toBeVisible({ timeout: 60_000 });
}

/**
 * A returning PRIMAL account whose next settled run promotes `UNLOCKED`.
 *
 * The invitation is served from `/api/progression/attention`, never from the
 * settlement response, because that is where the shipped client reads it: the
 * curriculum ledger is the server's, and Results, the Workbench banner and the
 * bell all derive from the same row.
 */
function installSettledCurriculumRun(
  page: Page,
  transitions: Array<{ id: string; transition: string }>
): { reopen: () => void } {
  const ATTENTION_ID = '11111111-2222-4333-8444-555555555555';
  const beat = curriculumUnlockBeat(UNLOCKED);
  const invitation = curriculumInvitation(UNLOCKED);
  let open = true;

  const item = () => ({
    id: ATTENTION_ID,
    kind: 'action' as const,
    status: 'unseen' as const,
    destination: 'codex',
    headline: invitation.label,
    detail: invitation.description,
    source: { type: CURRICULUM_SOURCE_TYPE, id: 'curriculum-session' },
    artifactRef: curriculumArtifactRef(UNLOCKED),
    createdAt: '2026-08-05T08:44:00.000Z',
  });

  void page.route('**/api/progression/attention**', async (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as {
        id?: string;
        transition?: string;
      };
      transitions.push({
        id: String(body?.id ?? ''),
        transition: String(body?.transition ?? ''),
      });
      // `seen` is the Workbench introducing itself and leaves the row open;
      // only Show me / Not now close it (decision 14).
      if (body?.transition === 'resolved' || body?.transition === 'dismissed') {
        open = false;
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { item: { ...item(), status: body?.transition ?? 'seen' } },
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { items: open ? [item()] : [], nextOffset: null },
    });
  });

  installReturningPrimalAccount(page, { beat });
  return {
    // The next settlement offers the identical invitation, because declining
    // one costs the player nothing and hides nothing. The recorded transitions
    // accumulate rather than reset, so the second assertion reads the whole
    // history — `['dismissed', 'resolved']` — and not just the latest answer.
    reopen: () => {
      open = true;
    },
  };
}

/**
 * Deterministic server fixtures for a returning PRIMAL player, in the house
 * pattern (`run-flow.spec.ts`, `cockpit.spec.ts`): real auth, stubbed data.
 */
function installReturningPrimalAccount(
  page: Page,
  options: { beat?: { headline: string; detail: string } } = {}
): void {
  const beat = options.beat ?? curriculumUnlockBeat(UNLOCKED);
  void page.route('**/api/player', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        player: { id: 'curriculum-player', total_games_played: 6, high_score: 4_000 },
        energy: ENERGY,
        charge: ENERGY,
        ladder: { available: true, attemptable: 3 },
        needsStarterSelection: false,
        hasCompletedFirstRun: true,
        aimSystem: 'deadeye',
      },
    });
  });

  void page.route('**/api/collection', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        dnaBalance: 900,
        snakes: [
          {
            id: 'curriculum-snake',
            playerId: 'curriculum-player',
            isEquipped: true,
            isFavorited: false,
            generation: 2,
            variantName: 'Ouroboros',
            variantId: 'primal',
            snakeVariantId: 'curriculum-primal-variant',
            dynastyName: DYNASTY,
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

  void page.route('**/api/mastery', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { mastery: [] },
    });
  });

  void page.route('**/api/progression/lineage', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { live: true, dossiers: [] },
    });
  });

  let sequence = 0;
  let manifest: Record<string, unknown> | null = null;
  let revision = 0;
  void page.route('**/api/game/session', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { activeRun: null },
      });
    }
    const body = request.postDataJSON() as {
      action?: string;
      mode?: string;
      sessionId?: string;
      expectedRevision?: number;
      checkpoint?: unknown;
    } | null;

    if (body?.action === 'start') {
      sequence += 1;
      revision = 0;
      manifest = {
        sessionId: `curriculum-session-${sequence}`,
        simulation: { seed: `curriculum-seed-${sequence}`, version: 1 },
        runSnake: {
          id: 'curriculum-snake',
          name: 'Ouroboros',
          generation: 2,
          dynasty: DYNASTY,
          traits: [],
          lineage: null,
        },
        energy: { state: 'charged', ...ENERGY, committed: 1, commitmentMultiplierBps: 10_000 },
        freePlay: false,
        traits: [],
        mutationPool: [],
        growthProfile: 'dynasty',
        ladder: { rung: 0 },
        mastery: { dynasty: DYNASTY, xp: 0, level: 2 },
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: manifest,
      });
    }

    if (body?.action === 'activate' && manifest && body.checkpoint) {
      revision = 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          activeRun: {
            sessionId: manifest.sessionId,
            phase: 'active',
            startedAt: '2026-08-05T08:40:00.000Z',
            activatedAt: '2026-08-05T08:40:01.000Z',
            energyCommitted: 1,
            canContinue: true,
            requiresAbandon: false,
            manifest,
            checkpoint: body.checkpoint,
            checkpointRevision: revision,
            checkpointSavedAt: '2026-08-05T08:40:01.000Z',
            leaseToken: 'curriculum-exclusive-lease-token',
            leaseEpoch: 1,
            startIntent: null,
          },
        },
      });
    }

    if (body?.action === 'checkpoint') {
      revision = Math.max(revision + 1, Number(body.expectedRevision ?? 0) + 1);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          checkpoint: { revision, savedAt: '2026-08-05T08:40:03.000Z' },
        },
      });
    }

    if (body?.action === 'terminal' || body?.action === 'end') {
      const sessionId = body.sessionId ?? 'curriculum-session-settled';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          success: true,
          player: { dna: 900, total_games_played: 7, high_score: 4_000 },
          validation: {
            valid: true,
            adjustedDna: 80,
            baseDna: 100,
            rawDna: 100,
            genelessRawDna: 100,
            score: 30,
            extracted: false,
            yieldDna: 100,
            chargeState: 'charged',
          },
          impact: {
            version: 1,
            sessionId,
            settledAt: '2026-08-05T08:45:00.000Z',
            outcome: 'crashed',
            dynasty: DYNASTY,
            receipt: {
              validated: true,
              score: 30,
              yieldDna: 100,
              dnaCredited: 80,
              energyCommitted: 1,
              commitmentMultiplierBps: 10_000,
              generation: 2,
              personalBest: {
                eligible: true,
                before: 4_000,
                after: 4_000,
                improved: false,
              },
            },
            // The REVEAL: a settled fact the server actually wrote, which is
            // why it is a `milestone` and why it carries no destination —
            // one unlock, one pointer (decision 14).
            impacts: [
              {
                key: `curriculum:gene:${UNLOCKED}`,
                pillar: 'discovery',
                kind: 'gene_unlocked',
                significance: 'milestone',
                headline: beat.headline,
                detail: beat.detail,
                metadata: { geneId: UNLOCKED },
              },
            ],
            featuredImpactKeys: [`curriculum:gene:${UNLOCKED}`],
            recommendedAction: null,
          },
        },
      });
    }
    return route.continue();
  });
}

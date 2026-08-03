import { expect, test, type Locator } from '@playwright/test';
import { seedConsent, signInAsGuest } from './helpers';
import { installGenomeV2BrowserFixture } from './fixtures/genome-v2';

async function flickRight(surface: Locator): Promise<void> {
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  const y = Math.max(box!.y + 40, box!.y + box!.height / 2);
  await surface.dispatchEvent('pointerdown', {
    pointerId: 72,
    pointerType: 'touch',
    isPrimary: true,
    clientX: box!.x + 70,
    clientY: y,
  });
  await surface.dispatchEvent('pointermove', {
    pointerId: 72,
    pointerType: 'touch',
    isPrimary: true,
    clientX: box!.x + 130,
    clientY: y,
  });
  await surface.dispatchEvent('pointerup', {
    pointerId: 72,
    pointerType: 'touch',
    isPrimary: true,
    clientX: box!.x + 130,
    clientY: y,
  });
}

test.describe('Genome v2 live player journey', () => {
  test.describe.configure({ timeout: 180_000 });

  test('a resumed mobile run exposes the reaction map, commits Phoenix, and returns the flick untouched', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedConsent(page);
    const fixture = await installGenomeV2BrowserFixture(page);

    // Establish real guest auth against an ordinary empty Setup first; the
    // reload below is the deterministic equivalent of reopening an interrupted
    // run and keeps this journey independent from hosted player data.
    await signInAsGuest(page);
    fixture.exposeInterruptedRun();
    await page.reload({ waitUntil: 'domcontentloaded' });

    const recovery = page.getByTestId('interrupted-run-recovery');
    await expect(recovery).toBeVisible({ timeout: 60_000 });
    const loom = page.getByTestId('gene-choice-overlay');
    // React replaces the entire recovery tree synchronously. Schedule the
    // actual DOM click, then use the restored board as the completion signal
    // instead of asking an action locator to remain attached to a button whose
    // successful click deliberately destroys it.
    await page.evaluate(() => {
      window.setTimeout(() => {
        const button = document.querySelector<HTMLButtonElement>(
          '[data-testid="interrupted-run-recovery"] button'
        );
        button?.click();
      }, 0);
    });
    const initialResumeGate = page.getByTestId('resume-gate');
    await expect(page.getByTestId('game-board-viewport')).toBeVisible({ timeout: 60_000 });
    await expect(initialResumeGate).toBeVisible();
    await expect(loom).toHaveCount(0);
    const initialFlickSurface = page.getByTestId('flick-surface');
    await expect(initialFlickSurface).toBeVisible();

    // The recovered board contains a visible, still-uncollected physical
    // relic one cell ahead. Only the player's deliberate movement collects it
    // and opens the Loom; resume itself never interrupts with an automatic
    // offer.
    await flickRight(initialFlickSurface);
    await expect(loom).toBeVisible({ timeout: 60_000 });
    await expect(loom).toHaveAttribute('data-rules-version', '2');
    await expect(page.getByTestId('flick-surface')).toHaveCount(0);
    await expect(initialResumeGate).toBeHidden();

    const phoenix = page.getByTestId('gene-option-0');
    await expect(phoenix).toContainText('Phoenix');
    await expect(phoenix).toContainText('UMBRA');
    await expect(phoenix).toContainText('FERAL');
    await expect(page.getByTestId('gene-option-0-strain-UMBRA')).toBeVisible();
    await expect(page.getByTestId('gene-option-0-strain-FERAL')).toBeVisible();

    // A fresh Loom is deliberately neutral. Reading or keyboard focus is not
    // consent, and the deeper reaction map stays out of the first mobile read.
    const confirm = page.getByTestId('loom-confirm');
    await expect(phoenix).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('gene-option-1')).toHaveAttribute('aria-checked', 'false');
    await expect(confirm).toBeDisabled();
    await expect(page.getByTestId('loom-empty-prompt')).toBeVisible();
    await expect(page.getByTestId('loom-details-toggle')).toHaveCount(0);
    await expect(page.getByTestId('loom-full-reaction-map')).toHaveCount(0);

    await phoenix.click();
    await expect(phoenix).toHaveAttribute('aria-checked', 'true');
    await expect(confirm).toBeEnabled();
    await expect(confirm).toContainText('THREAD Phoenix');
    await expect(page.getByTestId('loom-quick-read')).toBeVisible();
    const details = page.getByTestId('loom-details-toggle');
    await expect(details).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('loom-full-reaction-map')).toHaveCount(0);

    // Experts can deliberately unfold the n-order consequences without
    // making the beginner-facing choice itself look like a dashboard.
    await details.click();
    await expect(details).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('loom-full-reaction-map')).toBeVisible();

    // The choice names the immediate Strain crossing and the next threshold;
    // the player is never expected to memorize either ladder.
    await expect(page.getByTestId('loom-strain-UMBRA')).toContainText('UMBRA');
    await expect(page.getByTestId('loom-strain-UMBRA')).toContainText('2 → 3');
    await expect(page.getByTestId('loom-strain-UMBRA-rule')).toContainText('NOW');
    await expect(page.getByTestId('loom-strain-FERAL')).toContainText('FERAL');
    await expect(page.getByTestId('loom-strain-FERAL')).toContainText('1 → 2');
    await expect(page.getByTestId('loom-strain-FERAL-rule')).toContainText('NOW');

    await testInfo.attach('tactical-loom-mobile', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    const spliceMap = page.getByTestId('loom-lite-splices');
    await expect(spliceMap).toContainText('Styx Contract');
    await expect(spliceMap).toContainText('FORMS');
    await expect(spliceMap).toContainText('HELD Mirror Wager');
    await expect(spliceMap).toContainText('Ashen Stake');
    await expect(spliceMap).toContainText('CLOSED');

    // Selection and commitment remain two explicit actions even on a phone;
    // the missing flick surface above proves gameplay input cannot leak into
    // the held decision.
    await confirm.click();

    await expect(loom).toHaveCount(0);
    const callout = page.getByTestId('genome-commit-callout');
    await expect(callout).toBeVisible();
    await expect(callout).toContainText('Styx Contract');
    await expect(callout).toHaveCSS('pointer-events', 'none');

    await testInfo.attach('genome-commit-callout-mobile', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    // Confirmation never leaks into movement. The pointer-transparent
    // celebration deliberately occupies the cockpit's shared status rail, so
    // the rail's `resume-gate` is temporarily not rendered. The authoritative
    // cockpit state still has to remain held until the first deliberate flick.
    const cockpit = page.getByTestId('game-hud');
    await expect(cockpit).toHaveAttribute('data-state', 'held');
    const heldCue = page.getByTestId('tactical-hold');
    await expect(heldCue).toBeVisible();
    await expect(heldCue).toHaveText('Move to resume');
    await expect(heldCue).toHaveCSS('font-size', '18px');
    expect(await heldCue.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    const heldCueBox = await heldCue.boundingBox();
    const calloutBox = await callout.boundingBox();
    expect(heldCueBox).not.toBeNull();
    expect(calloutBox).not.toBeNull();
    expect(heldCueBox!.x).toBeGreaterThanOrEqual(calloutBox!.x);
    expect(heldCueBox!.x + heldCueBox!.width).toBeLessThanOrEqual(
      calloutBox!.x + calloutBox!.width
    );
    expect(heldCueBox!.x + heldCueBox!.width).toBeLessThanOrEqual(390);
    await expect(page.getByRole('button', { name: 'Abandon run' })).toBeVisible();
    const flickSurface = page.getByTestId('flick-surface');
    await expect(flickSurface).toBeVisible();
    await flickRight(flickSurface);
    await expect(cockpit).toHaveAttribute('data-state', 'active');
    await expect(page.getByTestId('tactical-hold')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pause game (Space)' })).toBeVisible();
    await expect(callout).toBeVisible();

    await expect
      .poll(() => fixture.checkpointWrites.length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    const accepted = fixture.checkpointWrites.at(-1)?.state.genomeV2;
    expect(accepted?.offer).toBeNull();
    expect(accepted?.activeSplices).toContain('splice_styx_contract');
    expect(accepted?.slots.some((slot) =>
      slot.occupant?.kind === 'splice' &&
      slot.occupant.spliceId === 'splice_styx_contract'
    )).toBe(true);
  });
});

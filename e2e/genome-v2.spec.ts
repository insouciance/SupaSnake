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
    // actual DOM click, then use the Loom as the completion signal instead of
    // asking an action locator to remain attached to a button whose successful
    // click deliberately destroys it.
    await page.evaluate(() => {
      window.setTimeout(() => {
        const button = document.querySelector<HTMLButtonElement>(
          '[data-testid="interrupted-run-recovery"] button'
        );
        button?.click();
      }, 0);
    });
    await expect(loom).toBeVisible({ timeout: 60_000 });
    await expect(loom).toHaveAttribute('data-rules-version', '2');
    await expect(page.getByTestId('flick-surface')).toHaveCount(0);
    await expect(page.getByTestId('game-board-viewport')).toBeVisible();

    const phoenix = page.getByTestId('gene-option-0');
    await expect(phoenix).toContainText('Phoenix');
    await expect(phoenix).toContainText('UMBRA');
    await expect(phoenix).toContainText('FERAL');

    // The choice names the immediate Strain crossing and the next threshold;
    // the player is never expected to memorize either ladder.
    await expect(page.getByTestId('loom-strain-UMBRA')).toContainText('UMBRA');
    await expect(page.getByTestId('loom-strain-UMBRA')).toContainText('2 → 3');
    await expect(page.getByTestId('loom-strain-UMBRA-rule')).toContainText('NOW');
    await expect(page.getByTestId('loom-strain-FERAL')).toContainText('FERAL');
    await expect(page.getByTestId('loom-strain-FERAL')).toContainText('1 → 2');
    await expect(page.getByTestId('loom-strain-FERAL-rule')).toContainText('NEXT');

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
    const confirm = page.getByTestId('loom-confirm');
    await expect(confirm).toBeEnabled({ timeout: 5_000 });
    await phoenix.click();
    await expect(confirm).toContainText('THREAD Phoenix');
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

    // Confirmation never leaks into movement. The held-state Abandon control
    // proves the engine is still waiting; the pointer-transparent celebration
    // deliberately occupies the shared status rail while the first deliberate
    // flick releases that hold.
    const heldAbandon = page.getByRole('button', { name: 'Abandon run' });
    await expect(heldAbandon).toBeVisible();
    const flickSurface = page.getByTestId('flick-surface');
    await expect(flickSurface).toBeVisible();
    await flickRight(flickSurface);
    await expect(heldAbandon).toBeHidden();
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

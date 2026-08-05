/**
 * Frozen-state geometry, touch-target, and legal-surface audit for Cockpit v1.
 * Start the dev server first; override COCKPIT_BASE_URL when needed.
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.COCKPIT_BASE_URL ?? 'http://127.0.0.1:3107';
const VIEWPORTS = [
  { name: 'compact', width: 320, height: 568 },
  { name: 'landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1440, height: 900 },
];
const ALL_KINDS = ['hold', 'abandon', 'gene', 'gene-recode', 'mutation', 'portal', 'surge', 'expression'];
const requestedKinds = process.env.COCKPIT_KINDS
  ?.split(',')
  .map((kind) => kind.trim())
  .filter(Boolean);
const KINDS = requestedKinds?.length
  ? ALL_KINDS.filter((kind) => requestedKinds.includes(kind))
  : ALL_KINDS;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function intersects(a, b) {
  return a.x < b.right - 0.5 && a.right > b.x + 0.5 &&
    a.y < b.bottom - 0.5 && a.bottom > b.y + 0.5;
}

const browser = await chromium.launch({ headless: true });
let checks = 0;

async function openCase({ kind, viewport, consent }) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: 'reduce',
    hasTouch: viewport.name !== 'desktop',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (!consent) {
    await page.addInitScript(() => {
      // constitution-allow: local-progress  isolated test consent fixture contains no player state
      localStorage.setItem('cookie-consent', JSON.stringify({
        essential: true,
        functional: false,
        analytics: false,
        marketing: false,
        timestamp: '2026-07-23T00:00:00.000Z',
      }));
    });
  }

  await page.goto(`${BASE_URL}/dev/cockpit/decision?kind=${kind}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await page.locator('[data-testid="game-board-viewport"] canvas').waitFor({
    state: 'visible',
  });
  await page.waitForFunction(() => {
    const host = document.querySelector('[data-testid="cockpit-webgl-board"]');
    return Number(host?.getAttribute('data-draw-calls')) > 0;
  });
  if (consent) {
    await page.waitForFunction(() =>
      document.documentElement.getAttribute('data-consent-visible') === 'true' &&
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--consent-banner-height')
      ) > 0
    );
  }
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  ));

  const metrics = await page.evaluate(({ kind, consent }) => {
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        x: value.x,
        y: value.y,
        width: value.width,
        height: value.height,
        right: value.right,
        bottom: value.bottom,
      };
    };
    const root = document.querySelector('[data-testid="cockpit-decision-fixture"]');
    const board = document.querySelector('[data-testid="game-board-viewport"]');
    const dock = document.querySelector('[data-testid="cockpit-decision-dock"]');
    const callout = document.querySelector('[data-testid="expression-flourish"]');
    const holdRail = document.querySelector('[data-testid="tactical-hold"]');
    const resumeGate = document.querySelector('[data-testid="resume-gate"]');
    const abandonControl = document.querySelector('button[aria-label="Abandon run"]');
    const viewControl = document.querySelector('button[aria-label="Reset arena view"]');
    const consentBanner = document.querySelector('.consent-banner');
    // Dialogs may use a semantic footer for their own confirmation actions.
    // The legal-surface invariant applies to the site footer behind the
    // cockpit, not to those in-dialog controls.
    const footer = [...document.querySelectorAll('footer')].find(
      (element) => !element.closest('[role="dialog"], [role="alertdialog"]')
    ) ?? null;
    if (!root || !board) throw new Error('Decision fixture did not render');

    const targetRoot = kind === 'hold' ? root : dock ?? callout;
    const buttons = targetRoot
      ? [...targetRoot.querySelectorAll('button')]
          .filter((button) => {
            const style = getComputedStyle(button);
            return style.visibility !== 'hidden' && style.display !== 'none';
          })
          .map(rect)
      : [];
    const primaryText = targetRoot
      ? [...targetRoot.querySelectorAll('h2, p, button')]
          .filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && getComputedStyle(element).display !== 'none';
          })
          .map((element) => ({
            text: element.textContent?.trim().slice(0, 40) ?? '',
            size: Number.parseFloat(getComputedStyle(element).fontSize),
          }))
      : [];
    const dialog = dock?.querySelector('[role="dialog"], [role="alertdialog"]');
    const panel = dialog?.firstElementChild;

    /*
     * THE HUD GUARANTEE: the board may paint over any tray, but it may never
     * take a tray's click.
     *
     * The pop-out gives the board canvas a drawing surface 1.5x its bay,
     * sitting over the HUD at a higher z-index. That ruling is about what the
     * player SEES; it must never become input capture. It did once:
     * `@react-three/fiber` writes `pointerEvents: 'auto'` as an INLINE style on
     * its canvas wrapper, which beat the surface's inherited
     * `pointer-events: none` and swallowed the click on "Abandon run".
     *
     * `elementFromPoint` at each control's own centre is the same question the
     * browser asks when a player taps, so this catches any future bleed,
     * overlay or stacking change that reintroduces the capture.
     *
     * SCOPED TO THE BOARD'S SUBTREE, DELIBERATELY. A control covered by an
     * OPEN DECISION SURFACE is not a defect - it is the point: while an
     * abandon confirmation is up, the dock's scrim covers the HUD and the run
     * is paused. This asserts the narrower and actually-ratified rule: the
     * thing on top of a HUD control is never the board.
     */
    const arenaBay = document.querySelector('[data-testid="cockpit-arena-bay"]');
    const blockedControls = [...document.querySelectorAll('button')]
      .map((element) => {
        const box = element.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return null;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return null;
        const top = document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2
        );
        if (top === element || element.contains(top)) return null;
        // Only the BOARD taking the click is a defect.
        if (!top || !arenaBay || !arenaBay.contains(top)) return null;
        const label =
          element.getAttribute('aria-label') ??
          element.textContent?.trim().slice(0, 24) ??
          'button';
        return `${label} <- ${top.tagName.toLowerCase()}`;
      })
      .filter(Boolean);

    return {
      blockedControls,
      kind,
      consent,
      root: rect(root),
      board: rect(board),
      dock: dock ? rect(dock) : null,
      callout: callout ? rect(callout) : null,
      dialog: dialog ? rect(dialog) : null,
      panel: panel ? rect(panel) : null,
      holdRail: holdRail && getComputedStyle(holdRail).display !== 'none'
        ? rect(holdRail)
        : null,
      resumeGate: resumeGate && getComputedStyle(resumeGate).display !== 'none'
        ? rect(resumeGate)
        : null,
      abandonControl: abandonControl ? rect(abandonControl) : null,
      viewControl: viewControl && getComputedStyle(viewControl).display !== 'none'
        ? rect(viewControl)
        : null,
      buttons,
      primaryText,
      footerVisibility: footer ? getComputedStyle(footer).visibility : null,
      consentBanner: consentBanner ? rect(consentBanner) : null,
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
      verticalOverflow:
        document.documentElement.scrollHeight > document.documentElement.clientHeight,
    };
  }, { kind, consent });

  invariant(errors.length === 0, `${kind}/${viewport.name}: page errors: ${errors.join('; ')}`);
  if (kind === 'hold') {
    invariant(!metrics.dock, `${kind}/${viewport.name}: tactical hold opened a modal`);
    invariant(
      metrics.resumeGate || metrics.holdRail,
      `${kind}/${viewport.name}: tactical hold has no visible guidance`
    );
    invariant(metrics.abandonControl, `${kind}/${viewport.name}: abandon control missing`);
    if (viewport.name !== 'desktop') {
      invariant(
        !metrics.viewControl,
        `${kind}/${viewport.name}: reset view did not yield the coarse-pointer pause cell`
      );
      invariant(
        metrics.abandonControl.width >= 78 && metrics.abandonControl.height >= 52,
        `${kind}/${viewport.name}: coarse pause cell is only ${metrics.abandonControl.width.toFixed(1)}×${metrics.abandonControl.height.toFixed(1)}`
      );
    }
  } else if (metrics.dock) {
    invariant(metrics.dialog, `${kind}/${viewport.name}: dialog missing from dock`);
    invariant(metrics.panel, `${kind}/${viewport.name}: decision panel missing`);
    invariant(
      metrics.dialog.x >= metrics.dock.x - 0.5 &&
      metrics.dialog.y >= metrics.dock.y - 0.5 &&
      metrics.dialog.right <= metrics.dock.right + 0.5 &&
      metrics.dialog.bottom <= metrics.dock.bottom + 0.5,
      `${kind}/${viewport.name}: dialog escaped decision dock`
    );
    invariant(
      intersects(metrics.board, metrics.dock),
      `${kind}/${viewport.name}: strategic modal does not command the board`
    );
    const panelCenterX = metrics.panel.x + metrics.panel.width / 2;
    const panelCenterY = metrics.panel.y + metrics.panel.height / 2;
    const boardCenterX = metrics.board.x + metrics.board.width / 2;
    const boardCenterY = metrics.board.y + metrics.board.height / 2;
    invariant(
      Math.abs(panelCenterX - boardCenterX) <= 10 &&
      Math.abs(panelCenterY - boardCenterY) <= 10,
      `${kind}/${viewport.name}: strategic panel is not centered on the arena`
    );
  } else {
    invariant(metrics.callout, `${kind}/${viewport.name}: expression callout missing`);
    invariant(
      !intersects(metrics.board, metrics.callout),
      `${kind}/${viewport.name}: expression callout intersects board`
    );
  }
  for (const target of metrics.buttons) {
    invariant(
      target.width >= 44 && target.height >= 44,
      `${kind}/${viewport.name}: ${target.width.toFixed(1)}×${target.height.toFixed(1)} target`
    );
  }
  for (const label of metrics.primaryText) {
    invariant(
      label.size >= 14,
      `${kind}/${viewport.name}: ${label.size}px text “${label.text}”`
    );
  }
  invariant(
    metrics.blockedControls.length === 0,
    `${kind}/${viewport.name}: board surface intercepts controls: ${metrics.blockedControls.join('; ')}`
  );
  invariant(!metrics.horizontalOverflow, `${kind}/${viewport.name}: horizontal overflow`);
  invariant(!metrics.verticalOverflow, `${kind}/${viewport.name}: vertical overflow`);
  invariant(metrics.footerVisibility === 'hidden', `${kind}/${viewport.name}: footer is visible`);
  if (consent) {
    invariant(metrics.consentBanner, `${kind}/${viewport.name}: consent banner missing`);
    invariant(
      !intersects(metrics.root, metrics.consentBanner),
      `${kind}/${viewport.name}: consent overlaps cockpit viewport`
    );
  }
  await context.close();
  checks += 1;
}

try {
  for (const kind of KINDS) {
    for (const viewport of VIEWPORTS) {
      await openCase({ kind, viewport, consent: false });
    }
  }
  await openCase({
    kind: 'gene',
    viewport: VIEWPORTS[0],
    consent: true,
  });
  console.log(`PASS ${checks} frozen-state / legal-surface cockpit checks`);
} finally {
  await browser.close();
}

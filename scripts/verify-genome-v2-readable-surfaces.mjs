/**
 * Real-browser readability and target audit for the live Tactical Loom and
 * Research Workbench. Start the dev server first; override GENOME_V2_BASE_URL
 * and optionally GENOME_V2_SCREENSHOT_DIR when collecting review evidence.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.GENOME_V2_BASE_URL ?? 'http://127.0.0.1:3107';
const SCREENSHOT_DIR = process.env.GENOME_V2_SCREENSHOT_DIR;
const TARGET_EPSILON = 0.5;
const VIEWPORTS = [
  { name: 'compact', width: 320, height: 568 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  ));
}

async function capture(page, surface, viewport) {
  if (!SCREENSHOT_DIR) return;
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${surface}-${viewport.name}.png`),
    fullPage: true,
  });
}

async function openPage(browser, viewport, route) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: 'reduce',
    hasTouch: viewport.name !== 'desktop',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${BASE_URL}${route}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  return { context, page, errors };
}

async function auditLoom(browser, viewport) {
  const { context, page, errors } = await openPage(
    browser,
    viewport,
    '/dev/cockpit/decision?kind=gene'
  );
  const overlay = page.locator('[data-testid="gene-choice-overlay"]');
  await overlay.waitFor({ state: 'visible' });
  await page.waitForTimeout(350);

  // The fixture's real names verify component wiring. This deliberately long
  // replacement verifies that the same rendered slots remain readable when a
  // catalog label reaches the width that previously became an ellipsis.
  await page.evaluate(() => {
    const longName = 'Compound Interest';
    const candidate = document.querySelector('[data-testid="gene-option-0-name"]');
    const focused = document.querySelector('[data-testid="loom-focused-gene-name"]');
    if (candidate) candidate.textContent = longName;
    if (focused) focused.textContent = longName;
  });
  await settle(page);

  const metrics = await page.evaluate(() => {
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom };
    };
    const readable = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const style = getComputedStyle(element);
      const overflowX = style.overflowX;
      const overflowY = style.overflowY;
      return {
        text: element.textContent?.trim() ?? '',
        box: rect(element),
        fontSize: Number.parseFloat(style.fontSize),
        clippedX: ['hidden', 'clip'].includes(overflowX)
          && element.scrollWidth > element.clientWidth + 0.5,
        clippedY: ['hidden', 'clip'].includes(overflowY)
          && element.scrollHeight > element.clientHeight + 0.5,
        overflowX,
        overflowY,
        whiteSpace: style.whiteSpace,
      };
    };
    const panel = document.querySelector('[data-testid="gene-choice-overlay"] > div');
    const scroll = document.querySelector('[data-testid="loom-scroll-region"]');
    if (!panel || !scroll) throw new Error('Tactical Loom panel or scroll region missing');
    const buttons = [...document.querySelectorAll('[data-testid="gene-choice-overlay"] button')]
      .filter((button) => getComputedStyle(button).display !== 'none')
      .map((button) => ({ id: button.getAttribute('data-testid') ?? button.textContent?.trim().slice(0, 30) ?? 'button', ...rect(button) }));
    const material = [
      ...document.querySelectorAll('[data-testid="loom-lite"] p'),
      ...document.querySelectorAll('[data-testid="loom-lite"] button'),
    ].map((element) => ({
      text: element.textContent?.trim().slice(0, 48) ?? '',
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
    }));
    const strainBadges = [
      ...document.querySelectorAll('[data-testid^="gene-option-0-strain-"]'),
    ].map((element) => {
      const style = getComputedStyle(element);
      return {
        text: element.textContent?.trim() ?? '',
        box: rect(element),
        fontSize: Number.parseFloat(style.fontSize),
        clipped: element.scrollWidth > element.clientWidth + 0.5
          || element.scrollHeight > element.clientHeight + 0.5,
      };
    });
    return {
      panel: rect(panel),
      scroll: rect(scroll),
      scrollHeight: scroll.scrollHeight,
      scrollClientHeight: scroll.clientHeight,
      scrollOverflowY: getComputedStyle(scroll).overflowY,
      scrollTouchAction: getComputedStyle(scroll).touchAction,
      candidate: readable('[data-testid="gene-option-0-name"]'),
      focused: readable('[data-testid="loom-focused-gene-name"]'),
      buttons,
      material,
      strainBadges,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  invariant(errors.length === 0, `loom/${viewport.name}: ${errors.join('; ')}`);
  invariant(metrics.candidate.text === 'Compound Interest', `loom/${viewport.name}: long candidate missing`);
  invariant(
    !metrics.candidate.clippedX && !metrics.candidate.clippedY,
    `loom/${viewport.name}: candidate name clips ${JSON.stringify(metrics.candidate)}`
  );
  invariant(metrics.candidate.whiteSpace !== 'nowrap', `loom/${viewport.name}: candidate cannot wrap`);
  invariant(metrics.candidate.fontSize >= 14, `loom/${viewport.name}: candidate is ${metrics.candidate.fontSize}px`);
  invariant(metrics.focused.text === 'Compound Interest', `loom/${viewport.name}: focused name missing`);
  invariant(
    !metrics.focused.clippedX && !metrics.focused.clippedY,
    `loom/${viewport.name}: focused name clips ${JSON.stringify(metrics.focused)}`
  );
  invariant(metrics.focused.fontSize >= 16, `loom/${viewport.name}: focused name is ${metrics.focused.fontSize}px`);
  invariant(['auto', 'scroll'].includes(metrics.scrollOverflowY), `loom/${viewport.name}: consequences do not scroll internally`);
  invariant(metrics.scrollTouchAction === 'pan-y', `loom/${viewport.name}: scroll region touch action is ${metrics.scrollTouchAction}`);
  invariant(metrics.scroll.x >= metrics.panel.x - 0.5 && metrics.scroll.right <= metrics.panel.right + 0.5, `loom/${viewport.name}: scroll region escaped panel`);
  const undersizedButtons = metrics.buttons.filter(
    ({ width, height }) => width < 44 - TARGET_EPSILON || height < 44 - TARGET_EPSILON
  );
  invariant(
    undersizedButtons.length === 0,
    `loom/${viewport.name}: control below 44px ${JSON.stringify(undersizedButtons)}`
  );
  invariant(metrics.material.every(({ fontSize }) => fontSize >= 14), `loom/${viewport.name}: material text below 14px`);
  invariant(
    metrics.strainBadges.map(({ text }) => text).join(' · ') === 'UMBRA · FERAL',
    `loom/${viewport.name}: dual Strain identity is not a first-read badge ${JSON.stringify(metrics.strainBadges)}`
  );
  invariant(
    metrics.strainBadges.every(({ fontSize, clipped }) => fontSize >= 10 && !clipped),
    `loom/${viewport.name}: Strain badge is clipped or below 10px ${JSON.stringify(metrics.strainBadges)}`
  );
  invariant(!metrics.pageOverflow, `loom/${viewport.name}: horizontal page overflow`);

  await capture(page, 'tactical-loom', viewport);
  await context.close();
}

async function auditWorkbench(browser, viewport) {
  const { context, page, errors } = await openPage(
    browser,
    viewport,
    '/dev/cockpit/research'
  );
  const workbench = page.locator('[data-testid="workbench-research-table"]');
  await workbench.waitFor({ state: 'visible' });
  await page.locator('[data-testid="workbench-gene-compound_interest"]').click();
  await settle(page);

  const metrics = await page.evaluate(() => {
    const focused = document.querySelector('[data-testid="workbench-focused-gene-name"]');
    const strainRail = document.querySelector('[data-testid="workbench-strains"]');
    const geneRail = document.querySelector('[data-testid="workbench-gene-palette"]');
    if (!focused || !strainRail || !geneRail) throw new Error('Workbench readability targets missing');
    const focusedStyle = getComputedStyle(focused);
    const targets = [...document.querySelectorAll('[data-testid^="workbench-tier-"]')]
      .map((element) => {
        const { width, height } = element.getBoundingClientRect();
        return { width, height };
      });
    const badge = (selector) => [...document.querySelectorAll(selector)].map((element) => {
      const style = getComputedStyle(element);
      return {
        text: element.textContent?.trim() ?? '',
        fontSize: Number.parseFloat(style.fontSize),
        clipped: element.scrollWidth > element.clientWidth + 0.5
          || element.scrollHeight > element.clientHeight + 0.5,
      };
    });
    return {
      focusedText: focused.textContent?.trim() ?? '',
      focusedFontSize: Number.parseFloat(focusedStyle.fontSize),
      focusedWhiteSpace: focusedStyle.whiteSpace,
      focusedClippedX: focused.scrollWidth > focused.clientWidth + 0.5,
      focusedClippedY: focused.scrollHeight > focused.clientHeight + 0.5,
      targets,
      focusedBadges: badge('[data-testid^="workbench-focused-gene-strain-"]'),
      dualGeneBadges: badge('[data-testid^="workbench-locus-1-strain-"]'),
      strainOverflowX: getComputedStyle(strainRail).overflowX,
      geneOverflowX: getComputedStyle(geneRail).overflowX,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  invariant(errors.length === 0, `workbench/${viewport.name}: ${errors.join('; ')}`);
  invariant(metrics.focusedText === 'Compound Interest', `workbench/${viewport.name}: full selected name missing`);
  invariant(metrics.focusedWhiteSpace !== 'nowrap', `workbench/${viewport.name}: selected name cannot wrap`);
  invariant(!metrics.focusedClippedX && !metrics.focusedClippedY, `workbench/${viewport.name}: selected name clips`);
  invariant(metrics.focusedFontSize >= 12, `workbench/${viewport.name}: selected name is ${metrics.focusedFontSize}px`);
  invariant(metrics.targets.length === 15, `workbench/${viewport.name}: expected 15 Strain targets, found ${metrics.targets.length}`);
  invariant(
    metrics.targets.every(
      ({ width, height }) => width >= 44 - TARGET_EPSILON && height >= 44 - TARGET_EPSILON
    ),
    `workbench/${viewport.name}: Strain target below 44px`
  );
  invariant(metrics.geneOverflowX === 'auto', `workbench/${viewport.name}: gene rail is not contained`);
  invariant(
    metrics.focusedBadges.map(({ text }) => text).join(' · ') === 'AURUM',
    `workbench/${viewport.name}: focused Strain identity missing ${JSON.stringify(metrics.focusedBadges)}`
  );
  invariant(
    metrics.dualGeneBadges.map(({ text }) => text).join(' · ') === 'AURUM · UMBRA',
    `workbench/${viewport.name}: dual gene badges missing ${JSON.stringify(metrics.dualGeneBadges)}`
  );
  invariant(
    [...metrics.focusedBadges, ...metrics.dualGeneBadges]
      .every(({ fontSize, clipped }) => fontSize >= 9 && !clipped),
    `workbench/${viewport.name}: Strain badge is clipped or below 9px`
  );
  if (viewport.name !== 'desktop') {
    invariant(metrics.strainOverflowX === 'auto', `workbench/${viewport.name}: mobile Strain rail is not contained`);
  }
  invariant(!metrics.pageOverflow, `workbench/${viewport.name}: horizontal page overflow`);

  await capture(page, 'research-workbench', viewport);
  await context.close();
}

const browser = await chromium.launch({ headless: true });
let checks = 0;
try {
  for (const viewport of VIEWPORTS) {
    await auditLoom(browser, viewport);
    await auditWorkbench(browser, viewport);
    checks += 2;
  }
  console.log(`PASS ${checks} Genome v2 readable-surface checks`);
} finally {
  await browser.close();
}

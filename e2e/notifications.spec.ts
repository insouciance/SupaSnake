import { expect, test, type Page } from '@playwright/test';
import { seedConsent, signInAsGuest } from './helpers';

const CAREER_SPINE_ENABLED =
  process.env.NEXT_PUBLIC_CAREER_SPINE_V1 === 'true';

interface ServerAttention {
  id: string;
  kind: 'action';
  status: 'unseen' | 'seen';
  destination: 'lab';
  headline: string;
  detail: string;
  source: { type: 'test'; id: string };
  createdAt: string;
  seenAt?: string;
}

async function serveNotifications(page: Page, count: number): Promise<void> {
  const notifications: ServerAttention[] = Array.from(
    { length: count },
    (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      kind: 'action',
      status: 'unseen',
      destination: 'lab',
      headline: index === 0 ? 'The Lab is ready' : `Lab opportunity ${index + 1}`,
      detail: 'Discover more snakes when you want to change your run.',
      source: { type: 'test', id: `lab-attention-${index}` },
      createdAt: new Date(Date.UTC(2026, 6, 30, 12, 0, index)).toISOString(),
    })
  );

  await page.route('**/api/progression/attention**', async (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as { id?: string };
      const notification = notifications.find((item) => item.id === body.id);
      if (!notification) {
        await route.fulfill({ status: 404, json: { error: 'Attention item not found' } });
        return;
      }
      notification.status = 'seen';
      notification.seenAt = new Date().toISOString();
      await route.fulfill({ json: { item: notification } });
      return;
    }
    await route.fulfill({ json: { items: notifications, nextOffset: null } });
  });

  // The production notification hierarchy is server-authoritative and only
  // fetched for an authenticated account. Exercise that path directly; no
  // progress fixture may be placed in browser storage, even in E2E.
  await signInAsGuest(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
}

async function openNotificationCenter(page: Page, count: number) {
  // Home now communicates attention directly on its four destination marks;
  // the full inbox is progressive disclosure inside the stable Lab rail.
  await page.goto('/lab/breed', { waitUntil: 'domcontentloaded' });
  const more = page.locator('summary[aria-label="More"]');
  await expect(more).toBeVisible({ timeout: 60_000 });
  await more.click();
  const trigger = page.getByRole('button', {
    name: `Notifications, ${count} action${count === 1 ? '' : 's'} available`,
  });
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  return trigger;
}

test.describe('notification attention dialog', () => {
  test.describe.configure({ timeout: 120_000 });

  test('flag-off does not read or display server recognition', async ({ page }) => {
    test.skip(CAREER_SPINE_ENABLED, 'rollback-only assertion');
    await seedConsent(page);
    let attentionRequests = 0;
    await page.route('**/api/progression/attention**', async (route) => {
      attentionRequests += 1;
      await route.fulfill({ json: { items: [], nextOffset: null } });
    });
    await signInAsGuest(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByLabel(/new lab activity/i)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /notifications, \d+ actions? available/i })
    ).toHaveCount(0);
    expect(attentionRequests).toBe(0);
  });

  test('stays inside desktop and mobile viewports with a long internal scroll list', async ({
    page,
  }) => {
    test.skip(!CAREER_SPINE_ENABLED, 'Career Spine presentation is off');
    await seedConsent(page);
    await serveNotifications(page, 30);

    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      const trigger = await openNotificationCenter(page, 30);
      await trigger.click();

      const dialog = page.getByRole('dialog', { name: 'Notifications' });
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);

      const scroll = await page.getByTestId('notification-list').evaluate((list) => ({
        clientHeight: list.clientHeight,
        scrollHeight: list.scrollHeight,
      }));
      expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);

      await page.getByRole('button', { name: 'Close notifications' }).click();
      await expect(dialog).not.toBeVisible();
    }
  });

  test('opening and closing does not clear attention, while its action reaches the Lab', async ({
    page,
  }) => {
    test.skip(!CAREER_SPINE_ENABLED, 'Career Spine presentation is off');
    await seedConsent(page);
    await serveNotifications(page, 1);

    await expect(page.getByLabel('New Lab activity')).toBeVisible();
    const trigger = await openNotificationCenter(page, 1);
    await trigger.click();
    await page.getByRole('button', { name: 'Close notifications' }).click();
    await expect(trigger).toHaveAccessibleName('Notifications, 1 action available');

    await trigger.click();
    await page.getByRole('link', { name: /The Lab is ready/i }).click();
    await expect(page).toHaveURL(/\/lab(?:$|[?#])/);
  });
});

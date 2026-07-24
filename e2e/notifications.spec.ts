import { expect, test, type Page } from '@playwright/test';
import { seedConsent } from './helpers';

interface StoredAttention {
  id: string;
  title: string;
  description: string;
  destination: 'lab';
  badgeKind: 'exclamation';
  attentionReason: 'progression-opportunity';
  href: '/lab';
  actionLabel: 'Visit the Lab';
  persistent: true;
  createdAt: number;
  updatedAt: number;
}

async function seedNotifications(page: Page, count: number): Promise<void> {
  const notifications = Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const id = index === 0 ? 'lab-discovery' : `lab-attention-${index}`;
      const notification: StoredAttention = {
        id,
        title: index === 0 ? 'The Lab is ready' : `Lab opportunity ${index + 1}`,
        description: 'Discover more snakes when you want to change your run.',
        destination: 'lab',
        badgeKind: 'exclamation',
        attentionReason: 'progression-opportunity',
        href: '/lab',
        actionLabel: 'Visit the Lab',
        persistent: true,
        createdAt: index + 1,
        updatedAt: index + 1,
      };
      return [id, notification];
    })
  );

  await page.addInitScript((storedNotifications) => {
    window.localStorage.setItem(
      'supasnake-ui-notifications-v1',
      JSON.stringify({ state: { notifications: storedNotifications }, version: 1 })
    );
  }, notifications);
}

test.describe('notification attention dialog', () => {
  test('stays inside desktop and mobile viewports with a long internal scroll list', async ({
    page,
  }) => {
    await seedConsent(page);
    await seedNotifications(page, 30);

    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await page
        .getByRole('button', { name: 'Notifications, 30 actions available' })
        .click();

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
    await seedConsent(page);
    await seedNotifications(page, 1);
    await page.goto('/');

    const trigger = page.getByRole('button', {
      name: 'Notifications, 1 action available',
    });
    await trigger.click();
    await page.getByRole('button', { name: 'Close notifications' }).click();
    await expect(trigger).toHaveAccessibleName('Notifications, 1 action available');

    await trigger.click();
    await page.getByText('Visit the Lab').click();
    await expect(page).toHaveURL(/\/lab(?:$|[?#])/);
  });
});

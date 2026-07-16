/**
 * Upgrade prompt gating - each high-investment trigger fires the full
 * AccountUpgrade modal at most once per device (BM-004: prompt after
 * engagement, never nag).
 */

export const UPGRADE_PROMPTED_KEY = 'upgrade-prompted';
export const UPGRADE_BANNER_DISMISSED_KEY = 'upgrade-banner-dismissed';

export type UpgradePromptTrigger = 'first-unlock' | 'first-breed';

function getStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readPrompted(store: Storage): Record<string, boolean> {
  try {
    const raw = store.getItem(UPGRADE_PROMPTED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** True when this trigger has not fired before on this device. */
export function shouldShowUpgradePrompt(
  trigger: UpgradePromptTrigger,
  storage?: Storage
): boolean {
  const store = getStorage(storage);
  if (!store) return false;
  return !readPrompted(store)[trigger];
}

export function markUpgradePrompted(trigger: UpgradePromptTrigger, storage?: Storage): void {
  const store = getStorage(storage);
  if (!store) return;
  try {
    const prompted = readPrompted(store);
    prompted[trigger] = true;
    store.setItem(UPGRADE_PROMPTED_KEY, JSON.stringify(prompted));
  } catch {
    // best-effort
  }
}

export function isUpgradeBannerDismissed(storage?: Storage): boolean {
  const store = getStorage(storage);
  if (!store) return false;
  try {
    return store.getItem(UPGRADE_BANNER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissUpgradeBanner(storage?: Storage): void {
  const store = getStorage(storage);
  try {
    store?.setItem(UPGRADE_BANNER_DISMISSED_KEY, '1');
  } catch {
    // best-effort
  }
}

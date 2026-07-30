/**
 * Upgrade prompt gating for the current page lifecycle.
 *
 * A first unlock or first breed is progression. Persisting that fact in the
 * browser would create a client-side progress ledger, so these soft prompt
 * guards are intentionally memory-only. The server remains the authority for
 * the underlying unlock/breed; losing this UI state can only make an optional
 * account invitation available again after a full reload.
 */

export type UpgradePromptTrigger = 'first-unlock' | 'first-breed';

const promptedThisPage = new Set<UpgradePromptTrigger>();
let bannerDismissedThisPage = false;

/** True when this trigger has not fired in the current page lifecycle. */
export function shouldShowUpgradePrompt(trigger: UpgradePromptTrigger): boolean {
  return !promptedThisPage.has(trigger);
}

export function markUpgradePrompted(trigger: UpgradePromptTrigger): void {
  promptedThisPage.add(trigger);
}

export function isUpgradeBannerDismissed(): boolean {
  return bannerDismissedThisPage;
}

export function dismissUpgradeBanner(): void {
  bannerDismissedThisPage = true;
}

/** Reset lifecycle-only UI guards for an explicit lifecycle reset or isolated test. */
export function resetUpgradePromptMemory(): void {
  promptedThisPage.clear();
  bannerDismissedThisPage = false;
}

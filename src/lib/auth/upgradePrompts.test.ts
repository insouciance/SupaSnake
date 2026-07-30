/**
 * Upgrade prompt gating tests - each trigger fires once per page lifecycle
 */

import {
  shouldShowUpgradePrompt,
  markUpgradePrompted,
  isUpgradeBannerDismissed,
  dismissUpgradeBanner,
  resetUpgradePromptMemory,
} from './upgradePrompts';

describe('upgradePrompts', () => {
  beforeEach(() => {
    resetUpgradePromptMemory();
  });

  describe('shouldShowUpgradePrompt / markUpgradePrompted', () => {
    it('allows a trigger that has never fired', () => {
      expect(shouldShowUpgradePrompt('first-unlock')).toBe(true);
    });

    it('blocks a trigger after it fires once', () => {
      markUpgradePrompted('first-unlock');
      expect(shouldShowUpgradePrompt('first-unlock')).toBe(false);
    });

    it('tracks triggers independently', () => {
      markUpgradePrompted('first-unlock');
      expect(shouldShowUpgradePrompt('first-breed')).toBe(true);

      markUpgradePrompted('first-breed');
      expect(shouldShowUpgradePrompt('first-breed')).toBe(false);
      expect(shouldShowUpgradePrompt('first-unlock')).toBe(false);
    });

    it('resets only when a new page lifecycle begins', () => {
      markUpgradePrompted('first-unlock');
      resetUpgradePromptMemory();
      expect(shouldShowUpgradePrompt('first-unlock')).toBe(true);
    });
  });

  describe('banner dismissal', () => {
    it('is not dismissed by default', () => {
      expect(isUpgradeBannerDismissed()).toBe(false);
    });

    it('stays dismissed after dismissal', () => {
      dismissUpgradeBanner();
      expect(isUpgradeBannerDismissed()).toBe(true);
    });
  });
});

/**
 * Upgrade prompt gating tests - each trigger fires once per device
 */

import {
  shouldShowUpgradePrompt,
  markUpgradePrompted,
  isUpgradeBannerDismissed,
  dismissUpgradeBanner,
  UPGRADE_PROMPTED_KEY,
} from './upgradePrompts';

describe('upgradePrompts', () => {
  beforeEach(() => {
    window.localStorage.clear();
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

    it('recovers from corrupted storage', () => {
      window.localStorage.setItem(UPGRADE_PROMPTED_KEY, '{oops');
      expect(shouldShowUpgradePrompt('first-unlock')).toBe(true);

      markUpgradePrompted('first-unlock');
      expect(shouldShowUpgradePrompt('first-unlock')).toBe(false);
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

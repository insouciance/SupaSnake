/**
 * Last-user marker tests - identity continuity across lost sessions
 */

import {
  readLastUser,
  recordLastUser,
  clearLastUser,
  evaluateAnonymousSignInGate,
  markProgressLossNoticed,
  maskEmail,
  LAST_USER_KEY,
  PROGRESS_LOSS_NOTICE_KEY,
} from './lastUser';

describe('lastUser', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('maskEmail', () => {
    it('masks the local part, keeping two leading characters', () => {
      expect(maskEmail('player@example.com')).toBe('pl****@example.com');
    });

    it('handles short local parts', () => {
      expect(maskEmail('ab@x.io')).toBe('ab*@x.io');
    });

    it('returns null for missing or invalid emails', () => {
      expect(maskEmail(null)).toBeNull();
      expect(maskEmail(undefined)).toBeNull();
      expect(maskEmail('not-an-email')).toBeNull();
    });
  });

  describe('recordLastUser / readLastUser', () => {
    it('round-trips a registered user with a masked email hint', () => {
      recordLastUser({ id: 'user-1', is_anonymous: false, email: 'player@example.com' });

      const marker = readLastUser();
      expect(marker).not.toBeNull();
      expect(marker!.userId).toBe('user-1');
      expect(marker!.isAnonymous).toBe(false);
      expect(marker!.emailHint).toBe('pl****@example.com');
      expect(marker!.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('round-trips an anonymous user', () => {
      recordLastUser({ id: 'anon-1', is_anonymous: true });

      const marker = readLastUser();
      expect(marker!.isAnonymous).toBe(true);
      expect(marker!.emailHint).toBeNull();
    });

    it('treats a missing is_anonymous flag as a registered user', () => {
      recordLastUser({ id: 'user-2' });
      expect(readLastUser()!.isAnonymous).toBe(false);
    });

    it('returns null when nothing is stored', () => {
      expect(readLastUser()).toBeNull();
    });

    it('returns null for corrupted markers', () => {
      window.localStorage.setItem(LAST_USER_KEY, '{bad json');
      expect(readLastUser()).toBeNull();

      window.localStorage.setItem(LAST_USER_KEY, JSON.stringify({ userId: 42 }));
      expect(readLastUser()).toBeNull();
    });
  });

  describe('clearLastUser', () => {
    it('removes the marker and the loss-notice flag', () => {
      recordLastUser({ id: 'user-1', is_anonymous: true });
      markProgressLossNoticed();

      clearLastUser();

      expect(readLastUser()).toBeNull();
      expect(window.localStorage.getItem(PROGRESS_LOSS_NOTICE_KEY)).toBeNull();
    });
  });

  describe('evaluateAnonymousSignInGate', () => {
    it('proceeds silently when the device has no prior identity', () => {
      expect(evaluateAnonymousSignInGate(null)).toBe('proceed');
    });

    it('blocks with welcome-back when the prior user was registered', () => {
      recordLastUser({ id: 'user-1', is_anonymous: false, email: 'a@b.co' });
      expect(evaluateAnonymousSignInGate(readLastUser())).toBe('welcome-back');
    });

    it('warns about progress loss when the prior user was anonymous', () => {
      recordLastUser({ id: 'anon-1', is_anonymous: true });
      expect(evaluateAnonymousSignInGate(readLastUser())).toBe('warn-progress-loss');
    });

    it('warns only once - proceeds after the notice was acknowledged', () => {
      recordLastUser({ id: 'anon-1', is_anonymous: true });
      markProgressLossNoticed();
      expect(evaluateAnonymousSignInGate(readLastUser())).toBe('proceed');
    });
  });
});

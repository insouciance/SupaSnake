/**
 * Clan types (WP-1.02; Constitution §9.2, §12.2, Rule 8).
 *
 * The suite this replaces asserted local literals — `const validRoles =
 * ['owner', 'officer', 'member']; expect(validRoles).toContain('officer')` —
 * which passes whatever the module does. These assertions read the module.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as clanTypes from './types';
import {
  CLAN_LIMITS,
  isValidClanName,
  isValidClanTag,
  suggestClanTag,
} from './types';
import { isValidClanInviteCode, clanInviteUrl } from './config';

describe('Clan types', () => {
  describe('the caps (§9.2, §12.2)', () => {
    it('caps membership at 12 and imposes no floor', () => {
      // "Clan size: 1–12, soft-full at 6" [H]. The 50 that shipped and the
      // never-enforced minMembers:20 are both gone; migration 048 moves the
      // CHECK constraint so the cap is schema, not just route code.
      expect(CLAN_LIMITS.maxMembers).toBe(12);
      expect((CLAN_LIMITS as Record<string, unknown>).minMembers).toBeUndefined();
    });

    it('treats soft-full as presentation, never as a mechanic', () => {
      expect(CLAN_LIMITS.softFullMembers).toBe(6);
      expect(CLAN_LIMITS.softFullMembers).toBeLessThan(CLAN_LIMITS.maxMembers);
    });
  });

  describe('Rule 8 — nothing here grades or bills', () => {
    it('exposes no officer role', () => {
      const source = readFileSync(join(__dirname, 'types.ts'), 'utf8');
      // The word appears in the file only inside the comment explaining its
      // absence; the type alias itself must be exactly two members.
      expect(source).toMatch(/export type ClanRole = 'owner' \| 'member';/);
    });

    it('offers no clan bonus to claim', () => {
      const surface = clanTypes as Record<string, unknown>;
      expect(surface.CLAN_BONUS_CONFIG).toBeUndefined();
      expect(surface.canClaimClanBonus).toBeUndefined();
    });

    it('has no contribution field on a member', () => {
      const member: clanTypes.ClanMember = {
        playerId: 'p1',
        clanId: 'c1',
        role: 'member',
        joinedAt: new Date().toISOString(),
      };
      expect(Object.keys(member).sort()).toEqual([
        'clanId',
        'joinedAt',
        'playerId',
        'role',
      ]);
      expect((member as Record<string, unknown>).weeklyContribution).toBeUndefined();
      expect((member as Record<string, unknown>).totalContribution).toBeUndefined();
    });

    it('has no clan score — §12.2 caps public numbers at Score and Depth', () => {
      const clan: clanTypes.Clan = {
        id: 'c1',
        name: 'Elite Snakes',
        tag: 'ELIT',
        description: '',
        ownerId: 'u1',
        memberCount: 1,
        maxMembers: 12,
        createdAt: '',
        updatedAt: '',
      };
      expect((clan as Record<string, unknown>).weeklyScore).toBeUndefined();
      expect((clan as Record<string, unknown>).totalScore).toBeUndefined();
    });
  });

  describe('isValidClanName', () => {
    it('accepts ordinary names', () => {
      expect(isValidClanName('Elite Snakes')).toBe(true);
      expect(isValidClanName('ABC')).toBe(true);
      expect(isValidClanName("O'Hara Coil")).toBe(true);
      expect(isValidClanName('Fang-9')).toBe(true);
    });

    it('rejects lengths outside 3-20', () => {
      expect(isValidClanName('AB')).toBe(false);
      expect(isValidClanName('')).toBe(false);
      expect(isValidClanName('A'.repeat(21))).toBe(false);
    });

    it('rejects the moderation surface §9.2 refuses to open', () => {
      // Names are filtered and there are no free-text descriptions at launch.
      expect(isValidClanName('<script>x</script>')).toBe(false);
      expect(isValidClanName('go to evil.example')).toBe(false);
      expect(isValidClanName('  padded  ')).toBe(false);
      expect(isValidClanName('double  space')).toBe(false);
    });
  });

  describe('isValidClanTag', () => {
    it('accepts 2-6 uppercase alphanumerics', () => {
      expect(isValidClanTag('ELIT')).toBe(true);
      expect(isValidClanTag('AB')).toBe(true);
      expect(isValidClanTag('ABC123')).toBe(true);
    });

    it('rejects lowercase, wrong length and punctuation', () => {
      expect(isValidClanTag('elite')).toBe(false);
      expect(isValidClanTag('A')).toBe(false);
      expect(isValidClanTag('ABCDEFG')).toBe(false);
      expect(isValidClanTag('AB-C')).toBe(false);
    });
  });

  describe('suggestClanTag — founding is one tap plus a name', () => {
    it('derives initials from a multi-word name', () => {
      expect(suggestClanTag('Elite Snakes')).toBe('ES');
      expect(suggestClanTag('The Deep Coil Crew')).toBe('TDCC');
    });

    it('falls back to the first word when there are no initials to take', () => {
      expect(suggestClanTag('Vipers')).toBe('VIPERS');
      expect(suggestClanTag('Constrictors')).toBe('CONSTR');
    });

    it('always returns something a tag constraint accepts', () => {
      for (const name of ['A B', 'Vipers', 'Elite Snakes', '123']) {
        expect(isValidClanTag(suggestClanTag(name))).toBe(true);
      }
    });
  });

  describe('invite codes (§9.2, §11.3, Rule 14)', () => {
    it('accepts the eight-character unambiguous alphabet', () => {
      expect(isValidClanInviteCode('ABCDEFGH')).toBe(true);
      expect(isValidClanInviteCode('23456789')).toBe(true);
    });

    it('rejects the characters that get misread aloud', () => {
      // I, O, 0 and 1 are deliberately not in the alphabet: these codes
      // travel through Discord voice, not through a clipboard.
      expect(isValidClanInviteCode('ABCDEFGO')).toBe(false);
      expect(isValidClanInviteCode('ABCDEFG0')).toBe(false);
      expect(isValidClanInviteCode('ABCDEFGI')).toBe(false);
      expect(isValidClanInviteCode('ABCDEFG1')).toBe(false);
      // L stays in: with 1 removed there is nothing left for it to be
      // confused with, and dropping it too would cost a fifth of the alphabet.
      expect(isValidClanInviteCode('ABCDEFGL')).toBe(true);
    });

    it('rejects the wrong length and the wrong type', () => {
      expect(isValidClanInviteCode('ABCDEFG')).toBe(false);
      expect(isValidClanInviteCode('ABCDEFGHJ')).toBe(false);
      expect(isValidClanInviteCode('abcdefgh')).toBe(false);
      expect(isValidClanInviteCode(null)).toBe(false);
      expect(isValidClanInviteCode(12345678)).toBe(false);
    });

    it('has a URL — Rule 14', () => {
      expect(clanInviteUrl('ABCDEFGH')).toBe('/clan/join/ABCDEFGH');
      expect(clanInviteUrl('ABCDEFGH', 'https://supasnake.com')).toBe(
        'https://supasnake.com/clan/join/ABCDEFGH'
      );
    });
  });
});

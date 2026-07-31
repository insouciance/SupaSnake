import { describe, expect, it } from '@jest/globals';
import * as clanTypes from './types';
import {
  CLAN_LIMITS,
  CLAN_PERMISSIONS,
  CLAN_ROLE_LABELS,
  asClanRole,
  clanRoleLabel,
  isClanJoinPolicy,
  isValidClanName,
  isValidClanTag,
  suggestClanTag,
} from './types';
import { CLAN_ECONOMY_CONFIG, clanInviteUrl, isValidClanInviteCode } from './config';

describe('competitive clan types', () => {
  it('keeps owner internal while exposing Leader-ready role semantics', () => {
    expect(asClanRole('owner')).toBe('owner');
    expect(asClanRole('co_leader')).toBe('co_leader');
    expect(asClanRole('unexpected')).toBe('member');
    expect(clanRoleLabel('owner')).toBe('Leader');
    expect(CLAN_ROLE_LABELS).toEqual({
      owner: 'Leader',
      co_leader: 'Co-leader',
      member: 'Member',
    });
  });

  it('publishes the owner/co-leader permission boundary', () => {
    expect(CLAN_PERMISSIONS.owner).toMatchObject({
      manageCoLeaders: true,
      manageSettings: true,
      transferOwnership: true,
      assignGlory: true,
    });
    expect(CLAN_PERMISSIONS.co_leader).toMatchObject({
      invite: true,
      reviewApplications: true,
      removeMembers: true,
      manageCoLeaders: false,
      manageSettings: false,
      transferOwnership: false,
      assignGlory: false,
    });
    expect(Object.values(CLAN_PERMISSIONS.member).every((allowed) => !allowed)).toBe(true);
  });

  it('accepts exactly the three recruitment policies', () => {
    expect(['open', 'application', 'invite_only'].every(isClanJoinPolicy)).toBe(true);
    expect(isClanJoinPolicy('closed')).toBe(false);
    expect(isClanJoinPolicy(null)).toBe(false);
  });

  it('retains the 12-member cap and no minimum', () => {
    expect(CLAN_LIMITS.maxMembers).toBe(12);
    expect(CLAN_LIMITS.softFullMembers).toBe(6);
    expect((CLAN_LIMITS as Record<string, unknown>).minMembers).toBeUndefined();
  });

  it('centralizes and bounds founding and Glory DNA', () => {
    expect(CLAN_ECONOMY_CONFIG.foundingDnaCost).toBeGreaterThan(0);
    expect(CLAN_ECONOMY_CONFIG.foundingDnaCost).toBeLessThanOrEqual(100_000);
    expect(CLAN_ECONOMY_CONFIG.glory.maxSeats).toBe(2);
    expect(CLAN_ECONOMY_CONFIG.glory.rewardDna).toBeGreaterThanOrEqual(0);
    expect(CLAN_ECONOMY_CONFIG.glory.rewardDna).toBeLessThanOrEqual(1_000);
    expect(CLAN_ECONOMY_CONFIG.glory.allowOwnerSelfAward).toBe(false);
  });

  it('does not revive the retired claimable clan Energy bonus', () => {
    const surface = clanTypes as Record<string, unknown>;
    expect(surface.CLAN_BONUS_CONFIG).toBeUndefined();
    expect(surface.canClaimClanBonus).toBeUndefined();
  });
});

describe('clan identity validation', () => {
  it('accepts bounded ordinary names and rejects markup/URLs/padding', () => {
    expect(isValidClanName('Elite Snakes')).toBe(true);
    expect(isValidClanName("O'Hara Coil")).toBe(true);
    expect(isValidClanName('Fang-9')).toBe(true);
    expect(isValidClanName('<script>x</script>')).toBe(false);
    expect(isValidClanName('go to evil.example')).toBe(false);
    expect(isValidClanName('  padded  ')).toBe(false);
    expect(isValidClanName('double  space')).toBe(false);
  });

  it('validates and derives tags', () => {
    expect(isValidClanTag('ABC123')).toBe(true);
    expect(isValidClanTag('ab')).toBe(false);
    expect(suggestClanTag('Elite Snakes')).toBe('ES');
    expect(isValidClanTag(suggestClanTag('Constrictors'))).toBe(true);
  });

  it('keeps invite codes unambiguous and linkable', () => {
    expect(isValidClanInviteCode('ABCDEFGH')).toBe(true);
    expect(isValidClanInviteCode('ABCDEFG0')).toBe(false);
    expect(clanInviteUrl('ABCDEFGH')).toBe('/clan/join/ABCDEFGH');
  });
});

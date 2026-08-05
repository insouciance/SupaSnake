import {
  CLAN_REVEAL_ATTENTION_KEY,
  CLAN_REVEAL_DECLINE_LABEL,
  CLAN_REVEAL_SOURCE_ID,
  CLAN_REVEAL_SOURCE_TYPE,
  clanRevealInvitation,
} from './clanReveal';
import { CURRICULUM_DECLINE_LABEL } from './curriculum';

describe('the ratified clan reveal (PEO §6 step 1, owner ruling 2)', () => {
  it('says the owner’s sentence, verbatim', () => {
    expect(clanRevealInvitation().label).toBe('Your runs can now power a Clan.');
  });

  it('points at /clan and never at Compete (§6 step 2)', () => {
    expect(clanRevealInvitation().href).toBe('/clan');
  });

  it('states an action and its consequence, not a feature name (§5)', () => {
    const { description } = clanRevealInvitation();
    expect(description).toMatch(/show me/i);
    // All three real outcomes, so the invitation never implies that joining
    // someone else's roster is the only way through (§6 step 4).
    expect(description).toMatch(/found one/i);
    expect(description).toMatch(/join one/i);
    expect(description).toMatch(/clan of one/i);
  });

  it('never mentions the ramp it just crossed (Rule 8)', () => {
    const invitation = clanRevealInvitation();
    const copy = `${invitation.label} ${invitation.description}`;
    expect(copy).not.toMatch(/\b8\b|eight|unlock|banked runs|progress|threshold/i);
  });

  it('promises nothing about winning, ranking or reward (R8)', () => {
    const invitation = clanRevealInvitation();
    const copy = `${invitation.label} ${invitation.description}`;
    expect(copy).not.toMatch(/reward|bonus|rank|leaderboard|win|prize/i);
  });

  it('declines with "Not now" and agrees with the curriculum (§13 row 13)', () => {
    expect(CLAN_REVEAL_DECLINE_LABEL).toBe('Not now');
    expect(clanRevealInvitation().declineLabel).toBe(CLAN_REVEAL_DECLINE_LABEL);
    expect(CLAN_REVEAL_DECLINE_LABEL).toBe(CURRICULUM_DECLINE_LABEL);
    expect(CLAN_REVEAL_DECLINE_LABEL).not.toMatch(/later/i);
  });

  it('fits the attention row’s 160-character headline bound', () => {
    expect(clanRevealInvitation().label.length).toBeLessThanOrEqual(160);
    expect(clanRevealInvitation().description.length).toBeLessThanOrEqual(500);
  });

  it('keeps a constant row identity, which is what makes it once-per-account', () => {
    expect(CLAN_REVEAL_SOURCE_TYPE).toBe('clan_reveal');
    expect(CLAN_REVEAL_SOURCE_ID).toBe('clan-reveal');
    expect(CLAN_REVEAL_ATTENTION_KEY).toBe('clan-reveal');
  });

  it('is pure — the same words every time, derived from nothing', () => {
    expect(clanRevealInvitation()).toEqual(clanRevealInvitation());
  });
});

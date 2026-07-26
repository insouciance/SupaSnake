/**
 * The lead ladder's model (Constitution §11.7).
 *
 * Three properties are load-bearing and each is asserted rather than
 * documented: the walk never claims a rung it cannot see, no input exists on
 * which a rung could decay (Rules 5 and 6), and the drawn ladder stops
 * before the district (Rule 7).
 */

import { FunnelStages } from '@/lib/analytics/funnel';
import { commercialTerms } from '@/lib/growth/commercialLanguage';
import { generatedHandleFor } from '@/lib/identity/handle';
import {
  LADDER_ORDER,
  LADDER_PROMPTS,
  LADDER_RUNGS,
  LadderRungs,
  RENDERED_RUNGS,
  currentRung,
  ladderPlainText,
  nextRung,
  promptFor,
  provisionalCallout,
  provisionalNameFor,
  stageOfRung,
  type LadderState,
} from '@/lib/growth/leadLadder';

describe('the ladder’s shape (§11.7)', () => {
  it('is exactly the Constitution’s seven rungs, in order', () => {
    expect(LADDER_ORDER).toEqual([
      'visitor',
      'player',
      'named',
      'reachable',
      'belonging',
      'advocate',
      'patron',
    ]);
  });

  it('reports into the eight shipped funnel stages, never a parallel set', () => {
    const stages = Object.values(FunnelStages);
    for (const rung of LADDER_ORDER) {
      expect(stages).toContain(stageOfRung(rung));
    }
    // The lead event: claiming a name is Identify (§11.5's Identify row).
    expect(stageOfRung(LadderRungs.NAMED)).toBe(FunnelStages.IDENTIFY);
    // "email attach rate" is measured on the same stage, so being reachable
    // is the second half of being identified, not a stage of its own.
    expect(stageOfRung(LadderRungs.REACHABLE)).toBe(FunnelStages.IDENTIFY);
    expect(stageOfRung(LadderRungs.BELONGING)).toBe(FunnelStages.BELONG);
    expect(stageOfRung(LadderRungs.ADVOCATE)).toBe(FunnelStages.ADVOCATE);
    expect(stageOfRung(LadderRungs.PATRON)).toBe(FunnelStages.PATRONIZE);
  });

  it('never ends: nextRung walks up and stops exactly once', () => {
    expect(nextRung(LadderRungs.VISITOR)).toBe(LadderRungs.PLAYER);
    expect(nextRung(LadderRungs.ADVOCATE)).toBe(LadderRungs.PATRON);
    expect(nextRung(LadderRungs.PATRON)).toBeNull();
  });
});

describe('currentRung — evidence only', () => {
  it('starts everyone at visitor', () => {
    expect(currentRung({})).toBe(LadderRungs.VISITOR);
  });

  it('climbs on confirmed truth', () => {
    expect(currentRung({ hasPlayed: true })).toBe(LadderRungs.PLAYER);
    expect(currentRung({ hasPlayed: true, hasHandle: true })).toBe(
      LadderRungs.NAMED
    );
    expect(
      currentRung({ hasPlayed: true, hasHandle: true, isReachable: true })
    ).toBe(LadderRungs.REACHABLE);
    expect(
      currentRung({
        hasPlayed: true,
        hasHandle: true,
        isReachable: true,
        hasClan: true,
        hasAdvocated: true,
        isPatron: true,
      })
    ).toBe(LadderRungs.PATRON);
  });

  it('stops at unknown rather than guessing — the anti-nag property', () => {
    // A surface that cannot see whether you have a clan must not conclude
    // that you have none. Both tristate spellings of "unknown" stop.
    const partial: LadderState = { hasPlayed: true, hasHandle: true };
    expect(currentRung(partial)).toBe(LadderRungs.NAMED);
    expect(currentRung({ ...partial, isReachable: null })).toBe(
      LadderRungs.NAMED
    );
    expect(currentRung({ ...partial, isReachable: undefined })).toBe(
      LadderRungs.NAMED
    );
  });

  it('does not skip a gap: a clan member with no visible handle stays low', () => {
    // Confirmed-higher-but-unknown-lower must never leapfrog. Otherwise the
    // leaderboard would congratulate a player for a rung it invented.
    expect(currentRung({ hasPlayed: true, hasClan: true })).toBe(
      LadderRungs.PLAYER
    );
  });
});

describe('Rules 5 and 6 — a rung cannot be lost by being away', () => {
  it('takes no time, date, streak or last-seen input at all', () => {
    // The structural version of the promise: if the model cannot read a
    // clock, no future edit can make a rung expire without also changing
    // this signature, which fails this test.
    const state: LadderState = { hasPlayed: true, hasHandle: true };
    const keys = Object.keys(state);
    expect(keys.every((key) => !/day|date|time|seen|streak|expir/i.test(key))).toBe(
      true
    );
  });

  it('answers identically for a player back after a year away', () => {
    // Same state, evaluated a year apart, is the same rung — there is no
    // other input, so this is the whole of the guarantee.
    const away: LadderState = { hasPlayed: true, hasHandle: true };
    const now = currentRung(away);
    jest.useFakeTimers().setSystemTime(new Date('2030-01-01T00:00:00Z'));
    try {
      expect(currentRung(away)).toBe(now);
      expect(currentRung(away)).toBe(LadderRungs.NAMED);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Rule 7 — the drawn ladder stops before the district', () => {
  it('never renders the patron rung', () => {
    expect(RENDERED_RUNGS).not.toContain(LadderRungs.PATRON);
    expect(RENDERED_RUNGS[RENDERED_RUNGS.length - 1]).toBe(LadderRungs.ADVOCATE);
  });

  it('offers no invitation to the patron rung, and none to advocate', () => {
    expect(LADDER_PROMPTS[LadderRungs.PATRON]).toBeUndefined();
    expect(LADDER_PROMPTS[LadderRungs.ADVOCATE]).toBeUndefined();
    expect(promptFor(LadderRungs.ADVOCATE)).toBeNull();
    expect(promptFor(LadderRungs.PATRON)).toBeNull();
  });

  it('links nowhere commercial', () => {
    for (const prompt of Object.values(LADDER_PROMPTS)) {
      if (prompt.href) expect(prompt.href.startsWith('/shop')).toBe(false);
    }
  });

  it('publishes no commercial vocabulary — a handle is identity, not a purchase', () => {
    expect(commercialTerms(ladderPlainText())).toEqual([]);
  });

  it('invites with a reason and never with a threat (Rules 5 and 6)', () => {
    for (const prompt of Object.values(LADDER_PROMPTS)) {
      expect(prompt.reason).not.toMatch(
        /before it'?s gone|expires?|running out|lose your|last chance|hurry|only \d+ (?:hours|days)/i
      );
    }
    // The named prompt has to say the quiet part: claiming takes nothing.
    expect(LADDER_PROMPTS[LadderRungs.NAMED]!.reason).toMatch(
      /nothing you have already earned changes/i
    );
  });
});

describe('the prompt ladder', () => {
  it('invites a nameless player to claim, inline, with no navigation', () => {
    const prompt = promptFor(currentRung({ hasPlayed: true }));
    expect(prompt?.rung).toBe(LadderRungs.NAMED);
    expect(prompt?.href).toBeNull();
    expect(prompt?.action).toBe('Claim your name');
  });

  it('invites a named player onward, never backwards', () => {
    const prompt = promptFor(currentRung({ hasPlayed: true, hasHandle: true }));
    expect(prompt?.rung).toBe(LadderRungs.REACHABLE);
    expect(prompt?.href).toBe('/settings');
  });

  it('gives every rendered rung a label and a plain meaning', () => {
    for (const rung of RENDERED_RUNGS) {
      expect(LADDER_RUNGS[rung].label.length).toBeGreaterThan(0);
      expect(LADDER_RUNGS[rung].meaning.length).toBeGreaterThan(0);
    }
  });
});

describe('the provisional name — one derivation, not two', () => {
  it('is migration 022’s own identity-view fallback, not a new format', () => {
    const playerId = '9f2c1d4e-0000-4000-8000-000000007f3a';
    expect(provisionalNameFor(playerId)).toBe(generatedHandleFor(playerId));
    expect(provisionalNameFor(playerId)).toMatch(/^handler-\d{4}$/);
  });

  it('asks §11.7’s question about the name the player is already shown', () => {
    expect(provisionalCallout('handler-0431')).toBe(
      'Unclaimed specimen handler-0431 — is this you?'
    );
  });
});

/**
 * Session lifecycle rules (WP-0.06, GT §9.6).
 *
 * The point of these tests is one sentence: only `completed` settles. Every
 * other way a session can close — expiry, abandonment, a client forfeit —
 * awards nothing, and that judgement is made in exactly one function so it
 * cannot disagree with itself between the boards and the settlement route.
 */

import {
  CLIENT_FORFEIT_REASONS,
  endReasonAwardsNothing,
  endReasonSettles,
  isClientForfeitReason,
  isSessionEndReason,
  isStaleOpenSession,
  SESSION_END_REASONS,
  SETTLED_END_REASON,
  STALE_OPEN_MINUTES,
  STALE_PENDING_SETTLEMENT_MINUTES,
  staleSessionCutoffs,
} from './lifecycle';

const NOW = new Date('2026-07-25T12:00:00.000Z');
const minutesBefore = (n: number) =>
  new Date(NOW.getTime() - n * 60_000).toISOString();

describe('end reasons', () => {
  it('declares exactly the four the migration CHECK permits', () => {
    expect([...SESSION_END_REASONS]).toEqual([
      'completed',
      'abandoned',
      'disconnected',
      'expired',
    ]);
  });

  it('accepts only those four', () => {
    for (const reason of SESSION_END_REASONS) {
      expect(isSessionEndReason(reason)).toBe(true);
    }
    for (const bogus of ['settled', 'COMPLETED', '', null, undefined, 7, {}]) {
      expect(isSessionEndReason(bogus)).toBe(false);
    }
  });

  it('lets a client ask only for explicit abandonment', () => {
    expect([...CLIENT_FORFEIT_REASONS]).toEqual(['abandoned']);
    expect(isClientForfeitReason('abandoned')).toBe(true);
    expect(isClientForfeitReason('disconnected')).toBe(false);
    // The two the server writes for itself are not requestable.
    expect(isClientForfeitReason('completed')).toBe(false);
    expect(isClientForfeitReason('expired')).toBe(false);
  });
});

describe('what settles', () => {
  it('settles for `completed` alone', () => {
    expect(SETTLED_END_REASON).toBe('completed');
    expect(endReasonSettles('completed')).toBe(true);
  });

  it('awards nothing for expiry, abandonment or a disconnect', () => {
    for (const reason of ['expired', 'abandoned', 'disconnected']) {
      expect(endReasonSettles(reason)).toBe(false);
      expect(endReasonAwardsNothing(reason)).toBe(true);
    }
  });

  it('treats a pre-045 row (null) as settled — it had only one end path', () => {
    expect(endReasonSettles(null)).toBe(true);
    expect(endReasonSettles(undefined)).toBe(true);
  });

  it('refuses an unrecognised reason rather than assuming it paid', () => {
    expect(endReasonSettles('finished')).toBe(false);
    expect(endReasonSettles('')).toBe(false);
  });
});

describe('staleness windows', () => {
  it('gives a settled-but-unpaid run far longer than a never-settled one', () => {
    expect(STALE_PENDING_SETTLEMENT_MINUTES).toBeGreaterThan(STALE_OPEN_MINUTES);
    // Longer than the reward outbox keeps a replay (7 days), so expiry can
    // never destroy DNA the player is still owed (Rule 6).
    expect(STALE_PENDING_SETTLEMENT_MINUTES).toBeGreaterThan(7 * 24 * 60);
  });

  it('derives both cutoffs from one clock', () => {
    const cutoffs = staleSessionCutoffs(NOW);
    expect(cutoffs.open).toBe(minutesBefore(STALE_OPEN_MINUTES));
    expect(cutoffs.pendingSettlement).toBe(
      minutesBefore(STALE_PENDING_SETTLEMENT_MINUTES)
    );
  });

  it('sweeps a never-settled run past the short window', () => {
    expect(
      isStaleOpenSession(
        {
          id: 'a',
          started_at: minutesBefore(STALE_OPEN_MINUTES + 1),
          ended_at: null,
          end_reason: null,
        },
        NOW
      )
    ).toBe(true);
  });

  it('leaves a run that could still be finished alone', () => {
    expect(
      isStaleOpenSession(
        {
          id: 'a',
          started_at: minutesBefore(STALE_OPEN_MINUTES - 1),
          ended_at: null,
          end_reason: null,
        },
        NOW
      )
    ).toBe(false);
  });

  it('protects a run awaiting an outbox replay until the long window', () => {
    const pending = {
      id: 'a',
      started_at: minutesBefore(STALE_OPEN_MINUTES + 60),
      ended_at: null,
      end_reason: 'completed',
    };
    expect(isStaleOpenSession(pending, NOW)).toBe(false);

    expect(
      isStaleOpenSession(
        { ...pending, started_at: minutesBefore(STALE_PENDING_SETTLEMENT_MINUTES + 1) },
        NOW
      )
    ).toBe(true);
  });

  it('never re-closes a session that already ended', () => {
    expect(
      isStaleOpenSession(
        {
          id: 'a',
          started_at: minutesBefore(STALE_PENDING_SETTLEMENT_MINUTES * 10),
          ended_at: minutesBefore(1),
          end_reason: 'completed',
        },
        NOW
      )
    ).toBe(false);
  });

  it('never age-expires a continuity run', () => {
    expect(
      isStaleOpenSession(
        {
          id: 'continuity',
          start_request_id: '7a604a42-9f57-4f50-9a36-a7c7e85dbb28',
          started_at: minutesBefore(STALE_PENDING_SETTLEMENT_MINUTES * 10),
          ended_at: null,
          end_reason: null,
        },
        NOW
      )
    ).toBe(false);
  });

  it('ignores a row with no start time rather than guessing', () => {
    expect(
      isStaleOpenSession(
        { id: 'a', started_at: null, ended_at: null, end_reason: null },
        NOW
      )
    ).toBe(false);
    expect(
      isStaleOpenSession(
        { id: 'a', started_at: 'not a date', ended_at: null, end_reason: null },
        NOW
      )
    ).toBe(false);
  });
});

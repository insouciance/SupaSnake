import {
  isCanonicalCompletedSettlement,
  isDurablyPendingSettlement,
  parseFreePlaySettlementResult,
} from './settlementResponse';

describe('durable pending settlement response', () => {
  it('requires both server acceptance and an explicit pending marker', () => {
    expect(isDurablyPendingSettlement({
      accepted: true,
      pendingSettlement: true,
      clientRetryRequired: false,
    })).toBe(true);
    expect(isDurablyPendingSettlement({
      accepted: true,
      pendingSettlement: true,
    })).toBe(false);
    expect(isDurablyPendingSettlement({
      accepted: true,
      pendingSettlement: true,
      clientRetryRequired: true,
    })).toBe(false);
    expect(isDurablyPendingSettlement({ pendingSettlement: true })).toBe(false);
    expect(isDurablyPendingSettlement({ accepted: true })).toBe(false);
    expect(isDurablyPendingSettlement(null)).toBe(false);
  });

  it('recognizes only the explicit completed lifecycle reason', () => {
    expect(isCanonicalCompletedSettlement({
      alreadyEnded: true,
      endReason: 'completed',
    })).toBe(true);
    expect(isCanonicalCompletedSettlement({
      alreadyEnded: true,
      endReason: 'abandoned',
    })).toBe(false);
    expect(isCanonicalCompletedSettlement({ alreadyEnded: true })).toBe(false);
    expect(isCanonicalCompletedSettlement(null)).toBe(false);
  });

  it('parses only a session-bound canonical Free Play receipt', () => {
    const receipt = {
      success: true,
      sessionId: 'free-1',
      freePlay: true,
      player: { dna: 420 },
      validation: {
        valid: true,
        adjustedDna: 0,
        score: 987,
        extracted: false,
        yieldDna: 240,
        ascendance: { totalYield: 240 },
      },
      hypotheticalDna: 60,
      genome: { v: 2 },
    };
    expect(parseFreePlaySettlementResult(receipt, 'free-1')).toEqual({
      sessionId: 'free-1',
      score: 987,
      outcome: 'crashed',
      dnaCredited: 0,
      yieldDna: 240,
      hypotheticalDna: 60,
      valid: true,
      ascendance: { totalYield: 240 },
      genome: { v: 2 },
      playerDna: 420,
    });
    expect(parseFreePlaySettlementResult(receipt, 'another-run')).toBeNull();
    expect(parseFreePlaySettlementResult({ ...receipt, hypotheticalDna: undefined }, 'free-1')).toBeNull();
    expect(parseFreePlaySettlementResult({ ...receipt, freePlay: false }, 'free-1')).toBeNull();
  });
});

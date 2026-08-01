import {
  isCanonicalCompletedSettlement,
  isDurablyPendingSettlement,
} from './settlementResponse';

describe('durable pending settlement response', () => {
  it('requires both server acceptance and an explicit pending marker', () => {
    expect(isDurablyPendingSettlement({
      accepted: true,
      pendingSettlement: true,
    })).toBe(true);
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
});

import {
  formatAmount,
  formatNonNegativeAmount,
  formatSignedAmount,
} from './amount';

describe('amount display formatting', () => {
  it('never renders a decimal place, however fractional the stored value is', () => {
    expect(formatAmount(42.75)).toBe('43');
    expect(formatAmount(42.4999)).toBe('42');
    expect(formatAmount(0.4)).toBe('0');
    expect(formatSignedAmount(0.75)).toBe('+1');
    expect(formatNonNegativeAmount(8.5)).toBe('9');
    for (const value of [1.05, 999.999, 12_345.6789, -3.25]) {
      expect(formatAmount(value)).not.toMatch(/\.\d/);
      expect(formatAmount(value)).toBe(
        Math.round(value).toLocaleString('en-US')
      );
    }
  });

  it('groups thousands in en-US so two grouping styles never share a screen', () => {
    expect(formatAmount(12_840)).toBe('12,840');
    expect(formatAmount(1_234_567.4)).toBe('1,234,567');
    expect(formatNonNegativeAmount(12_840.6)).toBe('12,841');
    expect(formatSignedAmount(12_840)).toBe('+12,840');
  });

  it('keeps sign semantics: signed gains lead with +, losses keep their minus', () => {
    expect(formatSignedAmount(0)).toBe('0');
    expect(formatSignedAmount(-250)).toBe('-250');
    expect(formatAmount(-250)).toBe('-250');
  });

  it('clamps only where a negative would misread as a debt', () => {
    expect(formatNonNegativeAmount(-250)).toBe('0');
    expect(formatNonNegativeAmount(-0.4)).toBe('0');
    expect(formatAmount(-0.4)).toBe('0');
    expect(formatSignedAmount(-0.4)).toBe('0');
  });

  it('renders a non-finite amount as zero rather than NaN in a tray', () => {
    expect(formatAmount(Number.NaN)).toBe('0');
    expect(formatAmount(Number.POSITIVE_INFINITY)).toBe('0');
    expect(formatNonNegativeAmount(Number.NEGATIVE_INFINITY)).toBe('0');
    expect(formatSignedAmount(Number.NaN)).toBe('0');
  });
});

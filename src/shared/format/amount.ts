/**
 * Display-only integer rendering for AMOUNT values.
 *
 * An AMOUNT is a counted quantity the player owns, earns, spends, or is ranked
 * by: Score, DNA, Yield, Depth, Mastery XP, costs, pools, thresholds. Amounts
 * are never shown with decimal places — a fractional readout overflows its tray
 * and reads as a defect. The stored and computed values keep their full
 * precision; only the readout rounds.
 *
 * These helpers are NOT for:
 * - FACTORS — `×2.2`, `×1.25`, harvest and Ascendance multipliers keep their
 *   canonical form, because the decimal IS the value.
 * - Percentages, ratios, rates, and statistical means.
 * - Durations and timestamps.
 * - Prices, which must show their cents.
 *
 * `en-US` is pinned deliberately: the share artifacts, settlement posts, and
 * cockpit telemetry already pin it, and two grouping styles on one screen is
 * itself a rendering bug.
 */

function roundedAmount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // `|| 0` also normalizes -0, which Intl would otherwise render as "-0".
  return Math.round(value) || 0;
}

/** Integer, grouped readout for an amount. */
export function formatAmount(value: number): string {
  return roundedAmount(value).toLocaleString('en-US');
}

/**
 * `formatAmount`, clamped at zero. Use for readouts where a transient negative
 * would misread as a debt the player does not owe — live run telemetry and
 * projections in particular.
 */
export function formatNonNegativeAmount(value: number): string {
  return Math.max(0, roundedAmount(value)).toLocaleString('en-US');
}

/** `formatAmount` with an explicit `+` on gains, for deltas. */
export function formatSignedAmount(value: number): string {
  const rounded = roundedAmount(value);
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('en-US')}`;
}

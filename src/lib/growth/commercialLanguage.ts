/**
 * Rule 7, made structural (Constitution §4, §11.6, §7.6).
 *
 * "No notification, email or badge is ever commercial." That is a property a
 * reviewer can forget and a copy edit can quietly break, so it is expressed
 * here as a function instead of a promise: every string that leaves SupaSnake
 * through a push channel — the auto-composed settlement post, the weekly
 * settlement email, subject line, HTML body and plain-text body alike — is
 * swept for commercial vocabulary before it is sent, and a hit refuses the
 * send rather than logging a warning.
 *
 * WHY A VOCABULARY AND NOT A REVIEW
 *
 *   The failure mode Rule 7 guards against is not a deliberate advert. It is
 *   the third edit of a friendly email, eighteen months from now, that adds
 *   "and the Founder's Bundle is 20% off this week" because the week was
 *   quiet. A word list catches that edit in CI on the day it is written.
 *
 * THE ONE DELIBERATE EXEMPTION
 *
 *   "unsubscribe" contains "subscribe", and every message on this path is
 *   REQUIRED to carry it (RFC 8058 plus the §11.6 Dispatch contract). The
 *   subscribe pattern is written with a negative lookbehind so the required
 *   word is never mistaken for the forbidden one. Nothing else is exempt.
 *
 * This module deliberately holds no product knowledge and imports nothing. It
 * is a lint over English, usable by any surface, and it is the same function
 * the tests assert with — so the test and the runtime guard cannot disagree.
 */

/**
 * Each entry is a named rule so a failure says WHICH rule tripped and on what
 * word, rather than "regex 14 matched".
 */
export interface CommercialTerm {
  /** What the rule is about, for the failure message. */
  label: string;
  pattern: RegExp;
}

/**
 * The forbidden vocabulary: price, offer, product, badge and upsell.
 *
 * Word-boundary anchored throughout, so `payload` is not a payment, `deepest`
 * is not a deal, and `bestWeek` is not a bundle. Case-insensitive.
 */
export const COMMERCIAL_TERMS: readonly CommercialTerm[] = [
  { label: 'currency symbol', pattern: /[$€£¥]\s?\d|\d\s?(?:USD|EUR|GBP)\b/i },
  {
    label: 'price',
    pattern: /\b(?:price|prices|priced|pricing|cost|costs|costing|fee|fees|worth\s+\$)\b/i,
  },
  {
    label: 'purchase',
    pattern:
      /\b(?:buy|buys|buying|purchase|purchases|purchasing|checkout|check\s?out\s+now|cart|order\s+now|pay|pays|paying|payment|payments)\b/i,
  },
  {
    label: 'discount',
    pattern:
      /\b(?:discount|discounts|discounted|sale|sales|coupon|coupons|promo|promotion|promotional|voucher|%\s?off|off\s+today)\b/i,
  },
  {
    label: 'offer',
    pattern:
      /\b(?:offer|offers|offering|deal|deals|bundle|bundles|pack|packs|bonus|bonuses|reward\s+pack|free\s+gift|giveaway)\b/i,
  },
  {
    label: 'product',
    pattern:
      /\b(?:shop|store|storefront|catalog|catalogue|product|products|merch|merchandise|sku|stock|in\s+stock)\b/i,
  },
  {
    // "unsubscribe" is required on every message and must never trip this.
    label: 'subscription',
    pattern:
      /(?<!un)\b(?:subscribe|subscribes|subscribing|subscription|subscriptions|membership|renew|renewal|billing|billed|invoice)\b/i,
  },
  {
    label: 'tier or badge',
    pattern:
      /\b(?:premium|pro\s+plan|vip|elite\s+tier|paid\s+tier|upgrade|upgrades|upgrading|unlock\s+now|badge|badges)\b/i,
  },
  {
    label: 'upsell urgency',
    pattern:
      /\b(?:limited\s+time|last\s+chance|act\s+now|don'?t\s+miss|hurry|expires\s+soon|only\s+\d+\s+left|while\s+supplies\s+last)\b/i,
  },
  {
    label: 'currency purchase',
    pattern:
      /\b(?:gem|gems|coin\s+pack|starter\s+pack|top\s?up|top\s+up\s+your|refill\s+your|buy\s+dna)\b/i,
  },
];

/**
 * Every commercial rule the text trips, as `"label: matched text"`.
 * Empty means the text is Rule 7 clean.
 */
export function commercialTerms(text: string): string[] {
  const hits: string[] = [];
  for (const term of COMMERCIAL_TERMS) {
    const match = term.pattern.exec(text);
    if (match) hits.push(`${term.label}: ${match[0]}`);
  }
  return hits;
}

/** Rule 7 as a boolean. The only question a sender asks about its own copy. */
export function isCommercialFree(...parts: (string | null | undefined)[]): boolean {
  return commercialTerms(parts.filter(Boolean).join('\n')).length === 0;
}

/**
 * Sweep a whole message. Returns the hits across every part, so a subject line
 * that sells something is caught even when the body does not.
 */
export function sweepMessage(parts: Record<string, string>): string[] {
  const hits: string[] = [];
  for (const [name, text] of Object.entries(parts)) {
    for (const hit of commercialTerms(text)) hits.push(`${name} — ${hit}`);
  }
  return hits;
}

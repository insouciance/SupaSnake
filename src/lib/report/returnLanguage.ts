/**
 * Rule 5, made structural (Constitution §4, §7.5).
 *
 * §7.5's binding tone rule: "the Report may make a player miss the world; it
 * may never make them owe it." That is a property a reviewer can forget and a
 * copy edit can quietly break — exactly the shape of problem
 * `commercialLanguage` already solved for Rule 7 — so it is expressed here as
 * a function instead of a promise. Every string the World Report composes is
 * swept before it can reach a returning player, and a hit refuses the report
 * rather than logging a warning.
 *
 * WHY A VOCABULARY AND NOT A REVIEW
 *
 *   The failure mode is not a deliberately cruel screen. It is the fourth
 *   edit, two years from now, that adds "you're 6 weeks behind the pack —
 *   catch up" because retention dipped. A word list catches that edit in CI on
 *   the day it is written, and it catches it in the composer at runtime on the
 *   day it ships.
 *
 * THE FOUR FAMILIES
 *
 *   LOSS      — nothing owned was taken, so no word may say it was (Rule 6).
 *   EXPIRY    — nothing owned decays, lapses or runs out (Rule 5, Rule 6).
 *   BACKLOG   — there is no queue, no arrears and no ladder back (§7.5).
 *   DEBT      — nothing is owed, nothing is a penalty, nothing is a failure.
 *
 *   Two more, which are §12.2 rather than §7.5, are enforced on the same pass
 *   because the World Report is precisely the surface tempted to break them:
 *
 *   CLAIM     — "not a new claim": the report collects, grants and redeems
 *               nothing, so no verb of collection may appear in it.
 *   CURRENCY  — "not a new currency": no balance is reported on return, so no
 *               currency noun may appear in it either.
 *
 * WHAT IS *NOT* SWEPT, AND WHY
 *
 *   This is a lint over the copy THIS PRODUCT AUTHORS. A clan named "LOST
 *   BOYS" is a player's own name for their own clan, and refusing to render a
 *   returning player's report because of it would be an absurdity — worse, a
 *   Rule 8 grade delivered by censorship. Likewise the shipped anomaly effect
 *   strings, which name DNA because the engine pays DNA. Callers therefore
 *   pass foreign strings to `redact` before sweeping; see
 *   `composeWorldReport`, which is the only caller and redacts both.
 *
 * This module holds no product knowledge and imports nothing. It is a lint
 * over English, and it is the same function the tests assert with — so the
 * test and the runtime guard cannot disagree.
 */

/** A named rule, so a failure says WHICH rule tripped and on what word. */
export interface ReturnTerm {
  /** What the rule is about, for the failure message. */
  label: string;
  pattern: RegExp;
}

/**
 * The forbidden vocabulary. Word-boundary anchored throughout, case
 * insensitive. Every entry is a word the World Report has no legitimate use
 * for: a readback of history that already happened never needs to say that
 * anything went away.
 */
export const RETURN_TERMS: readonly ReturnTerm[] = [
  {
    label: 'loss',
    pattern:
      /\b(?:lost|lose|loses|losing|loss|losses|forfeit|forfeits|forfeited|forfeiting|confiscate|confiscated|confiscation|stripped|revoked|taken\s+from\s+you|wiped)\b/i,
  },
  {
    label: 'expiry',
    pattern:
      /\b(?:expire|expires|expired|expiring|expiry|decay|decays|decayed|decaying|lapse|lapses|lapsed|elapsed\s+away|ran\s+out|running\s+out|no\s+longer\s+available|last\s+chance|too\s+late)\b/i,
  },
  {
    label: 'backlog',
    pattern:
      /\b(?:catch\s?up|catching\s+up|caught\s+up|backlog|arrears|behind|make\s+up\s+for|made\s+up\s+for|fell\s+behind|falling\s+behind|to\s+make\s+up)\b/i,
  },
  {
    label: 'debt',
    pattern:
      /\b(?:debt|debts|owe|owes|owed|owing|penalty|penalties|penalise|penalised|penalize|penalized|punish|punishes|punished|punishment|should\s+have|failed\s+to|failure|missed|missing\s+out)\b/i,
  },
  {
    // §12.2: the World Report is not a new claim.
    label: 'claim',
    pattern:
      /\b(?:claim|claims|claimed|claiming|collect|collects|collected|collecting|redeem|redeems|redeemed|redeeming|unclaimed|available\s+to\s+take)\b/i,
  },
  {
    // §12.2: the World Report is not a new currency, and reports no balance.
    label: 'currency',
    pattern:
      /\b(?:DNA|credit|credits|coin|coins|gem|gems|token|tokens|balance|balances|wallet|energy|charge|charges|XP)\b/i,
  },
];

/**
 * Replace foreign strings — clan names, shipped engine copy — with a neutral
 * token, so the sweep reads only the sentences this product wrote.
 *
 * Longest-first, so a clan named "FANG" inside "HOLLOW FANG" cannot leave a
 * fragment behind. Empty and whitespace-only entries are ignored: replacing
 * the empty string would rewrite the whole text.
 */
export function redact(text: string, foreign: readonly string[]): string {
  const terms = Array.from(new Set(foreign.filter((value) => value.trim().length > 0)))
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const term of terms) out = out.split(term).join('«quoted»');
  return out;
}

/**
 * Every rule the text trips, as `"label: matched text"`. Empty means the text
 * is Rule 5 clean.
 */
export function returnDebtTerms(text: string): string[] {
  const hits: string[] = [];
  for (const term of RETURN_TERMS) {
    const match = term.pattern.exec(text);
    if (match) hits.push(`${term.label}: ${match[0]}`);
  }
  return hits;
}

/** Rule 5 as a boolean. The only question the composer asks about its copy. */
export function isDebtFree(...parts: (string | null | undefined)[]): boolean {
  return returnDebtTerms(parts.filter(Boolean).join('\n')).length === 0;
}

/**
 * Sweep a whole report. Returns hits across every part, so a headline that
 * shames is caught even when the body does not.
 */
export function sweepReturn(parts: Record<string, string>): string[] {
  const hits: string[] = [];
  for (const [name, text] of Object.entries(parts)) {
    for (const hit of returnDebtTerms(text)) hits.push(`${name} — ${hit}`);
  }
  return hits;
}

/**
 * Rule 5, made structural — the companion to `commercialLanguage.ts`.
 *
 * Rule 5: a surface "never guilts, never says something was lost, never
 * implies decay". Rule 7's vocabulary lint already refuses a message that
 * tries to sell something; this one refuses a message that tries to make
 * somebody feel bad for not being here.
 *
 * WHY THIS IS A SEPARATE LIST AND NOT MORE ROWS IN THE COMMERCIAL ONE
 *
 *   They fail differently and a reviewer needs to know which happened. "20%
 *   off" is a Rule 7 breach and someone added an advert. "Your streak is at
 *   risk" is a Rule 5 breach and someone added a threat. Both refuse the send;
 *   they should not report the same reason.
 *
 * WHY IT EXISTS AT ALL
 *
 *   §12.4 names notification volume as a FORBIDDEN response to a retention
 *   dip. The response that gets reached for next, when volume is off the
 *   table, is retention COPY: the same two notifications, rewritten to sting.
 *   That edit is one word long — "settled" becomes "expired", "a new Signal"
 *   becomes "you missed yesterday's" — and it does not look like a policy
 *   change in a diff. A word list catches it in CI on the day it is written,
 *   and `sendPushToTrigger` re-runs the same function in production so a
 *   string assembled at runtime cannot slip past the tests.
 *
 * WHAT IS DELIBERATELY FORBIDDEN THAT SOUNDS INNOCENT
 *
 *   - "streak". The Daily Take streak is a real, legitimate product concept
 *     (§7.1) and this lint says nothing about the game surface. But a streak
 *     mentioned in a PUSH is always a lever — nobody pushes "your streak is
 *     fine". Notification copy may not mention one.
 *   - "reset" / "expires". True statements about the UTC day, and still
 *     forbidden here: a notification that tells you a clock is running is a
 *     notification designed to move you, which is exactly §12.4's line.
 *   - "come back". The friendliest possible phrasing of the thing Rule 5
 *     forbids.
 *
 * This module holds no product knowledge and imports nothing. It is a lint
 * over English, and it is the same function the tests assert with — so the
 * test and the runtime guard cannot disagree.
 */

export interface LossTerm {
  /** What the rule is about, for the failure message. */
  label: string;
  pattern: RegExp;
}

/**
 * The forbidden vocabulary: loss, decay, guilt, absence and urgency.
 * Word-boundary anchored throughout, case-insensitive.
 */
export const LOSS_TERMS: readonly LossTerm[] = [
  {
    label: 'loss',
    pattern:
      /\b(?:lost|lose|loses|losing|forfeit|forfeits|forfeited|forfeiting|wiped|gone\s+for\s+good|nothing\s+left)\b/i,
  },
  {
    label: 'decay',
    pattern:
      /\b(?:decay|decays|decayed|decaying|expire|expires|expired|expiring|expiry|reset|resets|resetting|drain|drains|draining|dwindl\w*)\b/i,
  },
  {
    label: 'streak pressure',
    pattern: /\b(?:streak|streaks|combo\s+broken|don'?t\s+break|keep\s+it\s+alive)\b/i,
  },
  {
    label: 'guilt',
    pattern:
      /\b(?:you\s+missed|missed\s+out|you\s+forgot|neglect|neglected|neglecting|abandon|abandoned|falling\s+behind|fell\s+behind|catch\s+up|catching\s+up|slipping|left\s+behind|last\s+seen)\b/i,
  },
  {
    label: 'absence',
    pattern:
      /\b(?:we\s+miss\s+you|come\s+back|been\s+a\s+while|haven'?t\s+played|hasn'?t\s+played|where\s+have\s+you\s+been|are\s+you\s+still|still\s+there)\b/i,
  },
  {
    label: 'urgency',
    pattern:
      /\b(?:last\s+chance|running\s+out|before\s+it'?s\s+gone|ends\s+soon|ending\s+soon|hurry|act\s+fast|only\s+\d+\s+(?:hours?|days?|minutes?)\s+left|final\s+hours?)\b/i,
  },
  {
    label: 'risk',
    pattern:
      /\b(?:at\s+risk|in\s+danger|about\s+to\s+lose|will\s+lose|you'?ll\s+lose|in\s+jeopardy|on\s+the\s+line)\b/i,
  },
];

/**
 * Every Rule 5 rule the text trips, as `"label: matched text"`.
 * Empty means the text is clean.
 */
export function lossTerms(text: string): string[] {
  const hits: string[] = [];
  for (const term of LOSS_TERMS) {
    const match = term.pattern.exec(text);
    if (match) hits.push(`${term.label}: ${match[0]}`);
  }
  return hits;
}

/** Rule 5 as a boolean. */
export function isLossFree(...parts: (string | null | undefined)[]): boolean {
  return lossTerms(parts.filter(Boolean).join('\n')).length === 0;
}

/**
 * Sweep a whole message, part by part, so a title that threatens is caught
 * even when the body is kind.
 */
export function sweepForLoss(parts: Record<string, string>): string[] {
  const hits: string[] = [];
  for (const [name, text] of Object.entries(parts)) {
    for (const hit of lossTerms(text)) hits.push(`${name} — ${hit}`);
  }
  return hits;
}

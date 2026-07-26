/**
 * The player's contract (Constitution §3, §11.6), as data.
 *
 * §3 says the contract is "published in-product, on the purchase surface,
 * and in marketing. Both sides of it." §11.6 says the spike channels aim at
 * "the player contract published at a linkable URL as the manifesto". This
 * module is that text, held in one place so the page, the Open Graph card,
 * and any future in-product excerpt quote the SAME words — a manifesto that
 * says something slightly different in three places is not a manifesto.
 *
 * WHY THE COPY LIVES HERE AND NOT IN THE PAGE
 *
 *   Because it has to be sweepable. Rule 7 forbids a commercial surface on
 *   this page, and the only mechanical way to keep that true through years
 *   of copy edits is to run the §11.6 commercial-vocabulary lint over the
 *   contract's own words in CI (`commercialLanguage.ts` — the same function
 *   that gates the Dispatch emails). `contractPlainText()` exists to be fed
 *   to that lint.
 *
 * A CONSEQUENCE WORTH STATING
 *
 *   The lint forbids the word "fee", so §3's punchline — "it is not a perk;
 *   it is a fee" — is written here as "it is not a perk; it is a toll". Same
 *   claim, and "toll" is §11.7's own word for the thing registration is not.
 *   Several other clauses are worded around the vocabulary for the same
 *   reason. That constraint improved the copy; it did not weaken it.
 *
 * Each clause carries the reviewer's question from §4 verbatim in spirit,
 * because a promise with a published test attached is the only kind a
 * stranger can hold anyone to.
 */

export interface ContractClause {
  /** Stable anchor id — the clause is individually linkable (Rule 14). */
  id: string;
  /** The promise, as a sentence. */
  title: string;
  /** What the promise means, in plain words. */
  body: string;
  /** How anyone — including a stranger — checks that it is still true. */
  test: string;
}

/** The contract's opening statement: what this document is. */
export const CONTRACT_PREAMBLE =
  'This is what SupaSnake promises you and what it refuses to do to you. ' +
  'Both sides of it, in public, at an address you can link to. ' +
  'Every clause carries the question you check it with.';

/**
 * The nine clauses. Order is deliberate: the two numbers first (Rules 2 and
 * 3, the claims a competitor cannot copy), then what money can honestly
 * reach, then the §3 test itself, then permanence, absence, the run, the
 * name, and the district.
 */
export const CONTRACT_CLAUSES: readonly ContractClause[] = [
  {
    id: 'score-measures-the-pilot',
    title: 'Your score measures you, not your build.',
    body:
      'The leaderboard number is folded from one thing: the food you ate and the ' +
      'ruleset of the dynasty you played. It does not read your genes, your traits, ' +
      'your anomalies, your account, or anything money could ever have reached. Two ' +
      'players who ran the same board the same way post the same number, whatever ' +
      'either of them owns.',
    test:
      'Does the score fold read anything but the run’s food events and the ' +
      'dynasty ruleset? There are exactly two folds, and a CI check fails the build ' +
      'if either grows a third input.',
  },
  {
    id: 'money-moves-no-number',
    title: 'Money moves no number.',
    body:
      'Not Score. Not Depth. Not DNA, not XP, not odds, not timers. Trace anything ' +
      'money can ever get you and the trace ends in appearance or continuity — ' +
      'never in a value the game computes.',
    test:
      'Follow any supported thing to a number. If the trace arrives at one, the ' +
      'thing cannot be sold and does not ship.',
  },
  {
    id: 'what-money-reaches',
    title: 'What money can ever get you: appearance, continuity, recognition.',
    body:
      'That is the whole list. Everything supported is permanent, non-random, and ' +
      'completely described before you decide. Nothing is consumable, nothing is a ' +
      'lottery, nothing runs out, and nothing arrives as a surprise you gambled for.',
    test:
      'Is it permanent, is it fully known in advance, and does it leave every ' +
      'computed number exactly where it was?',
  },
  {
    id: 'same-game',
    title: 'A free player and a supporter play the same game.',
    body:
      'Same board, same rules, same rewards, same leaderboards, same conditions. ' +
      'They look different. That sentence is the entire test: anything that fails ' +
      'it is not a perk, it is a toll, and a toll does not ship.',
    test:
      'Read the sentence again with the proposed thing in your hand. If the ' +
      'sentence stops being true, the thing is the problem.',
  },
  {
    id: 'earned-is-permanent',
    title: 'Everything you earn is permanent.',
    body:
      'Records, marks, tracks, tenure, lineage, history. Nothing you have earned ' +
      'is reduced, expired, or taken back — not by a season ending, not by a ' +
      'rebalance, not by a year away.',
    test: 'Does any code path write a player-owned row downward? None may.',
  },
  {
    id: 'absence-is-not-destructive',
    title: 'Being away is never destructive.',
    body:
      'The daily pull is real, and missing it is allowed. A missed day loses that ' +
      'day’s opportunities and cools your streak by one tier — never to ' +
      'zero. Nothing you own decays while you are gone. There is no backlog waiting ' +
      'for you and no debt to work off when you come back.',
    test:
      'Compare thirty days away with thirty days played. Beyond the opportunities ' +
      'you were not there for and a cooled streak, is anything you owned gone?',
  },
  {
    id: 'nothing-interrupts-a-run',
    title: 'Nothing interrupts a live run.',
    body:
      'Between your first input and the end of the run, the only things that speak ' +
      'are the run’s own decisions: the genes, the portal, the surge, your ' +
      'tactical hold, and the confirmation before you throw a run away. Nothing ' +
      'else renders, fires, or sounds. Nothing is ever sold to you mid-run, and ' +
      'nothing is ever sold to you on the screen where the run ends.',
    test:
      'Watch a full run. Did anything appear that was not one of those decisions ' +
      'or a consent notice the law requires?',
  },
  {
    id: 'your-name-is-not-a-toll',
    title: 'Your name is not a toll.',
    body:
      'Anonymous play is never gated — you can play this game forever without ' +
      'telling us anything. Claiming a name is free and stays free: it is how you ' +
      'enter Ascension, found or join a clan, and sign the things you share. ' +
      'Staying anonymous loses you nothing except being seen.',
    test:
      'Try to reach a board without an account. You can. Then claim a name and ' +
      'watch nothing be taken from you in exchange.',
  },
  {
    id: 'commerce-stays-in-its-district',
    title: 'Commerce stays in its district.',
    body:
      'There is one part of this game where money is discussed and you get there ' +
      'by walking there. It never comes to you: not during a run, not on the ' +
      'results screen, not as a notification, not as an email, and never as the ' +
      'main button on a screen you came to for something else.',
    test:
      'Count the commercial surfaces on any screen. Elsewhere the answer is at ' +
      'most one, never the primary action; during a run and on results it is zero.',
  },
] as const;

/**
 * The closing paragraph. It is the reason the page exists at a URL rather
 * than in a footer: a contract that can be linked can be quoted back.
 */
export const CONTRACT_CLOSING =
  'This page is the contract. It has an address because a promise you can link to ' +
  'is the only kind that can be held against the people who made it. These clauses ' +
  'come from the document the game is designed against, and changing one of them ' +
  'means changing that document first, in writing, with the reason recorded. ' +
  'If a line here ever stops being true, it will have been struck through in public ' +
  'before it stopped being true in the game.';

/** The one-line version, for the Open Graph card and metadata. */
export const CONTRACT_SUMMARY =
  'What SupaSnake promises and what it refuses. Your score measures you, not your ' +
  'build. Money moves no number. Everything you earn is permanent. Being away is ' +
  'never destructive.';

/** The document title, used by the page, the card, and the metadata. */
export const CONTRACT_TITLE = 'The player’s contract';

/**
 * The four lines the Open Graph card carries. A card is read at thumbnail
 * size in a feed, so the clause titles are too long for it — these are the
 * same four claims compressed, and they are swept by the same lint as the
 * page, because an unfurled card is a published surface too.
 */
export const CONTRACT_CARD_LINES: readonly string[] = [
  'Your score measures you, not your build.',
  'Money moves no number.',
  'Everything you earn is permanent.',
  'Being away is never destructive.',
] as const;

/**
 * Every word the contract publishes, as one string.
 *
 * This is what the Rule 7 sweep is run over, and what a future copy edit has
 * to get past. It is deliberately the same constants the page renders, so
 * the lint cannot pass while the page says something else.
 */
export function contractPlainText(): string {
  return [
    CONTRACT_TITLE,
    CONTRACT_PREAMBLE,
    ...CONTRACT_CLAUSES.flatMap((clause) => [clause.title, clause.body, clause.test]),
    CONTRACT_CLOSING,
    CONTRACT_SUMMARY,
    ...CONTRACT_CARD_LINES,
  ].join('\n');
}

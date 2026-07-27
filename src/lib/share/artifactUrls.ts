/**
 * Where every artifact class lives, and what a share sheet says about it
 * (WP-1.08, Constitution Rule 14 and §11.3).
 *
 * Rule 14 names six artifact classes — "a run, a snake, a clan, a Signal
 * day, a Serpent week, a profile" — and requires each to be linkable, with
 * the link carrying "an image and a way in". This module is the single
 * place those six URLs are constructed, so a card, a share sheet, a landing
 * page and a test can never disagree about the address of the same thing.
 *
 * Paths are short on purpose. §11.3 writes the Signal link as
 * `supasnake.com/s/214`, and a link that survives being read aloud, typed
 * from a screenshot, or truncated by a chat client is worth more than a
 * descriptive one.
 *
 *   /s/<day>      Signal day        — day derived from the UTC calendar
 *   /r/<seed>     run               — the run's seed
 *   /w/<week>     Serpent week      — the Monday, YYYY-MM-DD
 *   /c/<tag>      clan              — the clan tag
 *   /x/<code>     snake / lineage   — a self-describing lineage code
 *   /p/<handle>   profile           — shipped in Identity v1
 *
 * ALWAYS THE CANONICAL ORIGIN. A card shared from a preview deployment must
 * not hand a stranger a preview link, so every absolute URL here is built
 * from `canonicalUrl` and never from `deploymentOrigin`.
 *
 * THE SHARE-SHEET LESSON (WP-0.08, GT §8). `navigator.share` silently drops
 * `url` on several platforms when `files` is present, which is how the
 * shipped Genome Card reached players with no way back in. Every payload
 * built here therefore repeats the URL as the LAST LINE of `text` as well
 * as setting `url`. `shareArtifacts.test.ts` asserts it for every class.
 */

import { canonicalUrl } from '@/shared/config/site';
import {
  challengeQueryParams,
  decisionGlyphs,
  decisionWords,
  type Challenge,
  type PortalDecision,
} from '@/shared/game/challenge';

function withQuery(path: string, params: Array<[string, string]>): string {
  if (params.length === 0) return path;
  const query = params
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${path}?${query}`;
}

/**
 * SELF-ENCODING CODES — why `/x/` and `/b/` interpolate their code directly.
 *
 * `encodeLineageCode` and `encodeBuildCode` percent-encode every FIELD and
 * join the fields with `~`, a character `encodeURIComponent` deliberately
 * leaves alone. The result is already a legal path segment: alphanumerics,
 * `~`, and `%XX` escapes, and nothing that could end the segment or start a
 * query. So there is nothing left for a path helper to encode — and wrapping
 * it again is actively wrong, because it escapes the `%` of the code's own
 * escapes (`%2C` → `%252C`).
 *
 * THAT MATTERS BECAUSE A PAGE AND A ROUTE HANDLER DO NOT AGREE. Measured on
 * Next 15.5.21, for the URL `/…/Vyper~CYBER~4~gold_trail%2Ctithe~…`:
 *
 *   page.tsx      receives `gold_trail%2Ctithe`  — the segment RAW
 *   route.ts      receives `gold_trail,tithe`    — decoded once
 *
 * The decoders are written for the page, which is the surface a shared link
 * actually lands on, so they decode each field themselves. Feed a page a
 * doubly-encoded code and that one decode yields `gold_trail%2Ctithe`, which
 * names no gene. `/b/` then 404s (its decoder refuses) and `/x/` renders an
 * empty snake (its decoder skips). The OG images hid the whole thing, because
 * they resolve like route handlers and so tolerated the extra layer.
 *
 * This is exactly why `share-artifacts.spec.ts` writes these URLs literally
 * rather than calling `encodeURIComponent` on them.
 */

// ---------------------------------------------------------------------------
// The six paths
// ---------------------------------------------------------------------------

export function signalArtifactPath(
  day: number,
  challenge?: Pick<Challenge, 'target' | 'by' | 'decisions'>
): string {
  return withQuery(
    `/s/${Math.floor(day)}`,
    challenge ? challengeQueryParams(challenge) : []
  );
}

export function runArtifactPath(
  seed: string,
  challenge?: Pick<Challenge, 'target' | 'by' | 'decisions'>
): string {
  return withQuery(
    `/r/${encodeURIComponent(seed)}`,
    challenge ? challengeQueryParams(challenge) : []
  );
}

/** `weekKey` is the week's Monday as `YYYY-MM-DD` (see `serpentWeekKey`). */
export function serpentWeekArtifactPath(weekKey: string, clanTag?: string | null): string {
  return withQuery(
    `/w/${encodeURIComponent(weekKey)}`,
    clanTag ? [['c', clanTag]] : []
  );
}

export function clanArtifactPath(tag: string): string {
  return `/c/${encodeURIComponent(tag)}`;
}

/**
 * A LINEAGE CODE IS NOT RE-ENCODED HERE. See `SELF-ENCODING CODES` below —
 * this used to wrap the code in `encodeURIComponent`, and because
 * `encodeLineageCode` had already escaped the comma between genes, every
 * multi-gene card shared from the app arrived at `/x/` with `%252C` in it,
 * decoded to `slipstream%2Cgold_trail`, matched no gene id, and rendered
 * "Unwritten — no genes held". Measured, before and after the fix:
 *
 *   /x/Vyper~CYBER~4~slipstream%2Cgold_trail    → "Slipstream · Gold Trail"
 *   /x/Vyper~CYBER~4~slipstream%252Cgold_trail  → "Unwritten — no genes held"
 *
 * A 200 with the content silently emptied, which is why it survived: nothing
 * 404s and the only e2e case pinned a SINGLE-gene code with no escapes in it
 * at all, so the one shape that cannot show the bug was the only shape tested.
 */
export function lineageArtifactPath(code: string): string {
  return `/x/${code}`;
}

export function profileArtifactPath(handle: string): string {
  return `/p/${encodeURIComponent(handle)}`;
}

/**
 * A build — the SEVENTH class, minted deliberately (WP-2.08 owner decision).
 *
 * Rule 14 enumerates six things that are linkable. That list is a floor, not
 * a ceiling: §12.2's caps table — the actual test a surface has to pass — has
 * no artifact-class row at all, so a seventh class costs nothing there. And
 * the query-string alternative is structurally blocked rather than merely
 * uglier: Next's `opengraph-image` file convention receives route params and
 * never `searchParams`, which is exactly why `/og/challenge` had to exist. A
 * build shared as `?b=<code>` could not unfurl.
 *
 * The tidier-looking alternative — widening the lineage code to carry a plan —
 * is worse than a new path: it would make `decodeLineageCode`'s field-count
 * check variable, putting a shipped, tested decoder at risk to save a route.
 *
 * See `SELF-ENCODING CODES` below for why the code is not re-encoded here.
 */
export function buildArtifactPath(code: string): string {
  return `/b/${code}`;
}

/**
 * An Ascension month — and deliberately NOT a seventh artifact class.
 *
 * Rule 14 names six things that get a short path of their own. §12.2 names
 * Ascension as "the Signal's monthly aggregation view, not a surface", so it
 * gets no `/a/<month>` and no district: a month is addressed as a QUERY on the
 * Score ladder it is a reading of. `supasnake.com/leaderboard?month=2026-07`
 * is linkable, which is all Rule 14 asks, and it says what the thing is —
 * Score, this month — in the address bar itself (§6.1).
 *
 * `month` is `YYYY-MM` (see `ascensionMonthKey`).
 */
export function ascensionMonthPath(month: string): string {
  return withQuery('/leaderboard', [['month', month]]);
}

export const signalArtifactUrl = (
  day: number,
  challenge?: Pick<Challenge, 'target' | 'by' | 'decisions'>
) => canonicalUrl(signalArtifactPath(day, challenge));

export const runArtifactUrl = (
  seed: string,
  challenge?: Pick<Challenge, 'target' | 'by' | 'decisions'>
) => canonicalUrl(runArtifactPath(seed, challenge));

export const serpentWeekArtifactUrl = (weekKey: string, clanTag?: string | null) =>
  canonicalUrl(serpentWeekArtifactPath(weekKey, clanTag));

export const clanArtifactUrl = (tag: string) => canonicalUrl(clanArtifactPath(tag));

export const lineageArtifactUrl = (code: string) =>
  canonicalUrl(lineageArtifactPath(code));

export const profileArtifactUrl = (handle: string) =>
  canonicalUrl(profileArtifactPath(handle));

export const buildArtifactUrl = (code: string) => canonicalUrl(buildArtifactPath(code));

export const ascensionMonthUrl = (month: string) =>
  canonicalUrl(ascensionMonthPath(month));

// ---------------------------------------------------------------------------
// The way in
// ---------------------------------------------------------------------------

/**
 * The "way in" Rule 14 demands: one tap from the artifact page to a live
 * board on the same seed. §12.2 caps open → board at three taps; a
 * challenge link spends one on the link and one on this button.
 *
 * The engine reads `seed` and starts its rng from it (`challengeRng`);
 * `target` is display only and `challenge` is the provenance label the
 * Results screen reads back to say which dare was answered.
 */
export function challengePlayPath(challenge: Challenge): string {
  const params: Array<[string, string]> = [['seed', challenge.seed]];
  if (challenge.target !== null) params.push(['target', String(challenge.target)]);
  params.push([
    'challenge',
    challenge.kind === 'signal' && challenge.day !== null
      ? `signal:${challenge.day}`
      : `run:${challenge.seed}`,
  ]);
  if (challenge.by) params.push(['by', challenge.by]);
  return withQuery('/game', params);
}

/**
 * The Open Graph image for a challenge link.
 *
 * Next's `opengraph-image.tsx` convention receives only route params, never
 * the query string, so a card that has to show "beat 1,240" cannot be built
 * by the file convention. A page whose URL carries challenge parameters
 * points `openGraph.images` here instead; a bare artifact link keeps the
 * file-convention image. Both render the same card.
 */
export function challengeImagePath(
  challenge: Challenge,
  dynasty?: string | null
): string {
  const params: Array<[string, string]> = [['kind', challenge.kind]];
  if (challenge.kind === 'signal' && challenge.day !== null) {
    params.push(['day', String(challenge.day)]);
  } else {
    params.push(['seed', challenge.seed]);
  }
  params.push(...challengeQueryParams(challenge));
  if (dynasty) params.push(['dy', dynasty.toUpperCase()]);
  return withQuery('/og/challenge', params);
}

/** True when a challenge carries anything the file-convention card can't show. */
export function challengeNeedsOwnImage(challenge: Challenge): boolean {
  return challenge.target !== null || challenge.decisions.length > 0;
}

// ---------------------------------------------------------------------------
// Share payloads
// ---------------------------------------------------------------------------

export interface SharePayload {
  title: string;
  /** Ends with `url` on its own line — see the share-sheet lesson above. */
  text: string;
  url: string;
}

/**
 * Assemble a payload with the URL guaranteed to be the last line of `text`.
 * Every builder below goes through here, so the WP-0.08 defect cannot be
 * reintroduced one payload at a time.
 */
export function payload(
  title: string,
  lines: readonly string[],
  url: string
): SharePayload {
  const body = lines.filter((line) => line.trim().length > 0);
  return { title, text: [...body, url].join('\n'), url };
}

/**
 * The Signal grid — the artifact §11.3 specifies, verbatim in shape:
 *
 *   SUPASNAKE · Signal #214 · CYBER
 *   ⚡▶▶💰  infuse · pass · pass · BANKED ×1.25
 *   Score 1,240 · best ↑ · Yield 2,315
 *   supasnake.com/s/214
 */
export interface SignalGridInput {
  day: number;
  dynasty: string;
  decisions: readonly PortalDecision[];
  score: number;
  yieldDna: number | null;
  personalBest: boolean;
  handle?: string | null;
}

export function signalGridLines(input: SignalGridInput): string[] {
  const glyphs = decisionGlyphs(input.decisions);
  const stats = [`Score ${Math.max(0, Math.floor(input.score)).toLocaleString('en-US')}`];
  if (input.personalBest) stats.push('best ↑');
  if (input.yieldDna !== null) {
    stats.push(`Yield ${Math.max(0, Math.floor(input.yieldDna)).toLocaleString('en-US')}`);
  }
  return [
    `SUPASNAKE · Signal #${Math.floor(input.day)} · ${input.dynasty.toUpperCase()}`,
    glyphs ? `${glyphs}  ${decisionWords(input.decisions)}` : decisionWords(input.decisions),
    stats.join(' · '),
  ];
}

export function signalGridShare(input: SignalGridInput): SharePayload {
  return payload(
    `SupaSnake — Signal #${Math.floor(input.day)}`,
    signalGridLines(input),
    signalArtifactUrl(input.day, {
      target: Math.max(0, Math.floor(input.score)) || null,
      by: input.handle ?? null,
      decisions: [...input.decisions],
    })
  );
}

/** A run outside the Signal: same arc, addressed by its own seed. */
export interface RunShareInput {
  seed: string;
  dynasty: string;
  decisions: readonly PortalDecision[];
  score: number;
  yieldDna: number | null;
  personalBest: boolean;
  handle?: string | null;
}

export function runShare(input: RunShareInput): SharePayload {
  const stats = [`Score ${Math.max(0, Math.floor(input.score)).toLocaleString('en-US')}`];
  if (input.personalBest) stats.push('best ↑');
  if (input.yieldDna !== null) {
    stats.push(`Yield ${Math.max(0, Math.floor(input.yieldDna)).toLocaleString('en-US')}`);
  }
  const glyphs = decisionGlyphs(input.decisions);
  return payload(
    'SupaSnake — my run',
    [
      `SUPASNAKE · ${input.dynasty.toUpperCase()}`,
      glyphs ? `${glyphs}  ${decisionWords(input.decisions)}` : decisionWords(input.decisions),
      stats.join(' · '),
    ],
    runArtifactUrl(input.seed, {
      target: Math.max(0, Math.floor(input.score)) || null,
      by: input.handle ?? null,
      decisions: [...input.decisions],
    })
  );
}

/**
 * The Serpent settlement card — the clan-scale share (§11.3):
 * "HOLLOW FANG reached Depth 48,210 — best week yet."
 *
 * Rule 5 and Rule 6: a settlement card reports what a week ADDED. It never
 * renders a decline, a loss, a demotion or a "you dropped to" — there is no
 * such number to render, because nothing owned is ever written downward.
 */
export interface SettlementShareInput {
  weekKey: string;
  weekIndex: number;
  clanName: string;
  clanTag: string;
  depth: number;
  bestWeek: boolean;
  contributingMembers: number;
}

export function settlementLines(input: SettlementShareInput): string[] {
  const depth = Math.max(0, Math.floor(input.depth)).toLocaleString('en-US');
  const lines = [
    `SUPASNAKE · World Serpent · week of ${input.weekKey}`,
    `${input.clanName.toUpperCase()} reached Depth ${depth}${
      input.bestWeek ? ' — best week yet' : ''
    }`,
  ];
  if (input.contributingMembers > 0) {
    lines.push(
      `${input.contributingMembers} ${
        input.contributingMembers === 1 ? 'member hunted' : 'members hunted'
      }`
    );
  }
  return lines;
}

export function settlementShare(input: SettlementShareInput): SharePayload {
  return payload(
    `SupaSnake — ${input.clanName} · Serpent week ${input.weekKey}`,
    settlementLines(input),
    serpentWeekArtifactUrl(input.weekKey, input.clanTag)
  );
}

/** The lineage card — a snake, as an object worth showing (§8.2). */
export interface LineageShareInput {
  code: string;
  snakeName: string;
  dynasty: string;
  generation: number;
  geneNames: readonly string[];
}

export function lineageShare(input: LineageShareInput): SharePayload {
  return payload(
    `SupaSnake — ${input.snakeName}`,
    [
      `SUPASNAKE · ${input.snakeName} · Gen ${Math.max(1, Math.floor(input.generation))}`,
      input.dynasty.toUpperCase(),
      input.geneNames.length > 0 ? input.geneNames.join(' · ') : 'Unwritten',
    ],
    lineageArtifactUrl(input.code)
  );
}

/**
 * The build card — a plan, passed on as a recipe (WP-2.08).
 *
 * Note what this payload cannot contain: there is no `yield` or `score` field
 * to pass in. A build code is forgeable, so a number on it would be a claim
 * the game never made — the share text carries the plan's shape and the week
 * it was made for, and the reader recomputes everything else against their own
 * inventory when they open it.
 */
export interface BuildShareInput {
  code: string;
  snakeName: string;
  dynasty: string;
  generation: number;
  geneNames: readonly string[];
  contextName: string;
  infuses: number;
}

export function buildShare(input: BuildShareInput): SharePayload {
  const plan =
    input.geneNames.length > 0 ? input.geneNames.join(' → ') : 'No genes named';
  const spend =
    input.infuses > 0
      ? `${input.infuses} ${input.infuses === 1 ? 'infuse' : 'infuses'}`
      : 'No infuses';
  return payload(
    `SupaSnake — ${input.snakeName}'s build`,
    [
      `SUPASNAKE · ${input.snakeName} · Gen ${Math.max(1, Math.floor(input.generation))} ${input.dynasty.toUpperCase()}`,
      `Planned for ${input.contextName}`,
      plan,
      spend,
    ],
    buildArtifactUrl(input.code)
  );
}

export function clanShare(input: { name: string; tag: string; lifetimeDepth: number }): SharePayload {
  return payload(
    `SupaSnake — ${input.name}`,
    [
      `SUPASNAKE · ${input.name.toUpperCase()} [${input.tag}]`,
      `Lifetime Depth ${Math.max(0, Math.floor(input.lifetimeDepth)).toLocaleString('en-US')}`,
    ],
    clanArtifactUrl(input.tag)
  );
}

export function profileShare(input: { handle: string; bestScore: number | null }): SharePayload {
  return payload(
    `SupaSnake — ${input.handle}`,
    [
      `SUPASNAKE · ${input.handle}'s chronicle`,
      input.bestScore !== null
        ? `Best score ${Math.max(0, Math.floor(input.bestScore)).toLocaleString('en-US')}`
        : '',
    ],
    profileArtifactUrl(input.handle)
  );
}

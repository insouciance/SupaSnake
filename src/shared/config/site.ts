/**
 * Canonical site identity — one source of truth for every growth surface:
 * metadata, OG/Twitter cards, robots, sitemap, structured data, share
 * artifacts, and the Dispatch emails.
 *
 * Two origins, deliberately distinct:
 *
 * - CANONICAL_ORIGIN is the public address of the product. It is what a
 *   stranger types and what a shared artifact must carry (Constitution
 *   Rule 14 — "if it matters, it has a URL"). It never varies by
 *   deployment: a preview build must not hand a player a preview link.
 * - deploymentOrigin() is where *this* build is served. Only Next's
 *   `metadataBase` uses it, so relative OG image URLs resolve on preview
 *   deployments and on localhost.
 *
 * NEXT_PUBLIC_APP_URL is already a required production variable
 * (scripts/production-env-validation.cjs asserts it equals the canonical
 * origin), so no new secret or variable is introduced here.
 */

import { PRODUCT } from './legal';

/** The product's permanent public origin, without a trailing slash. */
export const CANONICAL_ORIGIN = PRODUCT.url;

export const SITE_NAME = PRODUCT.name;

/** The mission line. Constitution §1: "correct and stays". */
export const SITE_TAGLINE = 'Where Skill Creates Legacy';

/**
 * The stranger-facing pitch (Constitution §11.1, condensed to fit a search
 * result and an OG card). Kept under 160 characters for SERP truncation.
 */
export const SITE_DESCRIPTION =
  'A three-minute precision snake game in your browser. Every run ends with a deal: bank it, push your luck, or feed the snake. No install, no ads.';

/** Longer form for the /play intent page and structured data. */
export const SITE_LONG_DESCRIPTION =
  'SupaSnake is a three-minute precision snake game that runs instantly in any browser. ' +
  'The signature moment is extraction: a portal appears and you choose — BANK your run for a ' +
  'secured multiplier, PASS to push your luck, or INFUSE body length into build power. ' +
  'Three dynasties (CYBER, PRIMAL, COSMIC) are genuinely different rulesets, and everything ' +
  'you keep compounds into a mastery record and a bred lineage. No install, no ads, and ' +
  'nothing you can buy moves a number.';

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/**
 * The origin this build is served from. Falls back to the canonical origin
 * so a misconfigured preview still produces absolute, resolvable URLs.
 */
export function deploymentOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return CANONICAL_ORIGIN;
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return CANONICAL_ORIGIN;
    }
    return trimTrailingSlash(parsed.origin + parsed.pathname);
  } catch {
    return CANONICAL_ORIGIN;
  }
}

/**
 * Absolute, canonical URL for a path. Always the public origin — this is
 * what goes into a share sheet, an email, or a sitemap entry.
 */
export function canonicalUrl(path = '/'): string {
  if (!path || path === '/') return CANONICAL_ORIGIN;
  return `${CANONICAL_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * The indexable surface of supasnake.com, in one place, so `robots.ts` and
 * `sitemap.ts` can never disagree (Constitution §11.6 — the Snake Query
 * Engine only compounds if the crawler is told the truth).
 *
 * The rule for inclusion: a page a stranger can open, understand, and act
 * on without an account. Everything else — the app itself, the account
 * surfaces, the API, the dev fixtures — is disallowed, not because it is
 * secret but because it is noise in an index and a crawl-budget leak.
 */

import { CANONICAL_ORIGIN } from '@/shared/config/site';

export interface SitemapEntry {
  path: string;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: number;
}

/**
 * Path prefixes no crawler should follow.
 *
 * - `/api/` — machine surface, several routes are authenticated mutations.
 * - `/dev/` — deterministic visual fixtures; they already 404 in production.
 * - `/auth/` — the Supabase callback and the password-reset round-trip,
 *   which carry single-use codes in the query string.
 * - the account and in-app surfaces — they render a loading shell to a
 *   logged-out crawler, which is the worst possible search result.
 */
export const DISALLOWED_PREFIXES: readonly string[] = [
  '/api/',
  '/dev/',
  '/auth/',
  '/settings',
  '/profile',
  '/game',
  '/lab',
  '/clan',
  '/shop',
  '/stats',
  '/training',
  '/login',
  '/signup',
];

/** Always-indexable pages. */
const STATIC_ENTRIES: readonly SitemapEntry[] = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/leaderboard', changeFrequency: 'daily', priority: 0.7 },
  { path: '/codex', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/contact', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/legal/impressum', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/legal/privacy', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/legal/terms', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/legal/cookies', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/legal/withdrawal', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/legal/accessibility', changeFrequency: 'yearly', priority: 0.2 },
];

/**
 * The sitemap's entries. `/play` only exists while the growth-surfaces flag
 * is on, so listing it unconditionally would advertise a 404.
 */
export function sitemapEntries(growthSurfacesEnabled: boolean): SitemapEntry[] {
  const entries = [...STATIC_ENTRIES];
  if (growthSurfacesEnabled) {
    entries.splice(1, 0, {
      path: '/play',
      changeFrequency: 'weekly',
      priority: 0.9,
    });
  }
  return entries;
}

export function absoluteSitemapUrl(path: string): string {
  return path === '/' ? `${CANONICAL_ORIGIN}/` : `${CANONICAL_ORIGIN}${path}`;
}

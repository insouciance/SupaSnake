import type { MetadataRoute } from 'next';
import { CANONICAL_ORIGIN } from '@/shared/config/site';
import { DISALLOWED_PREFIXES } from '@/lib/growth/siteMap';

/**
 * robots.txt (Constitution §11.4). One rule set for every agent — there is
 * no crawler we want to treat differently, and a per-bot allowlist is a
 * maintenance burden that ages badly.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [...DISALLOWED_PREFIXES],
    },
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
    host: CANONICAL_ORIGIN,
  };
}

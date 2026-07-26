import type { MetadataRoute } from 'next';
import { GROWTH_SURFACES_V1_ENABLED } from '@/lib/features/growth';
import { PLAYER_CONTRACT_V1_ENABLED } from '@/lib/features/contract';
import { absoluteSitemapUrl, sitemapEntries } from '@/lib/growth/siteMap';

/**
 * sitemap.xml (Constitution §11.4, §11.6). Static public pages only; the
 * Rule 14 artifact long tail (profiles, clans, Signal days) gets its own
 * generated entries when those artifacts have URLs — WP-1.08.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return sitemapEntries(
    GROWTH_SURFACES_V1_ENABLED,
    PLAYER_CONTRACT_V1_ENABLED
  ).map((entry) => ({
    url: absoluteSitemapUrl(entry.path),
    lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}

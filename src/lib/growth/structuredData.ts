/**
 * schema.org structured data (Constitution §11.6 — the Snake Query Engine).
 *
 * Every claim here must be true of the shipped product. Structured data that
 * overstates gets the domain penalised, and — more to the point — the player
 * contract (§3) is the marketing asset, so the machine-readable version of it
 * had better match.
 */

import { LEGAL_ENTITY } from '@/shared/config/legal';
import {
  CANONICAL_ORIGIN,
  SITE_LONG_DESCRIPTION,
  SITE_NAME,
} from '@/shared/config/site';

export interface StructuredData {
  '@context': 'https://schema.org';
  [key: string]: unknown;
}

/**
 * The `VideoGame` entity for /play. `offers` at price 0 is the honest
 * statement that playing costs nothing — not a commercial surface (Rule 7),
 * which concerns what the *player* is shown, and this is markup.
 */
export function videoGameStructuredData(): StructuredData {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: SITE_NAME,
    url: CANONICAL_ORIGIN,
    description: SITE_LONG_DESCRIPTION,
    image: `${CANONICAL_ORIGIN}/opengraph-image`,
    genre: ['Arcade', 'Casual', 'Roguelite'],
    gamePlatform: ['Web browser'],
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any (web browser)',
    playMode: 'SinglePlayer',
    inLanguage: 'en',
    isAccessibleForFree: true,
    publisher: {
      '@type': 'Organization',
      name: LEGAL_ENTITY.name,
      url: CANONICAL_ORIGIN,
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      url: CANONICAL_ORIGIN,
    },
  };
}

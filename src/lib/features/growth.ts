/**
 * Growth surfaces v1 rollout switch (WP-0.08).
 *
 * Gates every NEW player-visible growth surface: the landing page's
 * below-the-fold pitch, the /play intent page, and the Dispatch waitlist.
 * Defaulted OFF — omitting the variable must never be read as "on", and
 * the flag-off path is tested deliberately rather than inferred.
 *
 * Deliberately NOT gated by this flag, because none of it is a new player
 * surface and all of it is pure hygiene that should ship immediately:
 * document metadata, favicon/app icons, OG and Twitter card images,
 * robots.txt, sitemap.xml, the share-card URL fix, attribution capture,
 * and the funnel event taxonomy.
 */
export const GROWTH_SURFACES_V1_ENABLED =
  process.env.NEXT_PUBLIC_GROWTH_SURFACES_V1 === 'true';

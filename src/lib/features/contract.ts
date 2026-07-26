/**
 * The player-contract page rollout switch (WP-2.03; Constitution §3, §11.6).
 *
 * DEFAULTED OFF. `NEXT_PUBLIC_PLAYER_CONTRACT_V1` must be the exact string
 * `true` to arm it; anything else — including the variable being absent — is
 * off, because an omitted flag must never be read as "on".
 *
 * WHAT "OFF" MEANS, PRECISELY
 *
 *   - `/contract` 404s, exactly as if the route had never shipped.
 *   - `sitemap.xml` does not list it, so the flag-off deployment never
 *     advertises a 404 to a crawler.
 *   - The Open Graph route is deliberately NOT gated: an image is not a
 *     player surface, it costs nothing when nobody links to the page, and a
 *     card that renders while the page 404s is strictly better than a card
 *     that breaks the moment the flag flips on.
 *
 * The rollback path is tested (`src/app/contract/page.test.tsx`), never
 * inferred from an omitted variable.
 */
export const PLAYER_CONTRACT_V1_ENABLED =
  process.env.NEXT_PUBLIC_PLAYER_CONTRACT_V1 === 'true';

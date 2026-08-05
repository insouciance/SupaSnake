/**
 * Snake cosmetics rollout switch (LF-B).
 *
 * Gates the NEW surface only: tapping the home snake to open the cosmetics
 * menu. The chamber's own restyle is not behind this flag — it is a visual
 * port of a surface that already shipped, in the same way LF-A restyled the
 * board on both legs of the cockpit flag.
 *
 * With the flag off, Home renders exactly as it does today and the snake is
 * not a tap target; the loadout is still read and still rendered, because the
 * database is the authority either way and a player who equipped something
 * must not see it vanish when the flag moves. Rolling back removes the
 * WARDROBE, never the clothes.
 */
export const SNAKE_COSMETICS_ENABLED =
  process.env.NEXT_PUBLIC_SNAKE_COSMETICS === 'true';

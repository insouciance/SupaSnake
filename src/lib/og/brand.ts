/**
 * Shared constants for the generated share/app images (Constitution §11.4).
 *
 * These are the palette tokens already in tailwind.config.ts and
 * globals.css, restated as literals because `next/og` renders through
 * Satori with inline styles only — it cannot read Tailwind or CSS variables.
 * Keep them in step with the palette; do not invent new brand colours here.
 *
 * THE ACCENT WAS STALE. This file's own header claimed to mirror the app
 * palette while `accent` sat at the cyan `#22d3ee` that `globals.css:13-15`
 * retired — "released back to CYBER, where it means dynasty rather than
 * accent". Every share card, and therefore every link anyone posted, shipped a
 * colour the product had stopped using. It now carries the mark's own amber.
 *
 * Note what is NOT here: the burst violet. Ruling T-2 confines the logo purple
 * to the mark itself, and an OG card's text and rules are chrome, not mark.
 */

export const OG_COLORS = {
  voidDeep: '#06090d',
  void: '#0a1017',
  panelTop: '#121a24',
  accent: '#FDC805',
  accentLight: '#FDCE07',
  boneWhite: '#e6edf3',
  beige: '#94a3b8',
  scaleBlueLight: '#2b3b4d',
} as const;

/** Open Graph / Twitter summary_large_image card. */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** Apple touch icon. */
export const APPLE_ICON_SIZE = { width: 180, height: 180 } as const;

export const OG_CONTENT_TYPE = 'image/png';

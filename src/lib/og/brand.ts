/**
 * Shared constants for the generated share/app images (Constitution §11.4).
 *
 * These are the palette tokens already in tailwind.config.ts and
 * globals.css, restated as literals because `next/og` renders through
 * Satori with inline styles only — it cannot read Tailwind or CSS variables.
 * Keep them in step with the palette; do not invent new brand colours here.
 */

export const OG_COLORS = {
  voidDeep: '#06090d',
  void: '#0a1017',
  panelTop: '#121a24',
  accent: '#22d3ee',
  accentLight: '#67e8f9',
  boneWhite: '#e6edf3',
  beige: '#94a3b8',
  scaleBlueLight: '#2b3b4d',
} as const;

/** Open Graph / Twitter summary_large_image card. */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** Apple touch icon. */
export const APPLE_ICON_SIZE = { width: 180, height: 180 } as const;

export const OG_CONTENT_TYPE = 'image/png';

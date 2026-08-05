import type { CSSProperties } from 'react';
import type { DynastyId } from '@/shared/types/game';

/**
 * Shared game-screen colors. DOM cockpit CSS variables and Three.js arena
 * materials consume the same values so the two renderers feel authored as one
 * screen. Semantic gameplay colors do not change with dynasty.
 */
export const GAME_SCREEN_COLORS = {
  void: '#030609',
  graphiteDeep: '#070c12',
  graphite: '#0b121a',
  graphiteLifted: '#121d28',
  graphiteEdge: '#213143',
  // THE SLAB: the play surface is the top face of a stone tile, so it is a
  // dark SLATE rather than a void. It was #0c141d, which rendered at roughly
  // rgb(15,24,32) - close enough to the page backdrop that the board read as a
  // hole rather than as an object, and so close to black that a carved groove
  // had no room to be darker than the surface it is cut into. Lifting it one
  // step gives the engraving its shadow side back and costs the snake, the
  // food and the terrain nothing: solid terrain still renders about 2.9x
  // brighter than the surface it stands on.
  arenaFloor: '#16202a',
  gridMinor: '#496278',
  gridMajor: '#87bada',
  systemCyan: '#67e8f9',
  // INK & AMBER: secured value is the one amber. Gilded ground, banked
  // yield, the Daily Take, and every primary action are now one family.
  secureGold: '#ffc247',
  dangerRose: '#c9455e',
  bone: '#eef3f7',
  muted: '#8fa3b6',
} as const;

/**
 * THE SLAB - the arena's stone family.
 *
 * The board is one object: a fine slate tile with real thickness, a chamfered
 * edge, a raised rim, and the cell grid CARVED into its top face. These are
 * the albedos that object is cut from. They are deliberately narrow - every
 * one of them sits between `graphiteDeep` and `muted` in the shared palette,
 * so the tile stays in the same cool-slate family as the chassis language it
 * replaces and never becomes a second theme.
 *
 * `arenaFloor` above is the top face; it stays in GAME_SCREEN_COLORS because
 * it is the surface the whole game is read against, not merely a material.
 */
export const ARENA_STONE = {
  /** Cut edge. The one bright value: a chamfer exists to catch the key light. */
  bevel: '#4a5d6e',
  /** Side faces. Lighter than the top on purpose - polished face, raw body. */
  side: '#334252',
  /** Underside. Barely lit, and never the subject. */
  base: '#070c12',
  /** The rim/wall curb: the same stone, one step up from the side faces. */
  rim: '#26333f',
  /** The lit wall of a carved groove. */
  cut: '#7d94a8',
  /** The checker's tonal lift. A finish difference, not a colour. */
  checker: '#4a6178',
  /** The slab's float halo - light scattering under an object with no ground. */
  halo: '#4d6a82',
} as const;

/**
 * THE POP-OUT: how far the board's drawing surface overhangs its bay, per side.
 *
 * A canvas cannot paint outside its own element, so how far a twisted board can
 * reach is decided by this one number and nothing else. The surface is the bay
 * grown by 1 + 2 x this on both axes, which at 25% is 1.5x - enough to reach
 * the window edge at the common desktop and phone shapes, and enough for a
 * twisted board to paint over every HUD tray rather than stopping at them.
 *
 * IT IS PAIRED WITH `COCKPIT_FIT_SCALE` IN CameraRig, WHICH IS DERIVED FROM IT.
 * The board occupies FIT_MARGIN / fitScale of the canvas, so holding its
 * on-screen size while the canvas grows by G means multiplying the fit scale by
 * G. Raise this without that and the board breaks out of the tray AT REST,
 * which is the one thing the pop-out must never do. The two used to be separate
 * literals with a comment asking future editors to keep them in step; they are
 * now one source, so they cannot drift.
 *
 * Cost: the drawing surface is 1.5^2 = 2.25x the bay's area, i.e. roughly 2.25x
 * the fragment work at the same DPR. Both cockpit canvases cap DPR at 1.5 on
 * mobile and 2 on desktop, which is where that is paid for.
 */
export const COCKPIT_CANVAS_OVERHANG = 0.25;

/** The overhang as the CSS length `.arenaCanvasBleed` insets itself by. */
export const COCKPIT_CANVAS_OVERHANG_CSS = `${COCKPIT_CANVAS_OVERHANG * 100}%`;

/**
 * The inline style that hands the shared overhang to `.arenaCanvasBleed`.
 *
 * A module constant rather than an object literal at the call site: both
 * cockpits render this element, and an inline literal would be a new object
 * identity on every render for no reason.
 */
export const ARENA_BLEED_STYLE = {
  '--arena-overhang': COCKPIT_CANVAS_OVERHANG_CSS,
} as CSSProperties;

export interface DynastyScreenTokens {
  primary: string;
  secondary: string;
  ambientCss: string;
  snake: string;
}

export const DYNASTY_SCREEN_TOKENS: Record<DynastyId, DynastyScreenTokens> = {
  PRIMAL: {
    primary: '#91d653',
    secondary: '#c8f57d',
    ambientCss: 'rgba(101, 171, 54, 0.34)',
    snake: '#98e15a',
  },
  CYBER: {
    primary: '#35e6ff',
    secondary: '#ff63df',
    ambientCss: 'rgba(0, 213, 240, 0.3)',
    snake: '#2de7ff',
  },
  COSMIC: {
    primary: '#ad83ff',
    secondary: '#ffd86a',
    ambientCss: 'rgba(133, 85, 225, 0.34)',
    snake: '#b58cff',
  },
};

export function getDynastyScreenTokens(dynasty: DynastyId): DynastyScreenTokens {
  return DYNASTY_SCREEN_TOKENS[dynasty];
}

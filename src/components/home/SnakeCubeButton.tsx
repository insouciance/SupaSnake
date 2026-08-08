'use client';

/**
 * A HOME CONTROL, DRAWN AS ONE OF THE CREATURE'S CUBES.
 *
 * `snakeCubeArt.ts` decides what a segment looks like; this file decides what a
 * segment does when you press it, and nothing else. The split matters: the art
 * is a pure function of the shipped snake style and is unit-tested against
 * pixels measured off the real chamber, so the only thing that can drift here
 * is the interaction.
 *
 * ── THE PRESS IS THE BLOCK, IN THE CREATURE'S OWN MATERIAL ────────────────
 *
 * The product's press physics are unchanged and deliberately so: a hard
 * displaced block sits under the object, the object travels down-right into it
 * under the finger, and its own edge lands exactly where the block's edge was.
 * What changes is what the block is MADE of. It used to be a black rectangle
 * under a white one; it is now the cube's own silhouette in the cube's own
 * `down` band — the tone the character sheet already uses for everything the
 * light does not reach. A shadow that is a darker, more saturated member of the
 * object's hue is the fill ladder's standing rule, and here the creature has
 * already authored which member that is.
 *
 * Only ONE layer moves. The block is drawn once, offset, and left alone; the
 * face travels. Two layers animating against each other is how the old chip
 * got out of phase with its own shadow.
 *
 * ── THE GLYPH SITS ON THE FLAT FACE, BY GEOMETRY ──────────────────────────
 *
 * `art.face` is the largest rectangle inside the projected front face, so the
 * glyph is positioned off the drawing rather than nudged until it looked
 * centred. That is the kid-clear clause made structural: a label cannot be
 * eaten by a bevel band, because the bevel bands are not in the box it is
 * given. Percentages of the viewBox, so it holds at every button size.
 */

import { useId, type CSSProperties, type ReactNode } from 'react';
import {
  getSnakeCubeArt,
  getSnakeCubeBandColors,
  type CubeArt,
  type CubeArtOptions,
} from './snakeCubeArt';

/**
 * The custom properties a cube control needs on its own element.
 *
 * The block's colour is READ OFF THE ART rather than typed at the call site:
 * it is the cube's `down` band at the bottom of the cube, which is the darkest
 * value the creature's own palette authorises for this material. Recolour the
 * snake and the shadow follows without anybody remembering to.
 */
export function snakeCubeVars(options: CubeArtOptions = {}): CSSProperties {
  const bands = getSnakeCubeBandColors(options);
  return { '--cube-block': bands.down.to } as CSSProperties;
}

interface SnakeCubeSurfaceProps {
  readonly art: CubeArt;
  /** Distinguishes this instance's gradient ids inside one document. */
  readonly instanceId: string;
}

/** The lit cube: ink silhouette under the authored bands. */
function SnakeCubeSurface({ art, instanceId }: SnakeCubeSurfaceProps) {
  return (
    <svg
      viewBox={art.viewBox}
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {art.gradients.map((g) => (
          <linearGradient
            key={g.band}
            id={`${instanceId}-${g.band}`}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1={g.y0}
            x2="0"
            y2={g.y1}
          >
            <stop offset="0" stopColor={g.from} />
            <stop offset="1" stopColor={g.to} />
          </linearGradient>
        ))}
      </defs>
      {/* The outline pass. Filled AND stroked so the band reads as a line
          OUTSIDE the silhouette rather than eating into the colour — the same
          construction `markGeometry`'s ink layer uses, and the same one the
          inverted hull produces in three. */}
      <path
        d={art.ink.d}
        fill={art.ink.color}
        stroke={art.ink.color}
        strokeWidth={art.ink.strokeWidth}
        strokeLinejoin="round"
      />
      {art.facets.map((facet, i) => (
        <path
          key={i}
          d={facet.d}
          fill={`url(#${instanceId}-${facet.band})`}
          /* Hairline of its own colour: adjacent facets of a convex solid share
             an edge exactly, and two anti-aliased edges meeting on the same line
             leave a one-pixel seam of whatever is behind them. */
          stroke={`url(#${instanceId}-${facet.band})`}
          strokeWidth={0.006}
        />
      ))}
    </svg>
  );
}

export interface SnakeCubeChromeProps extends CubeArtOptions {
  readonly children?: ReactNode;
  /** Extra classes for the glyph box, e.g. a colour. */
  readonly glyphClassName?: string;
}

/**
 * The two drawn layers plus the glyph slot. Rendered inside whatever pressable
 * the call site owns, so this file never decides whether a control is a link or
 * a button.
 */
export function SnakeCubeChrome({
  children,
  glyphClassName = '',
  ...options
}: SnakeCubeChromeProps) {
  const instanceId = useId().replace(/:/g, '');
  const art = getSnakeCubeArt(options);
  const face = {
    left: `${((art.face.x - parseFloat(art.viewBox.split(' ')[0])) / art.width) * 100}%`,
    top: `${((art.face.y - parseFloat(art.viewBox.split(' ')[1])) / art.height) * 100}%`,
    width: `${(art.face.width / art.width) * 100}%`,
    height: `${(art.face.height / art.height) * 100}%`,
  };

  return (
    <>
      <span className="snake-cube__block" aria-hidden="true">
        <svg
          viewBox={art.viewBox}
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
          focusable="false"
          preserveAspectRatio="xMidYMid meet"
        >
          <path
            d={art.ink.d}
            fill="var(--cube-block)"
            stroke="var(--cube-block)"
            strokeWidth={art.ink.strokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="snake-cube__lift">
        <SnakeCubeSurface art={art} instanceId={instanceId} />
        <span
          className={`snake-cube__glyph ${glyphClassName}`}
          style={face}
        >
          {children}
        </span>
      </span>
    </>
  );
}

export default SnakeCubeChrome;

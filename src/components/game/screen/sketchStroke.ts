import * as THREE from 'three';
import { INK } from './inkAmber';

/**
 * SKETCH STROKE — a drawn line for the board, and the boil that makes it read
 * as drawn BY SOMEONE.
 *
 * The aim rails used to be flat planes with additive blending: a neon wash
 * whose brightness was decided by whatever was under it. Owner: "functionally
 * this is already perfect, it just looks a bit alien since we have our IP
 * style". Additive glow is the alien part — it is the one lighting model the
 * rest of this board refuses, because the board is INK and FILL and nothing
 * blooms.
 *
 * So a rail is drawn the way the rest of the surface is drawn:
 *
 *   A WOBBLY EDGE   the band's long edges are not straight. They ride two
 *                   sine waves whose periods are whole numbers of the canvas
 *                   width, so the texture tiles seamlessly along a rail of
 *                   any length while still wobbling at cell scale.
 *   AN INK EDGE     the same near-black the hull outlines use, laid down in
 *                   two slightly offset passes. One pass is a line; two
 *                   offset passes are a line drawn by a hand.
 *   A FLAT FILL     a wash inside the edge. Normal blending, so the rail
 *                   looks the same over the floor, over a wall and over the
 *                   snake, instead of getting brighter with each of them.
 *   THE BOIL        three frames, cycled at ~10fps. Hand-drawn animation
 *                   never holds a line perfectly still, and that shimmer is
 *                   the single strongest "this was drawn" signal there is —
 *                   stronger than any amount of texture, and nearly free.
 *
 * Everything here is generated into a canvas once per session and cached, in
 * the same spirit as the firefly's glow sprite.
 */

/** Frames in a boil cycle. Three is the classic; two reads as a flicker. */
export const SKETCH_BOIL_FRAMES = 3;

/** ~10fps. Faster reads as noise, slower reads as a mistake. */
export const SKETCH_BOIL_FPS = 10;

/**
 * Periods are integers so `wobble(0) === wobble(1)` and a `RepeatWrapping`
 * texture has no seam, however many times it repeats along a rail.
 */
function wobble(u: number, phase: number, amplitude: number): number {
  return (
    Math.sin(u * Math.PI * 2 * 3 + phase) * amplitude
    + Math.sin(u * Math.PI * 2 * 7 + phase * 1.7) * amplitude * 0.45
  );
}

function edgePath(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  phase: number,
  amplitude: number
): void {
  const steps = 64;
  const inset = amplitude * 2;
  ctx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const x = u * width;
    const y = inset + wobble(u, phase, amplitude);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = steps; i >= 0; i -= 1) {
    const u = i / steps;
    const x = u * width;
    const y = height - inset + wobble(u, phase + 2.1, amplitude);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function makeCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toTexture(canvas: HTMLCanvasElement, repeat: boolean): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
  }
  texture.anisotropy = 4;
  return texture;
}

/**
 * One frame of a rail: a horizontal band. The COLUMN rail reuses this by
 * spinning its mesh a quarter turn in the board plane rather than by baking a
 * second, vertical set — the same stroke, seen the other way round, which is
 * also what a person drawing it would do.
 */
function drawRailFrame(fill: string, phase: number): HTMLCanvasElement | null {
  const width = 256;
  const height = 64;
  const canvas = makeCanvas(width, height);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const amplitude = 4.4;
  ctx.clearRect(0, 0, width, height);

  /*
   * THE EDGE IS OPAQUE AND THE FILL IS NOT, and that difference is baked HERE
   * rather than left to the material. A material opacity scales every texel
   * equally, so an ink edge inside a 34%-opacity rail is a 34% ink edge — a
   * wash with a slightly darker rim, which is exactly what a drawn line is
   * not. Bake the wash into the alpha, keep the line at full strength, and
   * the rail reads as a confident stroke containing a tint.
   */
  edgePath(ctx, width, height, phase, amplitude);
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Two offset passes: a hand does not put the line down once.
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 4.5;
  ctx.stroke();
  ctx.save();
  ctx.translate(0.9, -0.7);
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 2.4;
  edgePath(ctx, width, height, phase + 0.6, amplitude * 0.8);
  ctx.stroke();
  ctx.restore();

  return canvas;
}

/**
 * The snapped current cell: a square patch, drawn the same way and NOT tiled.
 * Its corners are deliberately imperfect — a hand-drawn square that closes
 * where it started is the one thing a hand-drawn square never does.
 */
function drawCellFrame(fill: string, phase: number): HTMLCanvasElement | null {
  const size = 128;
  const canvas = makeCanvas(size, size);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const amplitude = 3.4;
  const inset = 12;
  const steps = 22;
  const span = size - inset * 2;

  const trace = (drift: number) => {
    ctx.beginPath();
    for (let side = 0; side < 4; side += 1) {
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const wob = wobble(t, phase + side * 1.3 + drift, amplitude);
        let x = 0;
        let y = 0;
        if (side === 0) { x = inset + t * span; y = inset + wob; }
        else if (side === 1) { x = size - inset + wob; y = inset + t * span; }
        else if (side === 2) { x = size - inset - t * span; y = size - inset + wob; }
        else { x = inset + wob; y = size - inset - t * span; }
        if (side === 0 && i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  };

  ctx.clearRect(0, 0, size, size);
  trace(0);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2.8;
  ctx.translate(1.1, 0.8);
  trace(0.9);
  ctx.stroke();
  ctx.restore();

  return canvas;
}

type Cache = Map<string, THREE.CanvasTexture[]>;
const cache: Cache = new Map();

function boil(
  key: string,
  draw: (fill: string, phase: number) => HTMLCanvasElement | null,
  fill: string,
  repeat: boolean
): THREE.CanvasTexture[] {
  const cached = cache.get(key);
  if (cached) return cached;
  const frames: THREE.CanvasTexture[] = [];
  for (let frame = 0; frame < SKETCH_BOIL_FRAMES; frame += 1) {
    const canvas = draw(fill, (frame / SKETCH_BOIL_FRAMES) * Math.PI * 2);
    if (canvas) frames.push(toTexture(canvas, repeat));
  }
  cache.set(key, frames);
  return frames;
}

/** Three tiling frames of a drawn rail, cached per fill colour. */
export function getSketchRailBoil(fill: string): THREE.CanvasTexture[] {
  return boil(`rail:${fill}`, drawRailFrame, fill, true);
}

/** Three frames of a drawn cell patch, cached per fill colour. */
export function getSketchCellBoil(fill: string): THREE.CanvasTexture[] {
  return boil(`cell:${fill}`, drawCellFrame, fill, false);
}

/** Which boil frame a given elapsed time lands on. */
export function boilFrameAt(seconds: number): number {
  return Math.floor(seconds * SKETCH_BOIL_FPS) % SKETCH_BOIL_FRAMES;
}

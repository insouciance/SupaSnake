'use client';

/**
 * PerfHUD - dev-only render-performance overlay (?perf query flag).
 *
 * Reads renderer stats (gl.info) and frame timing from inside the Canvas
 * and reports draw calls, triangles, frame-time EMA, and p95 over a ring
 * buffer. Budgets (from the AAA rework plan): desktop draw calls <= 60 and
 * p95 <= 16.7ms; mobile p95 <= 33ms at dpr 1.5.
 *
 * Fluidity discipline: the per-frame path only writes numbers into
 * preallocated Float32Arrays; the DOM is touched at most once per second
 * through a ref (no React state, no reconciliation).
 */

import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { TickJitterMeter } from '@/lib/game/runInstruments';

/** Frames kept for the p95 window (~4s at 60fps). */
const RING_SIZE = 240;
/** EMA smoothing factor per frame. */
const EMA_ALPHA = 0.05;
/** Minimum ms between DOM writes. */
const REPORT_INTERVAL_MS = 1000;

export function PerfHUD({
  jitterRef,
}: {
  /**
   * ET-0 tick-jitter meter. Optional so the HUD still renders on surfaces
   * that have no engine loop (the cockpit fixtures), where frame stats are
   * the only thing there is to show.
   */
  jitterRef?: RefObject<TickJitterMeter>;
} = {}) {
  const gl = useThree((state) => state.gl);

  const ringRef = useRef<Float32Array | null>(null);
  const sortScratchRef = useRef<Float32Array | null>(null);
  if (ringRef.current === null) {
    ringRef.current = new Float32Array(RING_SIZE);
    sortScratchRef.current = new Float32Array(RING_SIZE);
  }
  const writeIndexRef = useRef(0);
  const filledRef = useRef(0);
  const emaRef = useRef(16.7);
  const lastFrameAtRef = useRef(0);
  const lastReportAtRef = useRef(0);
  const lastCallsRef = useRef(0);
  const lastTrianglesRef = useRef(0);
  const elementRef = useRef<HTMLDivElement | null>(null);

  // EffectComposer resets gl.info on every pass, which would leave only
  // the final fullscreen quad visible here. Turn autoReset off and reset
  // manually each frame so the numbers cover the WHOLE frame (all passes).
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);

  // The overlay is a plain DOM node managed imperatively - it must never
  // participate in React renders (that would perturb the numbers it shows).
  useEffect(() => {
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'perf-hud');
    el.style.cssText =
      'position:fixed;left:8px;bottom:8px;z-index:9999;padding:6px 10px;' +
      'background:rgba(4,8,12,0.85);border:1px solid rgba(125,249,255,0.4);' +
      'border-radius:6px;color:#7df9ff;font:11px/1.5 ui-monospace,monospace;' +
      'pointer-events:none;white-space:pre;';
    el.textContent = 'perf: warming up...';
    document.body.appendChild(el);
    elementRef.current = el;
    return () => {
      el.remove();
      elementRef.current = null;
    };
  }, []);

  useFrame(() => {
    // gl.info now holds the FULL previous frame (autoReset disabled):
    // capture it, then reset for the frame about to render.
    lastCallsRef.current = gl.info.render.calls;
    lastTrianglesRef.current = gl.info.render.triangles;
    gl.info.reset();

    const now = performance.now();
    const lastFrameAt = lastFrameAtRef.current;
    lastFrameAtRef.current = now;
    if (lastFrameAt === 0) return;

    const dt = now - lastFrameAt;
    const ring = ringRef.current!;
    ring[writeIndexRef.current] = dt;
    writeIndexRef.current = (writeIndexRef.current + 1) % RING_SIZE;
    filledRef.current = Math.min(filledRef.current + 1, RING_SIZE);
    emaRef.current += (dt - emaRef.current) * EMA_ALPHA;

    if (now - lastReportAtRef.current < REPORT_INTERVAL_MS) return;
    lastReportAtRef.current = now;

    const el = elementRef.current;
    if (!el) return;

    const filled = filledRef.current;
    const scratch = sortScratchRef.current!;
    scratch.set(ring);
    const window = scratch.subarray(0, filled);
    window.sort();
    const p95 = window[Math.min(filled - 1, Math.floor(filled * 0.95))];

    // ET-0 tick jitter. The frame numbers above describe the RENDERER; these
    // describe the appointment the game is actually kept by. They are read
    // from the meter rather than measured here on purpose - the engine's tick
    // does not happen on a frame, and sampling it from useFrame would measure
    // the sampler.
    const jitter = jitterRef?.current?.summary();
    const jitterLine =
      jitter && jitter.count > 0
        ? `tick +${(jitter.p50Ms ?? 0).toFixed(1)}/${(jitter.p99Ms ?? 0).toFixed(
            1
          )}/${(jitter.maxMs ?? 0).toFixed(1)}ms p50/p99/max\n` +
          `tps ${(jitter.realizedTicksPerSecond ?? 0).toFixed(2)}  worst gap ${(
            jitter.worstGapMs ?? 0
          ).toFixed(0)}ms @${(jitter.worstGapScheduledMs ?? 0).toFixed(0)}ms\n`
        : 'tick: no samples\n';

    el.textContent =
      `draws ${lastCallsRef.current}  tris ${lastTrianglesRef.current}\n` +
      `frame ${emaRef.current.toFixed(1)}ms  p95 ${p95.toFixed(1)}ms\n` +
      jitterLine +
      `fps ~${(1000 / Math.max(emaRef.current, 0.001)).toFixed(0)}  dpr ${gl
        .getPixelRatio()
        .toFixed(2)}`;
  });

  return null;
}

export default PerfHUD;

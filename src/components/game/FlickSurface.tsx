'use client';

/**
 * FlickSurface - full-viewport flick-anywhere touch control layer.
 *
 * Mounted while playing on touch devices in "flick" control mode. Sits in a
 * dedicated z-band ABOVE the 3D canvas and BELOW the HUD (z-10+), so all HUD
 * buttons keep receiving their own pointer events; an isInteractiveTarget
 * check additionally rejects any pointerdown that lands on a button/link
 * that shares the surface's stacking context.
 *
 * Orientation freeze: the CameraRig azimuth is sampled ONCE per touch, at
 * pointerdown, and quantized to the snapped side. Every flick in that touch
 * (including chained flicks) maps through the frozen quadrant, so a camera
 * snap animating mid-gesture can never change what a flick means. Per-touch
 * (rather than per-flick-start) freezing is deliberate: within one touch the
 * finger motion is a single planned phrase - re-sampling between chained
 * flicks could make identical strokes mean different things mid-chain.
 * Camera azimuth only changes while the player is dragging the camera, and
 * the surface owns all touches while mounted, so per-touch freezing costs
 * nothing in practice.
 *
 * Feedback per engine result (see flickControl.feedbackForResult):
 * - accepted: light haptic + direction-change tick + cyan edge pulse on the
 *   flicked screen side
 * - reversal / queue_full: silent red edge flash - the input was seen but
 *   the engine refused it
 * - duplicate: nothing (the snake already does what was asked)
 *
 * Performance: the recognizer is allocation-free per move; handlers are
 * stable (all mutable state lives in refs); edge pulses animate via WAAPI
 * on pre-rendered divs, no React re-render per flick.
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  SnakeGameLogic,
  type Direction,
  type SetDirectionResult,
} from '@/lib/game/SnakeGameLogic';
import {
  FlickRecognizer,
  type FlickCommand,
  type ScreenFlickDirection,
} from '@/lib/input/flickRecognizer';
import { azimuthToQuadrant, mapFlickToWorld, mapWorldToScreen } from '@/lib/input/flickMapper';
import {
  feedbackForResult,
  isInteractiveTarget,
  recordDebugEvent,
  type InputDebugState,
} from '@/lib/input/flickControl';
import { haptics } from '@/lib/effects/Haptics';
import { audioManager } from '@/lib/audio/AudioManager';
import { useGameStore } from '@/lib/store/gameStore';

interface FlickSurfaceProps {
  gameRef: RefObject<SnakeGameLogic | null>;
  /** Reads the CameraRig's live azimuth (radians). Must be stable. */
  getAzimuth: () => number;
  /** Ready phase: the first flick starts the run. */
  isReady: boolean;
  /**
   * Owns the first ready/gated direction. It queues a safe command before
   * starting or resuming and leaves the board held when the command is unsafe.
   */
  onReadyDirection: (direction: Direction) => SetDirectionResult;
  /** Called after an accepted input so the aim telegraph updates instantly. */
  onAim: () => void;
  /** Debug sink for ?debug=input; current === null means no recording. */
  debugRef?: RefObject<InputDebugState | null>;
}

/** Edge pulse geometry: which screen edge lights up for each flick. */
const EDGE_CLASS: Record<ScreenFlickDirection, string> = {
  UP: 'top-0 left-0 right-0 h-20',
  DOWN: 'bottom-0 left-0 right-0 h-20',
  LEFT: 'left-0 top-0 bottom-0 w-16',
  RIGHT: 'right-0 top-0 bottom-0 w-16',
};

const EDGE_GRADIENT_DIR: Record<ScreenFlickDirection, string> = {
  UP: 'to bottom',
  DOWN: 'to top',
  LEFT: 'to right',
  RIGHT: 'to left',
};

/** rgb triplets: accept = electric cyan token, reject = strike-red token */
const GLOW_RGB = { accept: '34, 211, 238', reject: '244, 63, 94' } as const;
const GLOW_PEAK = { accept: 0.5, reject: 0.55 } as const;
const GLOW_DURATION_MS = 180;

const SCREEN_DIRS: readonly ScreenFlickDirection[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

export function FlickSurface({
  gameRef,
  getAzimuth,
  isReady,
  onReadyDirection,
  onAim,
  debugRef,
}: FlickSurfaceProps) {
  const recognizerRef = useRef<FlickRecognizer | null>(null);
  if (recognizerRef.current === null) {
    recognizerRef.current = new FlickRecognizer();
  }

  /** Camera quadrant frozen at pointerdown for the whole touch. */
  const quadrantRef = useRef<0 | 1 | 2 | 3>(0);
  /** The single pointer driving input; extra touches are ignored. */
  const activePointerRef = useRef<number | null>(null);
  const edgeRefs = useRef<Partial<Record<ScreenFlickDirection, HTMLDivElement | null>>>({});

  // Latest volatile props behind stable refs so handlers never re-bind.
  const stateRef = useRef({ isReady, onReadyDirection, onAim, getAzimuth });
  useEffect(() => {
    stateRef.current.isReady = isReady;
    stateRef.current.onReadyDirection = onReadyDirection;
    stateRef.current.onAim = onAim;
    stateRef.current.getAzimuth = getAzimuth;
  }, [isReady, onReadyDirection, onAim, getAzimuth]);

  const pulseEdge = useCallback(
    (side: ScreenFlickDirection, kind: 'accept' | 'reject') => {
      const el = edgeRefs.current[side];
      if (!el || typeof el.animate !== 'function') return;
      el.style.background = `linear-gradient(${EDGE_GRADIENT_DIR[side]}, rgba(${GLOW_RGB[kind]}, ${GLOW_PEAK[kind]}), rgba(${GLOW_RGB[kind]}, 0) 75%)`;
      el.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: GLOW_DURATION_MS, easing: 'ease-out' }
      );
    },
    []
  );

  const executeCommand = useCallback(
    (cmd: FlickCommand) => {
      const game = gameRef.current;
      if (!game) return;

      const world = mapFlickToWorld(cmd.direction, quadrantRef.current);

      // Ready/gated input is owned atomically by the page: it validates and
      // queues this direction before allowing the first tick.
      const result: SetDirectionResult = stateRef.current.isReady
        ? stateRef.current.onReadyDirection(world)
        : game.setDirection(world);
      const feedback = feedbackForResult(result);

      if (feedback.haptic) haptics.light();
      if (feedback.sound) audioManager.play('directionChange');
      if (feedback.glow) pulseEdge(cmd.direction, feedback.glow);
      if (result === 'accepted') stateRef.current.onAim();

      const debug = debugRef?.current;
      if (debug) {
        recordDebugEvent(debug, {
          kind: 'flick',
          dir: cmd.direction,
          detail: `world ${world}`,
          time: cmd.inputTime,
        });
        if (result !== 'accepted') {
          recordDebugEvent(debug, {
            kind: 'reject',
            dir: world,
            detail: result,
            time: cmd.inputTime,
          });
        }
      }
    },
    [gameRef, debugRef, pulseEdge]
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerRef.current !== null) return; // first touch wins
      if (isInteractiveTarget(e.target)) return; // never steal UI taps
      activePointerRef.current = e.pointerId;
      // Freeze the camera orientation for this whole touch (see header).
      quadrantRef.current = azimuthToQuadrant(stateRef.current.getAzimuth());
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer already gone (raced cancel) - move/up guards handle it
      }
      recognizerRef.current!.pointerDown(e.clientX, e.clientY, e.timeStamp);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerId !== activePointerRef.current) return;
      const cmd = recognizerRef.current!.pointerMove(e.clientX, e.clientY, e.timeStamp);
      if (cmd) executeCommand(cmd);
    },
    [executeCommand]
  );

  const handlePointerEnd = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerId !== activePointerRef.current) return;
      activePointerRef.current = null;
      recognizerRef.current!.pointerUp();
    },
    []
  );

  return (
    <div
      data-testid="flick-surface"
      className="absolute inset-0 z-[5] select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {/* Directional ack pulses - one pre-rendered strip per screen edge,
          driven imperatively via WAAPI (no re-render per flick) */}
      {SCREEN_DIRS.map((side) => (
        <div
          key={side}
          ref={(el) => {
            edgeRefs.current[side] = el;
          }}
          className={`absolute pointer-events-none opacity-0 ${EDGE_CLASS[side]}`}
        />
      ))}

      <QueuedTurnsChip getAzimuth={getAzimuth} />
    </div>
  );
}

/** Chevron rotation for screen-space arrows (SVG points up at 0deg). */
const ARROW_ROTATION: Record<ScreenFlickDirection, number> = {
  UP: 0,
  RIGHT: 90,
  DOWN: 180,
  LEFT: 270,
};

/** Queue slots fade with distance from execution (front = next tick). */
const SLOT_OPACITY = [1, 0.6, 0.35];

/**
 * Minimal HUD chip showing the engine's queued turns (1-3 arrows), mapped
 * from absolute world directions back into the player's CURRENT view so the
 * arrows always match what is on screen. Rendered only while the queue is
 * non-empty; queuedDirections is already synced per tick + per input by the
 * game page, so this subscribes to existing store traffic.
 */
function QueuedTurnsChip({ getAzimuth }: { getAzimuth: () => number }) {
  const queuedDirections = useGameStore((s) => s.queuedDirections);
  if (queuedDirections.length === 0) return null;

  const quadrant = azimuthToQuadrant(getAzimuth());

  return (
    <div
      data-testid="queued-turns"
      className="absolute left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-1.5 px-2.5 py-1.5 rounded-arcade border border-scale-blue-light/50 bg-void/70 backdrop-blur-sm"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
    >
      {queuedDirections.map((dir, i) => (
        <svg
          key={i}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: `rotate(${ARROW_ROTATION[mapWorldToScreen(dir, quadrant)]}deg)`,
            opacity: SLOT_OPACITY[i] ?? 0.35,
          }}
        >
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      ))}
    </div>
  );
}

export default FlickSurface;

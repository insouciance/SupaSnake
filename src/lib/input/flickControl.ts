/**
 * FlickControl - pure, DOM-light helpers behind the FlickSurface component.
 *
 * Extracted from the component so the decision logic (which pointerdowns the
 * surface must ignore, which feedback each engine result triggers, debug
 * event bookkeeping) is unit-testable without rendering React or a canvas.
 */

import type { SetDirectionResult } from '@/lib/game/SnakeGameLogic';
import type { ScreenFlickDirection } from './flickRecognizer';

/** Selector for elements whose pointerdowns the flick surface must ignore. */
export const INTERACTIVE_TARGET_SELECTOR = 'button,a,[role=button]';

/**
 * True when a pointer event target is (or is inside) an interactive element
 * such as the pause button or an overlay link. The surface renders beneath
 * the HUD z-order so these normally never reach it - this check is the
 * belt-and-braces guard for any element that shares or falls through the
 * surface's stacking context.
 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return target.closest(INTERACTIVE_TARGET_SELECTOR) !== null;
}

/** Feedback plan for one engine result - consumed by the surface. */
export interface FlickFeedback {
  /** Trigger haptics.light() */
  haptic: boolean;
  /** Play the already-synthesized direction-change tick */
  sound: boolean;
  /** Edge pulse: confirm (cyan, flicked side) / reject (red) / none */
  glow: 'accept' | 'reject' | null;
}

const FEEDBACK: Record<SetDirectionResult, FlickFeedback> = {
  // Spec: the player must always know a command was queued.
  accepted: { haptic: true, sound: true, glow: 'accept' },
  // Rejections the player should SEE (input registered, engine said no):
  // no haptic - the buzz is reserved for "it counted".
  reversal: { haptic: false, sound: false, glow: 'reject' },
  queue_full: { haptic: false, sound: false, glow: 'reject' },
  // Duplicate = "keep going the way you're going": the world already shows
  // exactly what was asked for, so extra feedback would only add noise.
  duplicate: { haptic: false, sound: false, glow: null },
  // Not playing / paused: surface is unmounted in these states anyway.
  inactive: { haptic: false, sound: false, glow: null },
};

/** Map an engine setDirection result to the feedback it should produce. */
export function feedbackForResult(result: SetDirectionResult): FlickFeedback {
  return FEEDBACK[result];
}

/* ------------------------------------------------------------------ */
/* Debug instrumentation (?debug=input)                                */
/* ------------------------------------------------------------------ */

export interface InputDebugEvent {
  kind: 'flick' | 'reject' | 'exec';
  /** Direction label (screen dir for flicks, world dir for exec). */
  dir: string;
  /** Extra detail: world direction for flicks, rejection reason, etc. */
  detail: string;
  /** Event/exec timestamp (ms). */
  time: number;
}

export const DEBUG_RING_SIZE = 8;

/**
 * Mutable debug state held in a ref by the game page. Created only when the
 * ?debug=input flag is present - absent flag means no object, no recording,
 * zero cost.
 */
export interface InputDebugState {
  lastFlick: InputDebugEvent | null;
  lastRejection: InputDebugEvent | null;
  lastExec: InputDebugEvent | null;
  /** Ring buffer of the last DEBUG_RING_SIZE events, oldest overwritten. */
  ring: (InputDebugEvent | null)[];
  writeIdx: number;
}

export function createInputDebugState(): InputDebugState {
  return {
    lastFlick: null,
    lastRejection: null,
    lastExec: null,
    ring: new Array<InputDebugEvent | null>(DEBUG_RING_SIZE).fill(null),
    writeIdx: 0,
  };
}

/** Record one event into the ring buffer + the per-kind "last" slots. */
export function recordDebugEvent(
  state: InputDebugState,
  event: InputDebugEvent
): void {
  state.ring[state.writeIdx] = event;
  state.writeIdx = (state.writeIdx + 1) % DEBUG_RING_SIZE;
  if (event.kind === 'flick') state.lastFlick = event;
  else if (event.kind === 'reject') state.lastRejection = event;
  else state.lastExec = event;
}

/** Events in chronological order (oldest first), nulls skipped. */
export function debugEventsInOrder(state: InputDebugState): InputDebugEvent[] {
  const out: InputDebugEvent[] = [];
  for (let i = 0; i < DEBUG_RING_SIZE; i++) {
    const e = state.ring[(state.writeIdx + i) % DEBUG_RING_SIZE];
    if (e) out.push(e);
  }
  return out;
}

/** Screen-direction arrow glyphs shared by the debug overlay + HUD chip. */
export const SCREEN_DIR_GLYPHS: Record<ScreenFlickDirection, string> = {
  UP: '↑',
  DOWN: '↓',
  LEFT: '←',
  RIGHT: '→',
};

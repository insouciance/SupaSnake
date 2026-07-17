/**
 * FlickRecognizer - pure, deterministic micro-flick gesture recognition.
 *
 * Feeds on raw pointer samples (down/move/up with event timestamps) and emits
 * exactly one screen-direction command per deliberate flick segment:
 *
 * - a command fires the moment displacement from the segment origin crosses
 *   the threshold (never waits for release)
 * - after a command, the origin resets to the current finger position so a
 *   chained flick in a NEW direction can fire immediately
 * - a continued long movement in the SAME direction does not re-fire: the
 *   origin trails the finger, and the same direction re-arms only after a
 *   deliberate segment break - a brief stall (low movement over a short
 *   window) or an emitted direction change
 * - all decisions use event timestamps and positions only: no timers, no
 *   animation frames, frame-rate independent, no per-move allocations
 *
 * Thresholds are configured in CSS pixels (density-independent by
 * definition); callers may scale for coarse pointers if desired.
 */

export type ScreenFlickDirection = 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';

export type FlickRejectionReason =
  | 'same_direction_not_rearmed'
  | 'below_threshold';

export interface FlickCommand {
  direction: ScreenFlickDirection;
  /** Event timestamp (ms) at which the threshold was crossed. */
  inputTime: number;
}

export interface FlickRecognizerConfig {
  /** Displacement (CSS px) from segment origin that triggers a command. */
  thresholdPx: number;
  /** Movement under this many px within stallWindowMs counts as a stall. */
  stallPx: number;
  /** Window (ms) of low movement that re-arms the same direction. */
  stallWindowMs: number;
}

export const DEFAULT_FLICK_CONFIG: FlickRecognizerConfig = {
  // ~7mm on a typical ~96dpi-equivalent CSS pixel grid - short but deliberate
  thresholdPx: 26,
  stallPx: 6,
  stallWindowMs: 90,
};

export class FlickRecognizer {
  private readonly config: FlickRecognizerConfig;

  private active = false;
  private originX = 0;
  private originY = 0;
  private lastX = 0;
  private lastY = 0;
  private lastMoveTime = 0;
  /** Direction of the last emitted command in this touch, if not re-armed. */
  private unarmedDirection: ScreenFlickDirection | null = null;
  /** Anchor for stall detection: position/time of the last "fast" sample. */
  private stallAnchorX = 0;
  private stallAnchorY = 0;
  private stallAnchorTime = 0;

  constructor(config: FlickRecognizerConfig = DEFAULT_FLICK_CONFIG) {
    this.config = config;
  }

  /** Begin a touch. Resets all segment state. */
  pointerDown(x: number, y: number, time: number): void {
    this.active = true;
    this.originX = x;
    this.originY = y;
    this.lastX = x;
    this.lastY = y;
    this.lastMoveTime = time;
    this.unarmedDirection = null;
    this.stallAnchorX = x;
    this.stallAnchorY = y;
    this.stallAnchorTime = time;
  }

  /**
   * Feed a movement sample. Returns a command when a flick segment
   * completes, otherwise null. Never allocates unless a command fires.
   */
  pointerMove(x: number, y: number, time: number): FlickCommand | null {
    if (!this.active) return null;

    this.lastX = x;
    this.lastY = y;
    this.lastMoveTime = time;

    // Stall detection re-arms the same direction: if the finger has moved
    // less than stallPx since the stall anchor and the window elapsed, the
    // player deliberately paused - a new same-direction segment may begin.
    const stallDx = x - this.stallAnchorX;
    const stallDy = y - this.stallAnchorY;
    const stallDistSq = stallDx * stallDx + stallDy * stallDy;
    const stallLimitSq = this.config.stallPx * this.config.stallPx;
    if (stallDistSq > stallLimitSq) {
      // Still moving fast - advance the anchor.
      this.stallAnchorX = x;
      this.stallAnchorY = y;
      this.stallAnchorTime = time;
    } else if (
      this.unarmedDirection !== null &&
      time - this.stallAnchorTime >= this.config.stallWindowMs
    ) {
      this.unarmedDirection = null;
      // A deliberate new segment starts where the stall happened.
      this.originX = x;
      this.originY = y;
    }

    const dx = x - this.originX;
    const dy = y - this.originY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const threshold = this.config.thresholdPx;

    if (adx < threshold && ady < threshold) return null;

    const direction: ScreenFlickDirection =
      adx >= ady ? (dx > 0 ? 'RIGHT' : 'LEFT') : dy > 0 ? 'DOWN' : 'UP';

    if (direction === this.unarmedDirection) {
      // Long continued movement in the emitted direction: trail the origin
      // so displacement stays pinned at the threshold edge (no re-fire, and
      // a subsequent direction change measures from "here").
      if (adx >= ady) {
        this.originX = x - Math.sign(dx) * (threshold - 1);
        this.originY = y;
      } else {
        this.originX = x;
        this.originY = y - Math.sign(dy) * (threshold - 1);
      }
      return null;
    }

    // Command fires immediately on threshold crossing.
    this.unarmedDirection = direction;
    this.originX = x;
    this.originY = y;
    this.stallAnchorX = x;
    this.stallAnchorY = y;
    this.stallAnchorTime = time;
    return { direction, inputTime: time };
  }

  /** End the touch. The next touch starts a fresh segment. */
  pointerUp(): void {
    this.active = false;
    this.unarmedDirection = null;
  }

  /** Whether a touch is currently active (for debug instrumentation). */
  get isActive(): boolean {
    return this.active;
  }
}

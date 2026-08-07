/**
 * ET-5 camera surveyor - the wire between the probe and the tray.
 *
 * The probe lives inside the r3f Canvas (it needs the camera and the viewport
 * every frame); the tray is ordinary DOM outside it. They are joined by this
 * module-level channel rather than by React state, because the readout updates
 * EVERY FRAME and this codebase is removing React from hot paths - a per-frame
 * `setState` here would be a new one.
 *
 * So: the tray registers its text nodes, the probe writes `textContent` into
 * them directly, and a write that would not change the text is skipped. React
 * renders the tray exactly once (plus once per click on a button).
 *
 * Commands travel the other way through the same object: the tray parks one,
 * the probe consumes it on the next frame - again with no re-render, and with
 * the camera work happening where the camera actually is.
 *
 * Dev-only. Reached solely through the dev-gated dynamic import in
 * `src/app/game/page.tsx`; nothing imports it from a production path.
 */

import {
  formatReadoutSlots,
  gradeLegibility,
  type CameraSurveyorReadout,
  type CameraSurveyorSlot,
} from './cameraSurveyorReadout';

/**
 * A viewpoint the tray can ask for.
 *
 * `polarDeg: null` means "the shipped default pitch", which is what RESET is:
 * default azimuth, default pitch, auto-fit distance, target at board centre.
 * The quick-sets are the same move with a different pitch, so a candidate is
 * always reached from an identical, reproducible framing rather than from
 * wherever the last drag happened to leave the camera.
 */
export interface CameraSurveyorCommand {
  kind: 'pose';
  polarDeg: number | null;
}

const elements = new Map<CameraSurveyorSlot, HTMLElement>();
const written = new Map<CameraSurveyorSlot, string>();
let pendingCommand: CameraSurveyorCommand | null = null;
let parameterLine = '';

/** Ref callback target: register on mount, drop on unmount. */
export function bindSlot(slot: CameraSurveyorSlot, element: HTMLElement | null): void {
  if (element) {
    elements.set(slot, element);
  } else {
    elements.delete(slot);
    written.delete(slot);
  }
}

/** Per-frame entry point. Writes only what changed. */
export function publishReadout(readout: CameraSurveyorReadout): void {
  const slots = formatReadoutSlots(readout);
  parameterLine = slots.line;
  for (const [slot, text] of Object.entries(slots) as [CameraSurveyorSlot, string][]) {
    if (written.get(slot) === text) continue;
    const element = elements.get(slot);
    if (!element) continue;
    element.textContent = text;
    written.set(slot, text);
  }
  const meter = elements.get('legibility');
  if (meter) {
    const grade = gradeLegibility(readout.legibility);
    if (meter.dataset.grade !== grade) meter.dataset.grade = grade;
  }
}

/** The line a COPY click puts on the clipboard. */
export function currentParameterLine(): string {
  return parameterLine;
}

export function queueCommand(command: CameraSurveyorCommand): void {
  pendingCommand = command;
}

/** Consume-once: the probe applies a command on exactly one frame. */
export function takeCommand(): CameraSurveyorCommand | null {
  const command = pendingCommand;
  pendingCommand = null;
  return command;
}

/** Unmount hygiene - a stale element must never be written to. */
export function resetChannel(): void {
  elements.clear();
  written.clear();
  pendingCommand = null;
  parameterLine = '';
}

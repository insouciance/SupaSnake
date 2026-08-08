/**
 * ChamberPlaceholder - static gradient backdrop shown beneath (and before)
 * the Specimen Chamber canvas. Reserves the full-viewport space so the
 * 3D scene mounting causes zero layout shift, and gives fresh visitors an
 * atmosphere-correct room while the chamber streams in.
 *
 * IT MATCHES THE CHAMBER, AND THAT IS THE WHOLE JOB.
 *
 * The rule this file exists to enforce has never changed, and it has now
 * survived being pointed at two opposite rooms: whatever the chamber is, THIS
 * is that, so the canvas fading in over it is a sharpening and never a change
 * of room. A placeholder that disagrees with its canvas produces a flash on
 * the one frame of the product a new visitor is guaranteed to see — it was a
 * black flash before a bright scene once, and it would be a bright flash
 * before a dark one now if these stops were left behind.
 *
 * The stops below are the chamber's own night values (`ROOM_LAMP` / `ROOM` /
 * `ROOM_EDGE` / `ROOM_SHADOW` in `SpecimenChamber.tsx`, and the
 * `--fill-room-*` ladder in `globals.css` that carries their reasoning).
 *
 * They are duplicated rather than imported on purpose: this component must
 * render without pulling three.js into the first paint, and that is the entire
 * reason it exists. `ChamberPlaceholder.test.tsx` pins the two files together
 * so the copies cannot drift.
 */

/**
 * Exported so it can be asserted directly: jsdom's CSS parser drops a
 * multi-gradient `background` shorthand entirely, so a test reading the
 * rendered style would read an empty string and pass on any value at all.
 */
export const CHAMBER_PLACEHOLDER_BACKGROUND =
  // the lamp, high and behind where the head will be
  'radial-gradient(ellipse 70% 50% at 50% 30%, #345a82 0%, rgba(52, 90, 130, 0) 70%), ' +
  // the contact shadow the specimen will stand in
  'radial-gradient(ellipse 45% 18% at 50% 74%, rgba(5, 12, 20, 0.55) 0%, transparent 70%), ' +
  // the room: lit at the centre, turning away at the edges
  'radial-gradient(ellipse 120% 100% at 50% 40%, #1a3049 0%, #1a3049 45%, #0e1c2c 100%)';

export function ChamberPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      data-testid="home-chamber-placeholder"
      style={{ background: CHAMBER_PLACEHOLDER_BACKGROUND }}
    />
  );
}

export default ChamberPlaceholder;

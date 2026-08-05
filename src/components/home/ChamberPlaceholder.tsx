/**
 * ChamberPlaceholder - static gradient backdrop shown beneath (and before)
 * the Specimen Chamber canvas. Reserves the full-viewport space so the
 * 3D scene mounting causes zero layout shift, and gives fresh visitors an
 * atmosphere-correct room while the chamber streams in.
 *
 * IT MATCHES THE CHAMBER, AND THAT IS THE WHOLE JOB.
 *
 * This used to be the old dark void, held over from a dark chamber. Against
 * the bright chamber it became a black flash on every first paint - the one
 * frame of the product a new visitor is guaranteed to see, rendering the one
 * colour the owner has ruled out twice. The stops below are the chamber's own
 * paper values (`PAPER` / `PAPER_EDGE` / `PAPER_SHADOW` in
 * `SpecimenChamber.tsx`), so the canvas fading in over this is a sharpening,
 * never a change of room.
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
  // the lamp, warm and high
  'radial-gradient(ellipse 70% 50% at 50% 30%, #ffffff 0%, rgba(255, 250, 241, 0) 70%), ' +
  // the contact shadow the specimen will stand in
  'radial-gradient(ellipse 45% 18% at 50% 74%, rgba(192, 168, 135, 0.5) 0%, transparent 70%), ' +
  // the sweep: page at the centre, turning away at the edges
  'radial-gradient(ellipse 120% 100% at 50% 40%, #fffaf1 0%, #fffaf1 45%, #faf1e2 100%)';

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

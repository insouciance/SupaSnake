/**
 * ChamberPlaceholder - static gradient backdrop shown beneath (and before)
 * the Specimen Chamber canvas. Reserves the full-viewport space so the
 * 3D scene mounting causes zero layout shift, and gives fresh visitors an
 * atmosphere-correct void while the chamber streams in.
 */

export function ChamberPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(ellipse 90% 55% at 50% 78%, rgba(34, 211, 238, 0.08) 0%, transparent 60%), ' +
          'radial-gradient(ellipse 120% 80% at 50% -20%, rgba(43, 59, 77, 0.35) 0%, transparent 60%), ' +
          'linear-gradient(180deg, #0a1017 0%, #06090d 55%, #04060a 100%)',
      }}
    />
  );
}

export default ChamberPlaceholder;

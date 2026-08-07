'use client';

/**
 * InputDebugOverlay - flick input instrumentation, mounted only when the
 * URL carries ?debug=input (zero cost otherwise: the debug state object is
 * never created and nothing records).
 *
 * Shows the last recognized flick (+ event timestamp), the engine's current
 * queue, the last rejection with its reason, the last command execution
 * (tick that consumed a queued turn, detected by the per-tick sync watching
 * the queue length drop), and a ring of the last 8 input events.
 */

import { useEffect, useReducer, type RefObject } from 'react';
import { useGameStore } from '@/lib/store/gameStore';
import {
  debugEventsInOrder,
  type InputDebugState,
} from '@/lib/input/flickControl';
import {
  formatSummary,
  type DeathForensics,
  type InputLatencyMeter,
} from '@/lib/game/runInstruments';

const REFRESH_MS = 150;

function formatTime(ms: number): string {
  return `${ms.toFixed(0)}ms`;
}

export function InputDebugOverlay({
  debugRef,
  latencyRef,
  deathForensics,
}: {
  debugRef: RefObject<InputDebugState | null>;
  /** ET-0 input-to-effect histogram, read live off the running meter. */
  latencyRef?: RefObject<InputLatencyMeter>;
  /** Last death's forensics, including the coyote-zone verdict. */
  deathForensics?: DeathForensics | null;
}) {
  const queuedDirections = useGameStore((s) => s.queuedDirections);
  const direction = useGameStore((s) => s.direction);
  // Debug-only: poll refresh so rejection/exec ref updates become visible
  // without wiring re-render triggers into the hot input path.
  const [, forceRefresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const id = setInterval(forceRefresh, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const debug = debugRef.current;
  if (!debug) return null;

  return (
    <div
      data-testid="input-debug-overlay"
      className="absolute left-2 z-40 pointer-events-none font-mono text-[10px] leading-relaxed text-bone-white/90 bg-void-deep/80 border border-scale-blue-light/40 rounded px-2 py-1.5 max-w-[280px]"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 96px)' }}
    >
      <div className="text-venom-orange">input debug</div>
      <div>
        flick: {debug.lastFlick
          ? `${debug.lastFlick.dir} (${debug.lastFlick.detail}) @ ${formatTime(debug.lastFlick.time)}`
          : '-'}
      </div>
      <div>
        queue: [{queuedDirections.join(', ')}] heading {direction}
      </div>
      <div>
        reject: {debug.lastRejection
          ? `${debug.lastRejection.dir} ${debug.lastRejection.detail} @ ${formatTime(debug.lastRejection.time)}`
          : '-'}
      </div>
      <div>
        exec: {debug.lastExec
          ? `${debug.lastExec.dir} @ ${formatTime(debug.lastExec.time)}`
          : '-'}
      </div>
      {/*
        ET-0: input-to-effect latency. Percentiles, not a mean — a fixed-tick
        game spreads honest latency across the whole interval by design, so
        the mean tells you the tick rate and the TAIL tells you the overhead
        ET-3 and ET-4 are trying to remove.
      */}
      <div className="mt-1 text-venom-orange">input to effect</div>
      <div data-testid="input-debug-latency">
        {latencyRef?.current
          ? formatSummary(latencyRef.current.summary())
          : 'no samples'}
      </div>
      {/*
        The coyote-zone counter. THE number ET-2's ruling is sized against:
        an admissible turn that landed inside the observation window AFTER the
        tick that killed the run — "I thought I had that", counted.
      */}
      {deathForensics ? (
        <>
          <div className="mt-1 text-venom-orange">last death</div>
          <div data-testid="input-debug-forensics">
            {deathForensics.cause}
            {deathForensics.coyoteZone
              ? ` · COYOTE +${deathForensics.turnAfterFatalTickMs?.toFixed(0)}ms`
              : ' · no coyote turn'}
          </div>
          <div>
            alpha{' '}
            {deathForensics.alphaAtLastInput === null
              ? '-'
              : deathForensics.alphaAtLastInput.toFixed(2)}
            {' · dist '}
            {deathForensics.cellDistanceAtInput ?? '-'}
            {' · in->tick '}
            {deathForensics.inputToFatalTickMs === null
              ? '-'
              : `${deathForensics.inputToFatalTickMs.toFixed(0)}ms`}
          </div>
        </>
      ) : null}
      <div className="mt-1 text-beige/80">
        {debugEventsInOrder(debug).map((e, i) => (
          <div key={i}>
            {e.kind.padEnd(6, ' ')} {e.dir} {e.detail} @ {formatTime(e.time)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default InputDebugOverlay;

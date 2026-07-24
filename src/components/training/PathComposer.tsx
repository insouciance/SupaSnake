'use client';

import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { TrainingCell, TrainingDirection } from '@/shared/game/training';

const GRID_SIZE = 20;
const DELTA: Record<TrainingDirection, TrainingCell> = {
  UP: { x: 0, z: -1 },
  DOWN: { x: 0, z: 1 },
  LEFT: { x: -1, z: 0 },
  RIGHT: { x: 1, z: 0 },
};

interface PathComposerProps {
  path: TrainingCell[];
  onChange: (path: TrainingCell[]) => void;
}

function sameCell(a: TrainingCell, b: TrainingCell): boolean {
  return a.x === b.x && a.z === b.z;
}

export const DEFAULT_SANDBOX_PATH: TrainingCell[] = [
  { x: 10, z: 10 }, { x: 11, z: 10 }, { x: 12, z: 10 },
  { x: 13, z: 10 }, { x: 13, z: 9 }, { x: 13, z: 8 },
  { x: 12, z: 8 }, { x: 11, z: 8 },
];

export function PathComposer({ path, onChange }: PathComposerProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const extendTo = useCallback((cell: TrainingCell) => {
    const last = path[path.length - 1];
    const beforeLast = path[path.length - 2];
    if (beforeLast && sameCell(cell, beforeLast)) {
      onChange(path.slice(0, -1));
      return;
    }
    if (
      cell.x < 0 || cell.x >= GRID_SIZE || cell.z < 0 || cell.z >= GRID_SIZE ||
      Math.abs(cell.x - last.x) + Math.abs(cell.z - last.z) !== 1 ||
      path.some((existing) => sameCell(existing, cell))
    ) return;
    onChange([...path, cell]);
  }, [onChange, path]);

  const extendDirection = useCallback((direction: TrainingDirection) => {
    const last = path[path.length - 1];
    const delta = DELTA[direction];
    extendTo({ x: last.x + delta.x, z: last.z + delta.z });
  }, [extendTo, path]);

  const cellFromPointer = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.max(0, Math.min(19, Math.floor((event.clientX - rect.left) / rect.width * 20))),
      z: Math.max(0, Math.min(19, Math.floor((event.clientY - rect.top) / rect.height * 20))),
    };
  }, []);

  const handlePointer = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.type === 'pointermove' && event.buttons !== 1) return;
    const cell = cellFromPointer(event);
    if (cell) extendTo(cell);
  }, [cellFromPointer, extendTo]);

  const points = path.map((cell) => `${cell.x + 0.5},${cell.z + 0.5}`).join(' ');
  const last = path[path.length - 1];

  return (
    <div className="space-y-3" data-testid="path-composer">
      <div className="mx-auto w-full max-w-[320px] rounded-arcade border border-scale-blue-light/50 bg-void-deep/80 p-2">
        <svg
          ref={svgRef}
          viewBox="0 0 20 20"
          className="aspect-square w-full touch-none"
          role="img"
          aria-label={`Custom training path with ${path.length} cells`}
          onPointerDown={handlePointer}
          onPointerMove={handlePointer}
        >
          <defs>
            <pattern id="training-composer-grid" width="1" height="1" patternUnits="userSpaceOnUse">
              <path d="M1 0H0V1" fill="none" stroke="rgba(127,178,217,.22)" strokeWidth=".06" />
            </pattern>
          </defs>
          <rect width="20" height="20" fill="#081019" />
          <rect width="20" height="20" fill="url(#training-composer-grid)" />
          <polyline
            points={points}
            fill="none"
            stroke="#67e8f9"
            strokeWidth=".42"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {path.map((cell, index) => (
            <circle
              key={`${cell.x}:${cell.z}`}
              cx={cell.x + 0.5}
              cy={cell.z + 0.5}
              r={index === 0 || index === path.length - 1 ? 0.34 : 0.16}
              fill={index === 0 ? '#f5c85b' : index === path.length - 1 ? '#fb7185' : '#67e8f9'}
            />
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2" aria-label="Path drawing controls">
        {(['UP', 'LEFT', 'DOWN', 'RIGHT'] as const).map((direction) => (
          <button
            key={direction}
            type="button"
            className="btn-neutral h-11 min-w-11 px-3"
            onClick={() => extendDirection(direction)}
            aria-label={`Extend path ${direction.toLowerCase()}`}
          >
            {direction === 'UP' ? '↑' : direction === 'DOWN' ? '↓' : direction === 'LEFT' ? '←' : '→'}
          </button>
        ))}
        <button
          type="button"
          className="btn-neutral min-h-11 px-3"
          onClick={() => path.length > 1 && onChange(path.slice(0, -1))}
          disabled={path.length <= 1}
        >
          Undo
        </button>
        <button
          type="button"
          className="btn-neutral min-h-11 px-3"
          onClick={() => onChange(DEFAULT_SANDBOX_PATH.map((cell) => ({ ...cell })))}
        >
          Reset
        </button>
      </div>
      <p className="text-center font-mono text-xs text-beige/60">
        Gold is the start · rose is the finish · {path.length} cells
        {last ? ` · cursor ${last.x},${last.z}` : ''}
      </p>
    </div>
  );
}

export default PathComposer;

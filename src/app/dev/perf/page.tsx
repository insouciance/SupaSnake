'use client';

/**
 * /dev/perf - synthetic render-performance harness (dev builds only).
 *
 * Drives a configurable long snake around a serpentine circuit at the live
 * 100ms CYBER floor through the real interpolation buffer,
 * inside a scene that mirrors the game board's cost profile (lights,
 * arena, food, portal, bloom). PerfHUD is always on.
 *
 * Query flags:
 * - ?mode=legacy    render the pre-rework pipeline (one mesh per segment,
 *                   lerp-chase interpolation) for before/after comparison
 * - ?dynasty=CYBER|PRIMAL|COSMIC   theme under test (default PRIMAL)
 * - ?mobile=1       mobile profile (dpr cap 1.5, no bloom)
 * - ?aim=deadeye|gridlock|pathline|firefly   mount the aim telegraph
 * - ?length=20..360  body pressure (default 160)
 * - ?speed=50..400   stress tick in ms (default 100)
 * - ?terrain=0..400  sourced blocked cells (default 80)
 * - ?arrival=classic|front   ET-1 arrival-timing A/B (default: the shipped
 *                   front-loaded arrival). Two windows on the same ?speed=
 *                   and ?length= are the deterministic side-by-side.
 *
 * Production: notFound() - this page never ships to players.
 */

import { notFound } from 'next/navigation';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { DynastyId } from '@/shared/types/game';
import type { Direction, Position } from '@/lib/game/SnakeGameLogic';
import { themeManager } from '@/lib/theme/ThemeManager';
import { GAME_CONFIG } from '@/shared/config/game';
import { ArenaFloor } from '@/components/game/ArenaFloor';
import { ArenaBorder } from '@/components/game/ArenaBorder';
import { TerrainBlocks } from '@/components/game/TerrainBlocks';
import { DynamicLights } from '@/components/game/DynamicLights';
import { FoodBeacon } from '@/components/game/FoodBeacon';
import { ExitPortal } from '@/components/game/ExitPortal';
import { PerfHUD } from '@/components/game/PerfHUD';
import {
  InstancedSnake,
  InstancedSnakeFallback,
} from '@/components/game/InstancedSnake';
import {
  createInterpolationBuffer,
  recordTick,
  resetInterpolationBuffer,
  type InterpolationBuffer,
} from '@/lib/game/interpolationBuffer';
import {
  applyArrivalModeFromSearch,
  DEFAULT_ARRIVAL_MODE,
  type ArrivalMode,
} from '@/lib/game/arrivalEasing';
import {
  SnakeModel,
  SnakeSegmentFallback,
} from '@/components/game/SnakeModel';
import { AssetGate } from '@/components/game/AssetGate';
import { AimRenderer } from '@/components/game/AimRenderer';
import { isAimSystemId, type AimSystemId } from '@/lib/game/aimSystems';
import type { AimTarget } from '@/components/game/aimUtils';
import type { TerrainBlock, TerrainSource } from '@/shared/game/terrain';

const GRID = GAME_CONFIG.board.gridSize;
const MAX_SNAKE_LENGTH = 360;
const DEFAULT_SNAKE_LENGTH = 160;
const DEFAULT_TICK_MS = 100;

/** Serpentine circuit over the whole board - every cell, no collisions. */
function buildPath(): Position[] {
  const path: Position[] = [];
  for (let z = 0; z < GRID; z++) {
    if (z % 2 === 0) {
      for (let x = 0; x < GRID; x++) path.push({ x, y: 0, z });
    } else {
      for (let x = GRID - 1; x >= 0; x--) path.push({ x, y: 0, z });
    }
  }
  return path;
}

function directionBetween(from: Position, to: Position): Direction {
  if (to.x > from.x) return 'RIGHT';
  if (to.x < from.x) return 'LEFT';
  if (to.z > from.z) return 'DOWN';
  return 'UP';
}

/**
 * Legacy pipeline replica: one mesh per segment with lerp-chase
 * interpolation (the pre-rework cost profile: ~100 draws + ~100 shadow
 * draws + per-mesh matrix updates). Kept ONLY in this dev harness as the
 * before-side of the perf comparison.
 */
function LegacySnake({
  segmentsRef,
  dynasty,
  length,
}: {
  segmentsRef: { readonly current: Position[] };
  dynasty: DynastyId;
  length: number;
}) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>(
    Array.from({ length: MAX_SNAKE_LENGTH }, () => null)
  );
  const targetVec = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const segments = segmentsRef.current;
    const lerpFactor = Math.min(1, delta * (1000 / 150) * 3);
    for (let i = 0; i < length; i++) {
      const mesh = meshRefs.current[i];
      const seg = segments[i];
      if (!mesh || !seg) continue;
      targetVec.current.set(seg.x + 0.5, 0.5, seg.z + 0.5);
      mesh.position.lerp(targetVec.current, lerpFactor);
    }
  });

  return (
    <>
      {Array.from({ length }, (_, i) => (
        <AssetGate
          key={i}
          label="a snake segment model"
          fallback={
            <SnakeSegmentFallback
              meshRef={(mesh: THREE.Mesh | null) => {
                meshRefs.current[i] = mesh;
              }}
              position={[0.5, 0.5, 0.5]}
              isHead={i === 0}
              dynasty={dynasty}
            />
          }
        >
          <SnakeModel
            meshRef={(mesh: THREE.Mesh | null) => {
              meshRefs.current[i] = mesh;
            }}
            position={[0.5, 0.5, 0.5]}
            isHead={i === 0}
            dynasty={dynasty}
          />
        </AssetGate>
      ))}
    </>
  );
}

function boundedParam(
  params: URLSearchParams,
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const value = params.get(name);
  if (value === null || value.trim() === '') return fallback;
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(raw)));
}

function buildTerrain(count: number): TerrainBlock[] {
  const sources: TerrainSource[] = ['cyber', 'fortress', 'cosmic', 'ladder'];
  const blocks: TerrainBlock[] = [];
  for (let index = 0; index < Math.min(count, GRID * GRID); index += 1) {
    const cell = GRID * GRID - 1 - index;
    const x = cell % GRID;
    const z = Math.floor(cell / GRID);
    const forming = index % 7 === 0;
    blocks.push({
      x,
      z,
      source: sources[index % sources.length],
      formingTicks: forming ? 5 : 0,
      formingTotal: forming ? 10 : 1,
      solid: !forming,
    });
  }
  return blocks;
}

function isDynastyId(value: string | null): value is DynastyId {
  return value === 'CYBER' || value === 'PRIMAL' || value === 'COSMIC';
}

export default function PerfHarnessPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const [config, setConfig] = useState<{
    mode: 'instanced' | 'legacy';
    dynasty: DynastyId;
    mobile: boolean;
    aim: AimSystemId | null;
    length: number;
    tickMs: number;
    terrain: number;
  } | null>(null);
  const [direction, setDirection] = useState<Direction>('RIGHT');
  const [headCell, setHeadCell] = useState<Position>({ x: 0, y: 0, z: 0 });
  /** Which arrival timing this window is showing (ET-1 A/B), for the caption. */
  const [arrivalLabel, setArrivalLabel] = useState<ArrivalMode>(
    DEFAULT_ARRIVAL_MODE
  );

  const bufferRef = useRef<InterpolationBuffer | null>(null);
  if (bufferRef.current === null) {
    bufferRef.current = createInterpolationBuffer();
  }
  // Mutable segment objects reused every tick (no per-tick garbage)
  const segmentsRef = useRef<Position[]>(
    Array.from({ length: MAX_SNAKE_LENGTH }, () => ({ x: 0, y: 0, z: 0 }))
  );
  const path = useMemo(buildPath, []);
  const terrain = useMemo(() => buildTerrain(config?.terrain ?? 0), [config?.terrain]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dynastyParam = params.get('dynasty');
    const aimParam = params.get('aim');
    // ET-1 arrival A/B. This harness is the deterministic moving rig: one
    // scripted cell per tick, no player, no engine - the honest place to put
    // classic and front-loaded side by side on the same path and speed.
    setArrivalLabel(applyArrivalModeFromSearch(window.location.search));
    setConfig({
      mode: params.get('mode') === 'legacy' ? 'legacy' : 'instanced',
      dynasty: isDynastyId(dynastyParam) ? dynastyParam : 'PRIMAL',
      mobile: params.get('mobile') === '1',
      aim: isAimSystemId(aimParam) ? aimParam : null,
      length: boundedParam(
        params,
        'length',
        DEFAULT_SNAKE_LENGTH,
        3,
        MAX_SNAKE_LENGTH
      ),
      tickMs: boundedParam(params, 'speed', DEFAULT_TICK_MS, 50, 400),
      terrain: boundedParam(params, 'terrain', 80, 0, GRID * GRID),
    });
  }, []);

  // Scripted ticking: advance the head one cell every TICK_MS and stamp
  // the buffer exactly like the game loop does.
  useEffect(() => {
    if (!config) return;
    let headIndex = config.length - 1;
    const segments = segmentsRef.current;
    const activeSegments = segments.slice(0, config.length);
    const buffer = bufferRef.current!;
    resetInterpolationBuffer(buffer);

    const tick = () => {
      headIndex += 1;
      if (headIndex >= path.length) {
        // Wrap the circuit: teleport, with a buffer reset so nothing streaks
        headIndex = config.length - 1;
        resetInterpolationBuffer(buffer);
      }
      for (let i = 0; i < config.length; i++) {
        const cell = path[headIndex - i];
        segments[i].x = cell.x;
        segments[i].z = cell.z;
      }
      setDirection(directionBetween(path[headIndex - 1], path[headIndex]));
      setHeadCell({ x: path[headIndex].x, y: 0, z: path[headIndex].z });
      recordTick(
        buffer,
        activeSegments,
        config.tickMs,
        performance.now()
      );
    };

    tick();
    const interval = setInterval(tick, config.tickMs);
    return () => clearInterval(interval);
  }, [config, path]);

  if (!config) return null;

  const theme = themeManager.getTheme(config.dynasty);
  const center = GRID / 2;
  const food = { x: 3, z: 3 };
  const exitTile = { x: 16, z: 16 };
  const aimTargets: AimTarget[] = [
    { x: food.x, z: food.z, kind: 'food' },
    { x: exitTile.x, z: exitTile.z, kind: 'portal' },
  ];

  return (
    <div className="w-screen h-dvh app-bg relative">
      <div className="absolute top-2 left-2 z-10 text-beige/80 font-body text-xs space-y-0.5 pointer-events-none">
        <p>
          /dev/perf — {config.mode} · {config.dynasty}
          {config.mobile ? ' · mobile profile' : ''}
        </p>
        <p>
          {config.length} segments · {config.tickMs}ms · {config.terrain} terrain
          · ?length= ?speed= ?terrain=
        </p>
        <p>
          arrival:{' '}
          {arrivalLabel === 'front'
            ? 'FRONT-LOADED (lands at α 0.45, settles)'
            : 'CLASSIC (lands at α 1.0 — the old lie)'}{' '}
          · ?arrival=classic|front
        </p>
      </div>
      <Canvas
        camera={{
          position: [center, center * 2.4, center * 1.9],
          fov: 50,
        }}
        shadows
        dpr={config.mobile ? [1, 1.5] : [1, 2]}
        onCreated={({ camera }) => {
          camera.lookAt(center, 0, center);
        }}
      >
        <fog attach="fog" args={['#0a0f14', 40, 75]} />
        <hemisphereLight args={['#bcd6e8', '#0b1016', 0.5]} />
        <ambientLight intensity={0.18} />
        <directionalLight
          position={[10, 20, 10]}
          intensity={1.1}
          castShadow
          shadow-mapSize={config.mobile ? [1024, 1024] : [2048, 2048]}
          shadow-camera-near={1}
          shadow-camera-far={50}
          shadow-camera-left={-15}
          shadow-camera-right={15}
          shadow-camera-top={15}
          shadow-camera-bottom={-15}
          shadow-bias={-0.0001}
        />
        <DynamicLights
          dynasty={config.dynasty}
          score={20}
          isDeathSequence={false}
          foodPositions={[food]}
          gridSize={GRID}
        />
        <ArenaFloor
          gridSize={GRID}
          accentColor={theme.primary}
        />
        <ArenaBorder
          gridSize={GRID}
          color={theme.secondary}
          emissiveIntensity={0.5}
        />
        <TerrainBlocks terrain={terrain} />
        {config.mode === 'legacy' ? (
          <LegacySnake
            segmentsRef={segmentsRef}
            dynasty={config.dynasty}
            length={config.length}
          />
        ) : (
          <AssetGate
            label="the snake model"
            fallback={
              <InstancedSnakeFallback
                bufferRef={bufferRef}
                dynasty={config.dynasty}
                direction={direction}
                terrain={terrain}
              />
            }
          >
            <InstancedSnake
              bufferRef={bufferRef}
              dynasty={config.dynasty}
              direction={direction}
              terrain={terrain}
            />
          </AssetGate>
        )}
        {config.aim && (
          <AimRenderer
            headPosition={headCell}
            direction={direction}
            queuedDirections={[]}
            snake={[]}
            gridSize={GRID}
            aimSystem={config.aim}
            targets={aimTargets}
            bufferRef={bufferRef}
            color={theme.accent}
            laneColor={theme.primary}
          />
        )}
        <FoodBeacon position={[food.x + 0.5, 0, food.z + 0.5]} color={theme.accent} />
        <ExitPortal
          position={[exitTile.x + 0.5, 0, exitTile.z + 0.5]}
          ticksRemaining={100}
          isMobile={config.mobile}
        />
        <PerfHUD />
        {!config.mobile && (
          <EffectComposer>
            <Bloom
              luminanceThreshold={0.35}
              luminanceSmoothing={0.9}
              intensity={0.75}
              mipmapBlur
            />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}

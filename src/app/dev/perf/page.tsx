'use client';

/**
 * /dev/perf - synthetic render-performance harness (dev builds only).
 *
 * Drives a scripted 100-segment snake around a serpentine circuit at 50ms
 * ticks (the engine's max speed) through the real interpolation buffer,
 * inside a scene that mirrors the game board's cost profile (lights,
 * arena, food, portal, bloom). PerfHUD is always on.
 *
 * Query flags:
 * - ?mode=legacy    render the pre-rework pipeline (one mesh per segment,
 *                   lerp-chase interpolation) for before/after comparison
 * - ?dynasty=CYBER|PRIMAL|COSMIC   theme under test (default PRIMAL)
 * - ?mobile=1       mobile profile (dpr cap 1.5, no bloom)
 * - ?aim=deadeye|gridlock|pathline|firefly   mount the aim telegraph
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
  SnakeModel,
  SnakeSegmentFallback,
} from '@/components/game/SnakeModel';
import { AimRenderer } from '@/components/game/AimRenderer';
import { isAimSystemId, type AimSystemId } from '@/lib/game/aimSystems';
import type { AimTarget } from '@/components/game/aimUtils';

const GRID = GAME_CONFIG.board.gridSize;
const SNAKE_LENGTH = 100;
const TICK_MS = 50;

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
}: {
  segmentsRef: { readonly current: Position[] };
  dynasty: DynastyId;
}) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>(
    Array.from({ length: SNAKE_LENGTH }, () => null)
  );
  const targetVec = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const segments = segmentsRef.current;
    const lerpFactor = Math.min(1, delta * (1000 / 150) * 3);
    for (let i = 0; i < SNAKE_LENGTH; i++) {
      const mesh = meshRefs.current[i];
      const seg = segments[i];
      if (!mesh || !seg) continue;
      targetVec.current.set(seg.x + 0.5, 0.5, seg.z + 0.5);
      mesh.position.lerp(targetVec.current, lerpFactor);
    }
  });

  return (
    <>
      {Array.from({ length: SNAKE_LENGTH }, (_, i) => (
        <Suspense
          key={i}
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
        </Suspense>
      ))}
    </>
  );
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
  } | null>(null);
  const [direction, setDirection] = useState<Direction>('RIGHT');
  const [headCell, setHeadCell] = useState<Position>({ x: 0, y: 0, z: 0 });

  const bufferRef = useRef<InterpolationBuffer | null>(null);
  if (bufferRef.current === null) {
    bufferRef.current = createInterpolationBuffer();
  }
  // Mutable segment objects reused every tick (no per-tick garbage)
  const segmentsRef = useRef<Position[]>(
    Array.from({ length: SNAKE_LENGTH }, () => ({ x: 0, y: 0, z: 0 }))
  );
  const path = useMemo(buildPath, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dynastyParam = params.get('dynasty');
    const aimParam = params.get('aim');
    setConfig({
      mode: params.get('mode') === 'legacy' ? 'legacy' : 'instanced',
      dynasty: isDynastyId(dynastyParam) ? dynastyParam : 'PRIMAL',
      mobile: params.get('mobile') === '1',
      aim: isAimSystemId(aimParam) ? aimParam : null,
    });
  }, []);

  // Scripted ticking: advance the head one cell every TICK_MS and stamp
  // the buffer exactly like the game loop does.
  useEffect(() => {
    if (!config) return;
    let headIndex = SNAKE_LENGTH - 1;
    const segments = segmentsRef.current;
    const buffer = bufferRef.current!;
    resetInterpolationBuffer(buffer);

    const tick = () => {
      headIndex += 1;
      if (headIndex >= path.length) {
        // Wrap the circuit: teleport, with a buffer reset so nothing streaks
        headIndex = SNAKE_LENGTH - 1;
        resetInterpolationBuffer(buffer);
      }
      for (let i = 0; i < SNAKE_LENGTH; i++) {
        const cell = path[headIndex - i];
        segments[i].x = cell.x;
        segments[i].z = cell.z;
      }
      setDirection(directionBetween(path[headIndex - 1], path[headIndex]));
      setHeadCell({ x: path[headIndex].x, y: 0, z: path[headIndex].z });
      recordTick(buffer, segments, TICK_MS, performance.now());
    };

    tick();
    const interval = setInterval(tick, TICK_MS);
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
        <p>100 segments · 50ms ticks · ?mode=legacy ?dynasty= ?mobile=1</p>
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
          floorColor="#101722"
          gridColor="#3b5266"
          majorGridColor="#7fb2d9"
          accentColor={theme.primary}
        />
        <ArenaBorder
          gridSize={GRID}
          color={theme.secondary}
          accentColor="#22d3ee"
          emissiveIntensity={0.5}
        />
        {config.mode === 'legacy' ? (
          <LegacySnake segmentsRef={segmentsRef} dynasty={config.dynasty} />
        ) : (
          <Suspense
            fallback={
              <InstancedSnakeFallback
                bufferRef={bufferRef}
                dynasty={config.dynasty}
                direction={direction}
              />
            }
          >
            <InstancedSnake
              bufferRef={bufferRef}
              dynasty={config.dynasty}
              direction={direction}
            />
          </Suspense>
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

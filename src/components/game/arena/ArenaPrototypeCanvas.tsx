'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { DynastyId } from '@/shared/types/game';
import type { Position } from '@/lib/game/SnakeGameLogic';
import { GAME_CONFIG } from '@/shared/config/game';
import { ArenaAssembly } from '@/components/game/arena/ArenaAssembly';
import { ArenaFloor } from '@/components/game/ArenaFloor';
import { ArenaBorder } from '@/components/game/ArenaBorder';
import {
  CameraRig,
  COCKPIT_DEFAULT_POLAR,
  COCKPIT_FIT_SCALE,
  COCKPIT_FRAME_MARGIN,
  COCKPIT_TARGET_Y,
} from '@/components/game/CameraRig';
import { DynamicLights } from '@/components/game/DynamicLights';
import { FoodBeacon } from '@/components/game/FoodBeacon';
import { MutationBeacon } from '@/components/game/MutationBeacon';
import { ExitPortal } from '@/components/game/ExitPortal';
import {
  InstancedSnake,
  InstancedSnakeFallback,
} from '@/components/game/InstancedSnake';
import {
  SnakeModel,
  SnakeSegmentFallback,
} from '@/components/game/SnakeModel';
import { TerrainBlocks } from '@/components/game/TerrainBlocks';
import type { TerrainBlock, TerrainSource } from '@/shared/game/terrain';
import { AimRenderer } from '@/components/game/AimRenderer';
import type { AimTarget } from '@/components/game/aimUtils';
import {
  createInterpolationBuffer,
  recordTick,
  type InterpolationBuffer,
} from '@/lib/game/interpolationBuffer';
import {
  GAME_SCREEN_COLORS,
  getDynastyScreenTokens,
} from '@/components/game/screen/gameScreenTokens';

type PrototypeState = 'ready' | 'active' | 'portal' | 'apex';

interface ArenaPrototypeCanvasProps {
  dynasty: DynastyId;
  state: PrototypeState;
  arenaVariant?: 'released' | 'cockpit';
  effectsEnabled?: boolean;
  density?: 'standard' | 'extreme';
}

const GRID = GAME_CONFIG.board.gridSize;
const STATIC_SNAKE: readonly Position[] = [
  { x: 10, y: 0, z: 13 },
  { x: 10, y: 0, z: 14 },
  { x: 9, y: 0, z: 14 },
  { x: 8, y: 0, z: 14 },
  { x: 7, y: 0, z: 14 },
  { x: 7, y: 0, z: 15 },
  { x: 7, y: 0, z: 16 },
  { x: 6, y: 0, z: 16 },
  { x: 5, y: 0, z: 16 },
] as const;
const FOOD = { x: 14, y: 0, z: 6 } as const;
const MUTATION = { x: 16, y: 0, z: 13 } as const;
const PORTAL = { x: 4, y: 0, z: 3 } as const;

function buildDenseSnake(): readonly Position[] {
  const cells: Position[] = [];
  for (let z = 3; z <= 15; z += 1) {
    if (z % 2 === 1) {
      for (let x = 3; x <= 16; x += 1) cells.push({ x, y: 0, z });
    } else {
      for (let x = 16; x >= 3; x -= 1) cells.push({ x, y: 0, z });
    }
  }
  return cells;
}

const DENSE_SNAKE = buildDenseSnake();
const TERRAIN_SOURCES: readonly TerrainSource[] = [
  'cyber',
  'fortress',
  'cosmic',
  'ladder',
];
const DENSE_TERRAIN: readonly TerrainBlock[] = (() => {
  const cells: TerrainBlock[] = [];
  let index = 0;
  for (let z = 0; z < GRID; z += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const ring = Math.min(x, z, GRID - 1 - x, GRID - 1 - z);
      if (ring > 1 || (ring === 1 && (x + z) % 2 !== 0)) continue;
      cells.push({
        x,
        z,
        source: TERRAIN_SOURCES[index % TERRAIN_SOURCES.length],
        formingTicks: index % 5 === 0 ? 8 : 0,
        formingTotal: 12,
        solid: index % 5 !== 0,
      });
      index += 1;
    }
  }
  return cells;
})();

function StaticSnake({ dynasty }: { dynasty: DynastyId }) {
  return (
    <>
      {STATIC_SNAKE.map((segment, index) => {
        const props = {
          position: [segment.x + 0.5, 0.5, segment.z + 0.5] as [number, number, number],
          isHead: index === 0,
          dynasty,
        };
        return (
          <Suspense
            key={`${segment.x}-${segment.z}`}
            fallback={<SnakeSegmentFallback {...props} />}
          >
            <SnakeModel {...props} />
          </Suspense>
        );
      })}
    </>
  );
}

function PrototypeScene({
  dynasty,
  state,
  isMobile,
  arenaVariant = 'cockpit',
  effectsEnabled = true,
  density = 'standard',
}: ArenaPrototypeCanvasProps & { isMobile: boolean }) {
  const theme = getDynastyScreenTokens(dynasty);
  const snake = density === 'extreme' ? DENSE_SNAKE : STATIC_SNAKE;
  const interpolation = useMemo(() => {
    if (density !== 'extreme') return null;
    const buffer = createInterpolationBuffer(DENSE_SNAKE.length);
    recordTick(buffer, DENSE_SNAKE, 100, 1);
    recordTick(buffer, DENSE_SNAKE, 100, 2);
    return buffer;
  }, [density]);
  const bufferRef = useRef<InterpolationBuffer | null>(interpolation);
  bufferRef.current = interpolation;
  const portalLive = state === 'portal' || state === 'apex';
  const aimTargets = useMemo<AimTarget[]>(
    () => [
      { x: FOOD.x, z: FOOD.z, kind: 'food' },
      { x: MUTATION.x, z: MUTATION.z, kind: 'mutation' },
      ...(portalLive ? [{ x: PORTAL.x, z: PORTAL.z, kind: 'portal' } as const] : []),
    ],
    [portalLive]
  );

  return (
    <>
      <fog attach="fog" args={[GAME_SCREEN_COLORS.void, 39, 72]} />
      <hemisphereLight args={['#a9c3d5', GAME_SCREEN_COLORS.graphiteDeep, 0.42]} />
      <ambientLight intensity={0.12} />
      <directionalLight
        position={[9, 20, 11]}
        intensity={0.92}
        castShadow
        shadow-mapSize={isMobile ? [1024, 1024] : [2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={50}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-bias={-0.0001}
      />
      <DynamicLights
        dynasty={dynasty}
        score={32}
        isDeathSequence={false}
        foodPositions={[FOOD]}
        gridSize={GRID}
        intensityScale={0.62}
      />

      {arenaVariant === 'cockpit' ? (
        <ArenaAssembly
          gridSize={GRID}
          dynasty={dynasty}
          torus={dynasty === 'COSMIC'}
        />
      ) : (
        <>
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
            accentColor={GAME_SCREEN_COLORS.systemCyan}
            emissiveIntensity={0.5}
          />
        </>
      )}
      <AimRenderer
        headPosition={snake[0]}
        direction={density === 'extreme' ? 'RIGHT' : 'UP'}
        queuedDirections={[]}
        snake={snake}
        gridSize={GRID}
        aimSystem="deadeye"
        targets={aimTargets}
        bufferRef={bufferRef}
        color={GAME_SCREEN_COLORS.systemCyan}
        laneColor={theme.primary}
      />
      {density === 'extreme' ? (
        <Suspense
          fallback={
            <InstancedSnakeFallback
              bufferRef={bufferRef}
              dynasty={dynasty}
              direction="RIGHT"
              terrain={DENSE_TERRAIN}
              wrapActive={dynasty === 'COSMIC'}
            />
          }
        >
          <InstancedSnake
            bufferRef={bufferRef}
            dynasty={dynasty}
            direction="RIGHT"
            terrain={DENSE_TERRAIN}
            wrapActive={dynasty === 'COSMIC'}
          />
        </Suspense>
      ) : (
        <StaticSnake dynasty={dynasty} />
      )}
      {density === 'extreme' ? <TerrainBlocks terrain={DENSE_TERRAIN} /> : null}
      <FoodBeacon
        position={[FOOD.x + 0.5, 0, FOOD.z + 0.5]}
        color={GAME_SCREEN_COLORS.systemCyan}
        visualScale={1.12}
      />
      <MutationBeacon
        position={[MUTATION.x + 0.5, 0, MUTATION.z + 0.5]}
        ticksRemaining={28}
        visualScale={1.3}
      />
      {portalLive && (
        <ExitPortal
          position={[PORTAL.x + 0.5, 0, PORTAL.z + 0.5]}
          ticksRemaining={46}
          isMobile={isMobile}
          showExtractHint={false}
          visualScale={1.08}
        />
      )}

      <CameraRig
        gridSize={GRID}
        resetToken={0}
        frameMargin={COCKPIT_FRAME_MARGIN}
        fitScale={COCKPIT_FIT_SCALE}
        defaultPolar={COCKPIT_DEFAULT_POLAR}
        targetY={COCKPIT_TARGET_Y}
      />

      {!isMobile && effectsEnabled && (
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.55}
            luminanceSmoothing={0.88}
            intensity={0.58}
            mipmapBlur
          />
        </EffectComposer>
      )}
    </>
  );
}

function RenderStatsProbe() {
  const gl = useThree((state) => state.gl);
  const frameRef = useRef(0);
  useFrame(() => {
    frameRef.current += 1;
    if (frameRef.current % 12 !== 0) return;
    const host = document.querySelector<HTMLElement>('[data-testid="cockpit-webgl-board"]');
    if (!host) return;
    host.dataset.drawCalls = String(gl.info.render.calls);
    host.dataset.triangles = String(gl.info.render.triangles);
  });
  return null;
}

export function ArenaPrototypeCanvas({
  dynasty,
  state,
  arenaVariant = 'cockpit',
  effectsEnabled = true,
  density = 'standard',
}: ArenaPrototypeCanvasProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px), (max-height: 500px)');
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const center = GRID / 2;
  return (
    <div
      data-testid="cockpit-webgl-board"
      data-fixture-density={density}
      data-fixture-snake-cells={density === 'extreme' ? DENSE_SNAKE.length : STATIC_SNAKE.length}
      data-fixture-terrain-cells={density === 'extreme' ? DENSE_TERRAIN.length : 0}
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <Canvas
        camera={{
          position: [center, center * 2.4, center * 1.9],
          fov: 44,
        }}
        shadows
        dpr={isMobile ? [1, 1.5] : [1, 2]}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl, camera }) => {
          gl.setClearColor(0x000000, 0);
          camera.lookAt(center, 0, center);
        }}
      >
        <PrototypeScene
          dynasty={dynasty}
          state={state}
          isMobile={isMobile}
          arenaVariant={arenaVariant}
          effectsEnabled={effectsEnabled}
          density={density}
        />
        <RenderStatsProbe />
      </Canvas>
    </div>
  );
}

export default ArenaPrototypeCanvas;

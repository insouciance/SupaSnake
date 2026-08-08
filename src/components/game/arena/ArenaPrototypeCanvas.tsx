'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import { LinearToneMapping } from 'three';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { DynastyId } from '@/shared/types/game';
import type { Direction, Position } from '@/lib/game/SnakeGameLogic';
import { GAME_CONFIG } from '@/shared/config/game';
import { CANONICAL_FOV } from '@/components/game/canonicalViewpoint';
import { ArenaAssembly } from '@/components/game/arena/ArenaAssembly';
import { ArenaFloor } from '@/components/game/ArenaFloor';
import { ArenaBorder } from '@/components/game/ArenaBorder';
import {
  CameraRig,
  CANONICAL_POLAR,
  COCKPIT_FIT_SCALE,
  COCKPIT_FRAME_MARGIN,
  COCKPIT_TARGET_Y,
} from '@/components/game/CameraRig';
import { DynamicLights } from '@/components/game/DynamicLights';
import { FoodBeacon } from '@/components/game/FoodBeacon';
import { createLightTarget } from '@/components/game/screen/inkAmber';
import { useRenderQuality } from '@/components/game/screen/useRenderQuality';
import {
  qualityForTier,
  type RenderTier,
} from '@/components/game/screen/renderQuality';
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
import { AssetGate } from '@/components/game/AssetGate';
import { TerrainBlocks } from '@/components/game/TerrainBlocks';
import type { TerrainBlock, TerrainSource } from '@/shared/game/terrain';
import { AimRenderer } from '@/components/game/AimRenderer';
import type { AimTarget } from '@/components/game/aimUtils';
import {
  createInterpolationBuffer,
  recordTick,
  resetInterpolationBuffer,
  type InterpolationBuffer,
} from '@/lib/game/interpolationBuffer';
import {
  resetArrivalMode,
  setArrivalMode,
  type ArrivalMode,
} from '@/lib/game/arrivalEasing';
import {
  GAME_SCREEN_COLORS,
  getDynastyScreenTokens,
} from '@/components/game/screen/gameScreenTokens';
import {
  BOARD_PURPLE_DEFAULT,
  BOARD_THEME_STONE,
  resolveBoardTheme,
  type BoardPurpleMode,
  type BoardThemeSelection,
} from '@/components/game/screen/boardThemes';
import { IS_SNAKE_90S } from '@/components/game/screen/snake90s';
import { NINETIES_COMPOSITION_ENABLED } from '@/lib/features/ninetiesComposition';
import {
  EMPTY_SNAKE_LOADOUT,
  type SnakeCosmeticLoadout as CosmeticLoadout,
} from '@/lib/cosmetics/snakeCosmetics';

type PrototypeState = 'ready' | 'active' | 'portal' | 'apex';

interface ArenaPrototypeCanvasProps {
  dynasty: DynastyId;
  state: PrototypeState;
  arenaVariant?: 'released' | 'cockpit';
  effectsEnabled?: boolean;
  density?: 'standard' | 'extreme';
  /**
   * Dev-fixture-only: `variants` adds the golden and wager pickups beside the
   * ordinary one so all three food states can be judged in a single frame.
   * See `FOOD_GOLDEN`. The live board never sets this.
   */
  foodStates?: 'standard' | 'variants';
  /**
   * Dev-fixture-only: pin the governor to one tier so a verifier or a human
   * can measure a specific tier's output (e.g. the floor's luminance
   * repayment) reproducibly instead of waiting for the governor to wander
   * there. The live board never sets this; the /dev/cockpit route is not
   * served in production at all.
   */
  forceRenderTier?: RenderTier;
  /**
   * Dev-fixture-only pitch escape (`/dev/cockpit?pitch=`), in degrees from
   * zenith.
   *
   * ET-5 ratified ONE viewpoint for the played board, and this is not a way
   * back to a movable camera: it is a way to judge board art, materials and
   * silhouettes against a candidate angle before anyone proposes amending the
   * ruling. `/dev/cockpit` 404s in production, so nothing here can reach a
   * player. Undefined - the default, and what every verifier measures - means
   * the ratified pitch, which is also the pitch the 90s board was ratified at.
   */
  pitchDeg?: number;
  /**
   * NEON DYNASTY THEMES, dev-fixture only. A dynasty name picks that dynasty's
   * board theme regardless of which dynasty the scene is showing, so all three
   * themes can be flipped against one fixed scene; `'stone'` selects the INK &
   * AMBER board for an A/B - which is also what the composition flag ships
   * when it is off. Omitted follows the flag, then `dynasty`.
   */
  boardThemeSelection?: BoardThemeSelection;
  /**
   * THE COMPARE TOGGLE (dev-fixture only). Restores the drawn seam the
   * line-free ruling retired - the tiles' ink hull, the analytic carve and the
   * neon filament in every interior cut. It exists so the ruling can be flipped
   * live rather than described: default false is the board the ruling
   * describes, `?gridlines=1` is the board that was reviewed before it.
   */
  boardSeamLines?: boolean;
  /**
   * THE BRAND PURPLE PIN (dev-fixture only,
   * `/dev/cockpit?boardPurple=off|underglow|frame|both`).
   *
   * Null - the default, and what every caller but the fixture passes - renders
   * the RATIFIED board, which since 2026-08-08 wears both the seam underglow
   * and the slab frame band. `off` is the comparison pin that strips them. See
   * `applyBoardPurple` for what each variant places and for why none of them
   * can become the house colour.
   */
  boardPurple?: BoardPurpleMode | null;
  /**
   * ET-1 ARRIVAL A/B (dev-fixture only, `/dev/cockpit?arrival=classic|front`).
   *
   * Non-null does two things: it pins the render-side arrival timing, and it
   * turns the fixture's posed snake into a scripted WALKER. Both are needed,
   * because a still life cannot show a motion change - the whole defect ET-1
   * fixes is a question of WHEN inside a tick interval the head is drawn.
   *
   * Null - which is every verifier run and every other visit - leaves the
   * fixture exactly as posed. The deterministic screenshots the three cockpit
   * verifiers measure are therefore untouched by this switch existing.
   */
  arrivalMode?: ArrivalMode | null;
}

const GRID = GAME_CONFIG.board.gridSize;

/**
 * WHICH BOARD THE FIXTURE SHOWS WHEN NOBODY ASKED FOR ONE: whichever one this
 * build ships.
 *
 * `?boardTheme=` still overrides in either direction, which is what the A/B is
 * for. But an unqualified `/dev/cockpit?renderer=webgl` has to be a picture of
 * the product, or every verifier that measures the fixture - draw calls, the
 * canonical pose, the tier table - would be measuring a board no player is
 * getting. `undefined` here means "follow `?dynasty`", which is the themed
 * board; `'stone'` is the INK & AMBER board the rollback leg builds.
 */
const FIXTURE_BOARD_DEFAULT: BoardThemeSelection | undefined =
  NINETIES_COMPOSITION_ENABLED ? undefined : BOARD_THEME_STONE;

/**
 * WHAT THE FIXTURE'S SNAKE IS WEARING, and why a fixture may say so at all.
 *
 * The character sheet's creature wears the shades and the braids in all five
 * of its views - they are "part of the identity" (style guide sections 5 and
 * 6) - and the round-3 review shots were argued from a head that had both. A
 * fixture that posed a bare head would be a picture of a different character.
 *
 * This is a POSE, not a default. `/dev/cockpit` mounts no session and asks no
 * server, so there is no loadout to respect here; on the played board and in
 * the chamber the answer comes from `read_snake_loadout` (migration 069) and
 * from nowhere else, and an unequipped player gets a bare head. The keys are
 * the server's own component keys so the fixture cannot drift from the
 * catalog that would supply them.
 *
 * Empty under the classic style: the rollback leg's fixture must show the
 * snake it shipped, and that one wore nothing by default either.
 */
const FIXTURE_LOADOUT: CosmeticLoadout = IS_SNAKE_90S
  ? { face: 'shades_deadpan', crown: 'braids_amber', food_skin: null }
  : EMPTY_SNAKE_LOADOUT;

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

/**
 * THE FOOD-STATE FIXTURE (`/dev/cockpit?foods=variants`).
 *
 * The board only ever mounts the ordinary pickup, so the states that have to
 * be told apart at a glance - ordinary, golden, wager - never appear in one
 * frame anywhere a human can look at them. The distinctness rule is asserted
 * in `food90s.test.ts`, but "asserted" and "looked at side by side on a
 * crowded board in three themes" are different claims, and only the second one
 * answers whether a player can read it at 175ms.
 *
 * Review tooling: this places the two specials NEXT TO the ordinary food that
 * is already in the fixture, on the free column outside the dense coil (which
 * spans x 3..16) and inside the terrain border (which fills the outer two
 * rings). Nothing here reaches a player - `/dev/cockpit` 404s in production -
 * and the standard fixture is untouched.
 */
const FOOD_GOLDEN = { x: 17, y: 0, z: 5 } as const;
const FOOD_WAGER = { x: 17, y: 0, z: 9 } as const;

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

/**
 * THE HEADING A FIXTURE SNAKE IS ACTUALLY TRAVELLING ON - derived from its own
 * cells, never restated beside them.
 *
 * OWNER NOTE, ROUND 3, 2026-08-07: on the crowded board "the head's face
 * (shades + braids) looks BACKWARD, toward its first tail segment, so the face
 * is invisible in play."
 *
 * The renderer was innocent. `InstancedSnake` mounts the cosmetics at head-local
 * z = +0.5 and yaws the head by `HEAD_FACE_YAW`, which maps DOWN(+Z) to 0,
 * RIGHT(+X) to +pi/2, UP(-Z) to pi and LEFT(-X) to -pi/2 - and three's
 * `rotation.y` sends (0,0,1) to (sin t, 0, cos t), so every one of those four
 * lands the face on the direction of travel. The live board passes the engine's
 * own `direction` into it and is therefore correct in all four.
 *
 * THIS FIXTURE WAS NOT. `buildDenseSnake` lays a boustrophedon starting at
 * (3,3) and walking +X, so cell 0 - the HEAD, by the engine's own convention
 * that `snake[0]` is the head - sits at the LEFT end of the first row with its
 * first tail segment at (4,3). A snake whose previous cell is to its east is
 * travelling WEST. The fixture declared `direction="RIGHT"`, which is exactly
 * pi out, so the head yawed to face the segment behind it and buried its own
 * face in the coil. `AimRenderer` was reading the same wrong constant and
 * drawing the aim lane backward with it.
 *
 * So the constant is deleted rather than corrected: a heading typed next to a
 * cell list is a second source for one fact, and this is what the second source
 * being wrong looks like. Deriving it means a future fixture pose cannot
 * disagree with itself.
 */
function headingOf(cells: readonly Position[]): Direction {
  const head = cells[0];
  const behind = cells[1] ?? head;
  if (head.x !== behind.x) return head.x > behind.x ? 'RIGHT' : 'LEFT';
  if (head.z !== behind.z) return head.z > behind.z ? 'DOWN' : 'UP';
  return 'UP';
}

/**
 * ET-1 ARRIVAL WALK - the fixture's motion rig.
 *
 * A closed ring one snake-length inside the board: four long straights (where
 * arrival timing is judged - does the head LAND on its cell, or is it still
 * sliding when the next tick fires?) and four corners (where the head's damped
 * yaw follows through after the position has already settled). Closed, so it
 * runs forever without a reset streak; deterministic, so two windows opened at
 * the same moment stay in step long enough to compare.
 *
 * 120ms is between CYBER's ~100ms floor and PRIMAL's 175ms cap - the middle of
 * the cadence band the defect was reported in.
 */
const ARRIVAL_WALK_TICK_MS = 120;

function buildArrivalWalkPath(): readonly Position[] {
  const lo = 5;
  const hi = GRID - 6;
  const path: Position[] = [];
  for (let x = lo; x < hi; x += 1) path.push({ x, y: 0, z: lo });
  for (let z = lo; z < hi; z += 1) path.push({ x: hi, y: 0, z });
  for (let x = hi; x > lo; x -= 1) path.push({ x, y: 0, z: hi });
  for (let z = hi; z > lo; z -= 1) path.push({ x: lo, y: 0, z });
  return path;
}

const ARRIVAL_WALK_PATH = buildArrivalWalkPath();

interface ArrivalWalk {
  bufferRef: { readonly current: InterpolationBuffer | null };
  snake: readonly Position[];
  heading: Direction;
  head: Position;
}

/**
 * Drive the fixture snake one cell per tick through the REAL interpolation
 * buffer - the same `recordTick` the game loop calls, with the same
 * "interval the loop re-arms with" denominator - so what the owner judges here
 * is the shipped renderer, not a demo of it.
 */
function useArrivalWalk(mode: ArrivalMode | null): ArrivalWalk {
  const bufferRef = useRef<InterpolationBuffer | null>(null);
  if (bufferRef.current === null) {
    bufferRef.current = createInterpolationBuffer(STATIC_SNAKE.length);
  }
  // Mutated in place every tick: a dev fixture still has no business
  // allocating a snake per tick into the same heap the renderer runs on.
  const segmentsRef = useRef<Position[]>(
    STATIC_SNAKE.map((cell) => ({ ...cell }))
  );
  const [heading, setHeading] = useState<Direction>(headingOf(STATIC_SNAKE));
  const [head, setHead] = useState<Position>(() => ({ ...STATIC_SNAKE[0] }));

  useEffect(() => {
    if (!mode) return;
    setArrivalMode(mode);
    const buffer = bufferRef.current!;
    const segments = segmentsRef.current;
    const length = segments.length;
    resetInterpolationBuffer(buffer);
    let headIndex = length - 1;

    const tick = () => {
      headIndex = (headIndex + 1) % ARRIVAL_WALK_PATH.length;
      for (let i = 0; i < length; i += 1) {
        const cell =
          ARRIVAL_WALK_PATH[
            (headIndex - i + ARRIVAL_WALK_PATH.length) % ARRIVAL_WALK_PATH.length
          ];
        segments[i].x = cell.x;
        segments[i].z = cell.z;
      }
      setHeading(headingOf(segments));
      setHead({ x: segments[0].x, y: 0, z: segments[0].z });
      recordTick(buffer, segments, ARRIVAL_WALK_TICK_MS, performance.now());
    };

    tick();
    const timer = setInterval(tick, ARRIVAL_WALK_TICK_MS);
    return () => {
      clearInterval(timer);
      // The pin is a module singleton shared with every other surface in this
      // tab; leaving the fixture must not leave `classic` behind on the board.
      resetArrivalMode();
    };
  }, [mode]);

  return { bufferRef, snake: segmentsRef.current, heading, head };
}

/** UP: the head at (10,13) came from (10,14). Unchanged by the derivation. */
const STATIC_HEADING = headingOf(STATIC_SNAKE);
/** LEFT: the head at (3,3) came from (4,3). This is the one that was pi out. */
const DENSE_HEADING = headingOf(DENSE_SNAKE);
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
          <AssetGate
            key={`${segment.x}-${segment.z}`}
            label="a snake segment model"
            fallback={<SnakeSegmentFallback {...props} />}
          >
            <SnakeModel {...props} />
          </AssetGate>
        );
      })}
    </>
  );
}

/** See the note on the live board's `SHADOW_MAP_SIZE`. */
const SHADOW_MAP_SIZE: [number, number] = [1024, 1024];

function PrototypeScene({
  dynasty,
  state,
  isMobile,
  arenaVariant = 'cockpit',
  effectsEnabled = true,
  density = 'standard',
  foodStates = 'standard',
  forceRenderTier,
  pitchDeg,
  boardThemeSelection,
  boardSeamLines = false,
  boardPurple = null,
  arrivalMode = null,
}: ArenaPrototypeCanvasProps & { isMobile: boolean }) {
  const theme = getDynastyScreenTokens(dynasty);
  const boardTheme = useMemo(
    () =>
      resolveBoardTheme(
        boardThemeSelection ?? FIXTURE_BOARD_DEFAULT,
        dynasty,
        boardPurple
      ),
    [boardThemeSelection, dynasty, boardPurple]
  );
  // The dense fixture is a geometry-cost stress pose and stays posed; the
  // walker takes over the ordinary one, which is the pose the composition and
  // the camera were ratified against.
  const walking = arrivalMode !== null && density !== 'extreme';
  const walk = useArrivalWalk(walking ? arrivalMode : null);
  const posedSnake = density === 'extreme' ? DENSE_SNAKE : STATIC_SNAKE;
  const snake = walking ? walk.snake : posedSnake;
  const heading = walking
    ? walk.heading
    : density === 'extreme'
      ? DENSE_HEADING
      : STATIC_HEADING;
  const headPosition = walking ? walk.head : posedSnake[0];
  // Same defect, same fix as the live board: three's default light target is
  // the world origin, which is a corner of a 0..20 board, so the orthographic
  // shadow frustum was centred off the arena and the light sat on the exact
  // x=z diagonal. See src/app/game/page.tsx for the projected numbers.
  const keyLightTarget = useMemo(
    () => createLightTarget(GRID / 2, 0, GRID / 2),
    []
  );
  /*
   * The fixture runs the same governor as the live board, so the cockpit
   * verifiers exercise the shipped code path rather than a quality tier that
   * only exists in production. There is no decision surface here, so a step up
   * is always allowed.
   */
  const governed = useRenderQuality({ active: true, allowStepUp: true });
  const quality =
    forceRenderTier != null ? qualityForTier(forceRenderTier) : governed;
  // Published for `verify:cockpit-webgl`, which asserts the governor resolved a
  // real tier from the table rather than silently rendering an undefined one.
  useEffect(() => {
    const host = document.querySelector<HTMLElement>(
      '[data-testid="cockpit-webgl-board"]'
    );
    if (host) host.dataset.renderTier = String(quality.tier);
  }, [quality.tier]);
  const interpolation = useMemo(() => {
    if (density !== 'extreme') return null;
    const buffer = createInterpolationBuffer(DENSE_SNAKE.length);
    recordTick(buffer, DENSE_SNAKE, 100, 1);
    recordTick(buffer, DENSE_SNAKE, 100, 2);
    return buffer;
  }, [density]);
  const posedBufferRef = useRef<InterpolationBuffer | null>(interpolation);
  posedBufferRef.current = interpolation;
  const bufferRef = walking ? walk.bufferRef : posedBufferRef;
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
      <hemisphereLight args={['#a9c3d5', GAME_SCREEN_COLORS.graphiteDeep, 0.42]} />
      <ambientLight intensity={0.12} />
      <primitive object={keyLightTarget} />
      <directionalLight
        position={[24, 18, 2]}
        target={keyLightTarget}
        color="#fff1dc"
        intensity={1.25}
        castShadow={quality.shadowsEnabled}
        shadow-mapSize={SHADOW_MAP_SIZE}
        shadow-camera-near={6}
        shadow-camera-far={44}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-bias={-0.0001}
        shadow-normalBias={0.02}
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
          boardTheme={boardTheme}
          boardSeamLines={boardSeamLines}
        />
      ) : (
        <>
          <ArenaFloor
            gridSize={GRID}
            accentColor={theme.primary}
          />
          <ArenaBorder
            gridSize={GRID}
            color={theme.secondary}
            emissiveIntensity={0.5}
          />
        </>
      )}
      <AimRenderer
        headPosition={headPosition}
        direction={heading}
        queuedDirections={[]}
        snake={snake}
        gridSize={GRID}
        aimSystem="deadeye"
        targets={aimTargets}
        bufferRef={bufferRef}
        color={GAME_SCREEN_COLORS.systemCyan}
        laneColor={theme.primary}
      />
      {density === 'extreme' || walking ? (
        <AssetGate
          label="the snake model"
          fallback={
            <InstancedSnakeFallback
              bufferRef={bufferRef}
              dynasty={dynasty}
              direction={heading}
              terrain={density === 'extreme' ? DENSE_TERRAIN : undefined}
              wrapActive={dynasty === 'COSMIC'}
              loadout={FIXTURE_LOADOUT}
            />
          }
        >
          <InstancedSnake
            bufferRef={bufferRef}
            dynasty={dynasty}
            direction={heading}
            terrain={density === 'extreme' ? DENSE_TERRAIN : undefined}
            wrapActive={dynasty === 'COSMIC'}
            loadout={FIXTURE_LOADOUT}
          />
        </AssetGate>
      ) : (
        <StaticSnake dynasty={dynasty} />
      )}
      {density === 'extreme' ? (
        <TerrainBlocks
          terrain={DENSE_TERRAIN}
          castShadow={quality.terrainCastsShadow}
        />
      ) : null}
      <FoodBeacon
        position={[FOOD.x + 0.5, 0, FOOD.z + 0.5]}
        color={GAME_SCREEN_COLORS.systemCyan}
        visualScale={1.12}
      />
      {foodStates === 'variants' ? (
        <>
          <FoodBeacon
            position={[FOOD_GOLDEN.x + 0.5, 0, FOOD_GOLDEN.z + 0.5]}
            variant="golden"
            visualScale={1.12}
          />
          <FoodBeacon
            position={[FOOD_WAGER.x + 0.5, 0, FOOD_WAGER.z + 0.5]}
            variant="wager"
            visualScale={1.12}
          />
        </>
      ) : null}
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

      {/*
        The fixture renders the SHIPPED camera, so `verify:cockpit-webgl` is
        measuring the real thing when it pins the canonical angle. `pitchDeg`
        is the dev-only judging escape; it is never set by the verifiers.
      */}
      <CameraRig
        gridSize={GRID}
        frameMargin={COCKPIT_FRAME_MARGIN}
        fitScale={COCKPIT_FIT_SCALE}
        defaultPolar={
          pitchDeg === undefined
            ? CANONICAL_POLAR
            : THREE.MathUtils.degToRad(pitchDeg)
        }
        targetY={COCKPIT_TARGET_Y}
      />

      {!isMobile && effectsEnabled && quality.composerEnabled && (
        <EffectComposer>
          {/* Governor-driven - see the note on the live board's Bloom. */}
          <Bloom
            resolutionScale={quality.bloomResolutionScale}
            luminanceThreshold={0.68}
            luminanceSmoothing={0.88}
            intensity={0.58}
            mipmapBlur
          />
        </EffectComposer>
      )}
      {/* Same repayment as the live board's FloorExposure: while the floor
          tier has the composer off, exposure repays bloom's luminance share.
          Mobile never runs the composer, so exposure stays 1 there. */}
      <FixtureFloorExposure
        exposure={
          !isMobile && effectsEnabled && !quality.composerEnabled
            ? quality.exposureCompensation
            : 1
        }
      />
    </>
  );
}

function FixtureFloorExposure({ exposure }: { exposure: number }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    gl.toneMappingExposure = exposure;
    return () => {
      gl.toneMappingExposure = 1;
    };
  }, [gl, exposure]);
  return null;
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
  foodStates = 'standard',
  forceRenderTier,
  pitchDeg,
  boardThemeSelection,
  boardSeamLines = false,
  boardPurple = null,
  arrivalMode = null,
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
      data-fixture-board-theme={
        resolveBoardTheme(boardThemeSelection ?? FIXTURE_BOARD_DEFAULT, dynasty)
          ?.id ?? 'stone'
      }
      data-fixture-seam-lines={boardSeamLines ? 'on' : 'off'}
      data-fixture-food-states={foodStates}
      // The review harness reads this back off the host element, so a shot's
      // filename is checked against what actually rendered rather than against
      // what the URL asked for.
      data-fixture-board-purple={boardPurple ?? BOARD_PURPLE_DEFAULT}
      data-fixture-arrival={arrivalMode ?? 'posed'}
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <Canvas
        camera={{
          position: [center, center * 2.4, center * 1.9],
          fov: CANONICAL_FOV,
        }}
        shadows
        dpr={isMobile ? [1, 1.5] : [1, 2]}
        // INK & AMBER: match the live board - no ACES shoulder over flat toon
        // fills. Linear at exposure 1 is the identity NoToneMapping was, but
        // honors toneMappingExposure - the floor tier's repayment knob.
        gl={{ alpha: true, antialias: true, toneMapping: LinearToneMapping }}
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
          foodStates={foodStates}
          forceRenderTier={forceRenderTier}
          pitchDeg={pitchDeg}
          boardThemeSelection={boardThemeSelection}
          boardSeamLines={boardSeamLines}
          boardPurple={boardPurple}
          arrivalMode={arrivalMode}
        />
        <RenderStatsProbe />
      </Canvas>
    </div>
  );
}

export default ArenaPrototypeCanvas;

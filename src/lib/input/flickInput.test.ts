/**
 * Micro-flick control system tests: recognizer segmentation, camera-relative
 * mapping, and the full pipeline into the engine's input queue.
 */

import {
  FlickRecognizer,
  DEFAULT_FLICK_CONFIG,
  ScreenFlickDirection,
} from './flickRecognizer';
import {
  azimuthToQuadrant,
  mapFlickToWorld,
  mapFlickWithAzimuth,
  mapWorldToScreen,
  mapWorldWithAzimuth,
} from './flickMapper';
import { SnakeGameLogic, Direction } from '@/lib/game/SnakeGameLogic';

const T = DEFAULT_FLICK_CONFIG.thresholdPx;

function drag(
  r: FlickRecognizer,
  from: [number, number],
  to: [number, number],
  t0: number,
  t1: number,
  steps = 6
) {
  const out: ScreenFlickDirection[] = [];
  for (let i = 1; i <= steps; i++) {
    const x = from[0] + ((to[0] - from[0]) * i) / steps;
    const y = from[1] + ((to[1] - from[1]) * i) / steps;
    const t = t0 + ((t1 - t0) * i) / steps;
    const cmd = r.pointerMove(x, y, t);
    if (cmd) out.push(cmd.direction);
  }
  return out;
}

describe('FlickRecognizer', () => {
  let r: FlickRecognizer;
  beforeEach(() => {
    r = new FlickRecognizer();
  });

  it('fires immediately on threshold crossing, not on release', () => {
    r.pointerDown(100, 100, 0);
    expect(r.pointerMove(100 + T - 1, 100, 10)).toBeNull();
    const cmd = r.pointerMove(100 + T + 1, 100, 16);
    expect(cmd?.direction).toBe('RIGHT');
    expect(cmd?.inputTime).toBe(16);
  });

  it('a long single-direction drag produces exactly one command', () => {
    r.pointerDown(0, 0, 0);
    const emitted = drag(r, [0, 0], [T * 6, 0], 0, 120, 24);
    expect(emitted).toEqual(['RIGHT']);
  });

  it('chained flicks in different directions fire back-to-back without release', () => {
    r.pointerDown(0, 0, 0);
    const first = drag(r, [0, 0], [T + 4, 0], 0, 30);
    const second = drag(r, [T + 4, 0], [T + 4, -(T + 4)], 30, 60);
    expect(first).toEqual(['RIGHT']);
    expect(second).toEqual(['UP']);
  });

  it('same-direction repeat requires a deliberate stall between segments', () => {
    r.pointerDown(0, 0, 0);
    expect(drag(r, [0, 0], [0, -(T + 4)], 0, 30)).toEqual(['UP']); // first UP
    // Continued fast movement upward: no re-fire
    expect(drag(r, [0, -(T + 4)], [0, -(T * 4)], 30, 60, 8)).toEqual([]);
    // Stall: barely any movement for the stall window
    r.pointerMove(0, -(T * 4) - 1, 60 + DEFAULT_FLICK_CONFIG.stallWindowMs + 5);
    // New deliberate segment upward fires again -> U-turn material
    expect(
      drag(
        r,
        [0, -(T * 4) - 1],
        [0, -(T * 5) - 8],
        180,
        210
      )
    ).toEqual(['UP']);
  });

  it('separate touch (release + re-touch) re-arms immediately', () => {
    r.pointerDown(0, 0, 0);
    expect(drag(r, [0, 0], [T + 4, 0], 0, 20)).toEqual(['RIGHT']);
    r.pointerUp();
    r.pointerDown(50, 50, 40);
    expect(drag(r, [50, 50], [50 + T + 4, 50], 40, 60)).toEqual(['RIGHT']);
  });

  it('diagonal movement picks the dominant axis', () => {
    r.pointerDown(0, 0, 0);
    const cmd = r.pointerMove(T + 6, -(T / 2), 12);
    expect(cmd?.direction).toBe('RIGHT');
  });

  it('ignores movement before pointerDown', () => {
    expect(r.pointerMove(500, 500, 0)).toBeNull();
  });
});

describe('flickMapper (camera-relative, frozen at input)', () => {
  it('quantizes azimuth to the nearest side quadrant', () => {
    expect(azimuthToQuadrant(0)).toBe(0);
    expect(azimuthToQuadrant(Math.PI / 2)).toBe(1);
    expect(azimuthToQuadrant(Math.PI)).toBe(2);
    expect(azimuthToQuadrant(-Math.PI / 2)).toBe(3);
    // Mid-snap animation angles resolve to the nearest side
    expect(azimuthToQuadrant(Math.PI / 2 - 0.2)).toBe(1);
    expect(azimuthToQuadrant(0.2)).toBe(0);
  });

  it('maps screen flicks through each camera side correctly', () => {
    // Default view (quadrant 0): what you see is what you get
    expect(mapFlickToWorld('UP', 0)).toBe('UP');
    expect(mapFlickToWorld('LEFT', 0)).toBe('LEFT');
    // Camera rotated 90deg: screen frame rotates with it
    expect(mapFlickToWorld('UP', 1)).toBe('LEFT');
    expect(mapFlickToWorld('RIGHT', 1)).toBe('UP');
    // Opposite side: everything mirrors
    expect(mapFlickToWorld('UP', 2)).toBe('DOWN');
    expect(mapFlickToWorld('LEFT', 2)).toBe('RIGHT');
    expect(mapFlickToWorld('DOWN', 3)).toBe('LEFT');
  });

  it('full-azimuth convenience matches quantize+map', () => {
    expect(mapFlickWithAzimuth('UP', Math.PI)).toBe('DOWN');
  });
});

describe('flickMapper inverse (world -> screen, queued-turns indicator)', () => {
  const SCREEN_DIRS: ScreenFlickDirection[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
  const QUADRANTS = [0, 1, 2, 3] as const;

  it('is the exact inverse of the forward map in every quadrant', () => {
    for (const q of QUADRANTS) {
      for (const screen of SCREEN_DIRS) {
        const world = mapFlickToWorld(screen, q);
        expect(mapWorldToScreen(world, q)).toBe(screen);
      }
    }
  });

  it('maps known cases: default view is identity, far side mirrors', () => {
    expect(mapWorldToScreen('UP', 0)).toBe('UP');
    expect(mapWorldToScreen('LEFT', 0)).toBe('LEFT');
    // Quadrant 1: screen UP -> world LEFT, so world LEFT reads back as UP
    expect(mapWorldToScreen('LEFT', 1)).toBe('UP');
    expect(mapWorldToScreen('UP', 1)).toBe('RIGHT');
    // Opposite side mirrors both axes
    expect(mapWorldToScreen('UP', 2)).toBe('DOWN');
    expect(mapWorldToScreen('RIGHT', 2)).toBe('LEFT');
  });

  it('azimuth convenience matches quantize+inverse-map', () => {
    expect(mapWorldWithAzimuth('DOWN', Math.PI)).toBe('UP');
    expect(mapWorldWithAzimuth('UP', 0)).toBe('UP');
  });
});

describe('Full pipeline: flicks -> mapper -> engine queue', () => {
  let game: SnakeGameLogic;
  let recognizer: FlickRecognizer;

  const feed = (screenDir: ScreenFlickDirection, azimuth = 0) => {
    const world = mapFlickWithAzimuth(screenDir, azimuth);
    game.setDirection(world, 'flick');
    return world;
  };

  beforeEach(() => {
    game = new SnakeGameLogic({ gridSize: 20 });
    game.start(); // snake starts moving world-RIGHT
    recognizer = new FlickRecognizer();
  });

  it('rapid L-turn: two quick flicks execute on consecutive nodes', () => {
    feed('UP'); // world UP
    feed('LEFT'); // world LEFT
    game.tick();
    expect(game.getState().direction).toBe('UP');
    game.tick();
    expect(game.getState().direction).toBe('LEFT');
  });

  it('repeated same local turn forms a U-turn over two nodes', () => {
    // Moving world-RIGHT, camera default. Two "turn left on screen" moves:
    // screen UP then screen LEFT is the local-left/local-left U-turn in
    // absolute form. Verify the queue executes the U.
    feed('UP');
    feed('LEFT');
    game.tick();
    game.tick();
    expect(game.getState().direction).toBe('LEFT'); // full 180 over two nodes
  });

  it('illegal direct reversal is rejected without corrupting the queue', () => {
    feed('UP'); // queued: UP
    feed('DOWN'); // reversal vs queued UP -> rejected by engine
    feed('LEFT'); // still accepted in order
    expect(game.getQueuedDirections()).toEqual(['UP', 'LEFT']);
    game.tick();
    game.tick();
    expect(game.getState().direction).toBe('LEFT');
  });

  it('drops an unintended third unresolved flick while preserving the L-turn', () => {
    feed('UP');
    feed('LEFT');
    feed('DOWN'); // third unresolved direction: dropped at mobile cap 2
    expect(game.getQueuedDirections()).toEqual(['UP', 'LEFT']);
    const seen: Direction[] = [];
    for (let i = 0; i < 3; i++) {
      game.tick();
      seen.push(game.getState().direction);
    }
    expect(seen).toEqual(['UP', 'LEFT', 'LEFT']);
  });

  it('camera on the opposite side inverts screen semantics at input time', () => {
    // Player sees the board from the far side: screen-LEFT is world-RIGHT.
    // Snake moves world-RIGHT, so a screen-LEFT flick (world RIGHT) is a
    // duplicate of the heading -> skipped; screen-UP (world DOWN) queues.
    const dup = feed('LEFT', Math.PI);
    expect(dup).toBe('RIGHT');
    expect(game.getQueuedDirections()).toEqual([]);
    feed('UP', Math.PI);
    expect(game.getQueuedDirections()).toEqual(['DOWN']);
  });

  it('chained high-speed input: recognizer segments feed the queue in order', () => {
    recognizer.pointerDown(200, 200, 0);
    const emitted: ScreenFlickDirection[] = [];
    // right, up, left drawn in one continuous fast touch
    for (const [to, t] of [
      [[200 + T + 4, 200], 20],
      [[200 + T + 4, 200 - (T + 4)], 40],
      [[200 - 4, 200 - (T + 4)], 60],
    ] as Array<[[number, number], number]>) {
      const cmd = recognizer.pointerMove(to[0], to[1], t);
      if (cmd) emitted.push(cmd.direction);
    }
    expect(emitted).toEqual(['RIGHT', 'UP', 'LEFT']);
    // But snake already moves RIGHT: first is a duplicate, next two queue.
    emitted.forEach(d => feed(d));
    expect(game.getQueuedDirections()).toEqual(['UP', 'LEFT']);
  });
});

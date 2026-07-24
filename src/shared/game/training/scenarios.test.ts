import {
  TRAINING_DIFFICULTIES,
  TRAINING_EXERCISE_IDS,
  TRAINING_SCENARIO_VERSION,
  createCircuitReferences,
  createSandboxScenario,
  createTrainingScenario,
} from '.';

function distance(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

describe('training scenarios', () => {
  it('generates every drill and difficulty deterministically inside the board', () => {
    for (const exercise of TRAINING_EXERCISE_IDS) {
      for (const difficulty of TRAINING_DIFFICULTIES) {
        const reference = {
          version: TRAINING_SCENARIO_VERSION,
          exercise,
          difficulty,
          seed: 'repeatable-seed',
        } as const;
        const first = createTrainingScenario(reference);
        const second = createTrainingScenario(reference);
        expect(second).toEqual(first);
        expect(first.path.length).toBeGreaterThan(4);
        expect(first.targets.length).toBeGreaterThan(0);
        expect(first.maxTicks).toBeGreaterThan(first.optimalTicks);
        expect(first.startSnake.every((cell) =>
          cell.x >= 0 && cell.x < 20 && cell.z >= 0 && cell.z < 20
        )).toBe(true);
        expect(first.path.every((cell) =>
          cell.x >= 0 && cell.x < 20 && cell.z >= 0 && cell.z < 20
        )).toBe(true);
        for (let index = 1; index < first.path.length; index += 1) {
          expect(distance(first.path[index - 1], first.path[index])).toBe(1);
        }
        for (let index = 1; index < first.startSnake.length; index += 1) {
          expect(distance(first.startSnake[index - 1], first.startSnake[index])).toBe(1);
        }
      }
    }
  });

  it('uses the seed to rotate or reflect authored exercises', () => {
    const variants = new Set(
      Array.from({ length: 12 }, (_, index) => {
        const scenario = createTrainingScenario({
          version: TRAINING_SCENARIO_VERSION,
          exercise: 'trace',
          difficulty: 'advanced',
          seed: `seed-${index}`,
        });
        return scenario.path.map((cell) => `${cell.x}:${cell.z}`).join('|');
      })
    );
    expect(variants.size).toBeGreaterThan(2);
  });

  it('builds one held-out reference per Circuit skill', () => {
    expect(createCircuitReferences('elite', 'circuit')).toEqual([
      { version: 1, exercise: 'trace', difficulty: 'elite', seed: 'circuit-1' },
      { version: 1, exercise: 'route', difficulty: 'elite', seed: 'circuit-2' },
      { version: 1, exercise: 'tempo', difficulty: 'elite', seed: 'circuit-3' },
      { version: 1, exercise: 'escape', difficulty: 'elite', seed: 'circuit-4' },
    ]);
  });

  it('accepts a valid custom path and rejects crossings or short paths', () => {
    const valid = [
      { x: 10, z: 10 }, { x: 11, z: 10 }, { x: 12, z: 10 },
      { x: 12, z: 9 }, { x: 12, z: 8 }, { x: 13, z: 8 },
    ];
    const scenario = createSandboxScenario({
      dynasty: 'COSMIC',
      tickMs: 47,
      startLength: 99,
      path: valid,
    });
    expect(scenario.kind).toBe('sandbox');
    expect(scenario.tickMs).toBe(50);
    expect(scenario.startSnake).toHaveLength(8);

    expect(() => createSandboxScenario({
      dynasty: 'PRIMAL', tickMs: 200, startLength: 3, path: valid.slice(0, 4),
    })).toThrow(/5 to 120/);
    expect(() => createSandboxScenario({
      dynasty: 'PRIMAL', tickMs: 200, startLength: 3,
      path: [...valid, { x: 12, z: 9 }],
    })).toThrow(/cross/);

    expect(() => createSandboxScenario({
      dynasty: 'PRIMAL', tickMs: 200, startLength: 3,
      path: [
        { x: 10, z: 10 }, { x: 11, z: 10 }, { x: 11, z: 11 },
        { x: 10, z: 11 }, { x: 9, z: 11 }, { x: 9, z: 10 },
      ],
    })).toThrow(/starting snake/);
  });
});

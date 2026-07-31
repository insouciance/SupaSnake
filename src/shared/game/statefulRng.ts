import { fnv1a } from '@/shared/game/offerGravity';

export const STATEFUL_RNG_VERSION = 1 as const;

export interface StatefulRngSnapshot {
  version: typeof STATEFUL_RNG_VERSION;
  algorithm: 'mulberry32';
  seed: number;
  state: number;
  draws: number;
}

function uint32(value: number): number {
  return value >>> 0;
}

/** Mulberry32 advances its internal cursor by this constant on every draw. */
// Constructor syntax keeps the production ES5 emit target compatible; both
// source numbers are exactly representable 32-bit integers.
const MULBERRY32_INCREMENT = BigInt(0x6d2b79f5);
const UINT32_MASK = BigInt(0xffff_ffff);

function expectedState(seed: number, draws: number): number {
  return Number(
    (BigInt(seed) + BigInt(draws) * MULBERRY32_INCREMENT) & UINT32_MASK
  );
}

/**
 * Exportable Mulberry32 stream used by recoverable runs.
 *
 * The existing game already uses Mulberry32 for deterministic challenges and
 * offer streams. This wrapper preserves the exact sequence while retaining
 * the cursor required to continue a server-verified checkpoint. It is game
 * simulation state, never an economy authority by itself.
 */
export class StatefulRng {
  private state: number;
  private draws = 0;

  constructor(private readonly seed: number) {
    this.state = uint32(seed);
  }

  static fromSeed(seed: string): StatefulRng {
    if (typeof seed !== 'string' || seed.length === 0 || seed.length > 256) {
      throw new Error('Simulation seed must be a non-empty bounded string');
    }
    return new StatefulRng(fnv1a(seed));
  }

  static restore(snapshot: StatefulRngSnapshot): StatefulRng {
    if (
      snapshot.version !== STATEFUL_RNG_VERSION ||
      snapshot.algorithm !== 'mulberry32' ||
      !Number.isSafeInteger(snapshot.seed) ||
      snapshot.seed < 0 ||
      snapshot.seed > 0xffff_ffff ||
      !Number.isSafeInteger(snapshot.state) ||
      snapshot.state < 0 ||
      snapshot.state > 0xffff_ffff ||
      !Number.isSafeInteger(snapshot.draws) ||
      snapshot.draws < 0 ||
      snapshot.state !== expectedState(snapshot.seed, snapshot.draws)
    ) {
      throw new Error('Invalid simulation RNG snapshot');
    }
    const rng = new StatefulRng(snapshot.seed);
    rng.state = uint32(snapshot.state);
    rng.draws = snapshot.draws;
    return rng;
  }

  next(): number {
    let t = (this.state = uint32(this.state + 0x6d2b79f5));
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.draws += 1;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }

  reset(): void {
    this.state = uint32(this.seed);
    this.draws = 0;
  }

  snapshot(): StatefulRngSnapshot {
    return {
      version: STATEFUL_RNG_VERSION,
      algorithm: 'mulberry32',
      seed: uint32(this.seed),
      state: uint32(this.state),
      draws: this.draws,
    };
  }
}

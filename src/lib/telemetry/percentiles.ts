/**
 * Nearest-rank percentiles over a small sample.
 *
 * One implementation, imported by both sides. The server summarises settlement
 * ages with it and the browser summarises input latency and tick jitter with
 * it, and if those two ever disagreed about what "p95" means, every comparison
 * between them would be quietly wrong (FM-1 — two computations of one fact are
 * a defect whether or not they currently agree).
 *
 * Nearest rank, not linear interpolation: the samples are milliseconds from
 * real events, the counts are small (a run produces hundreds of turns, a sweep
 * pass a handful of settlements), and an interpolated p95 invents a value that
 * nothing ever measured. Every number this returns is a number that happened.
 */

export interface SampleSummary {
  count: number;
  minMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
  meanMs: number | null;
}

/**
 * The value at `fraction` through the sorted sample, by nearest rank.
 * `sorted` must already be ascending; callers that hold a sorted array should
 * not pay to sort it twice.
 */
export function nearestRank(
  sorted: readonly number[],
  fraction: number
): number | null {
  if (sorted.length === 0) return null;
  const index = Math.ceil(fraction * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))];
}

export function summarizeSamples(samples: readonly number[]): SampleSummary {
  const sorted = samples
    .filter((value) => Number.isFinite(value))
    .slice()
    .sort((left, right) => left - right);
  if (sorted.length === 0) {
    return {
      count: 0,
      minMs: null,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
      maxMs: null,
      meanMs: null,
    };
  }
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    minMs: sorted[0],
    p50Ms: nearestRank(sorted, 0.5),
    p95Ms: nearestRank(sorted, 0.95),
    p99Ms: nearestRank(sorted, 0.99),
    maxMs: sorted[sorted.length - 1],
    meanMs: total / sorted.length,
  };
}

/**
 * A fixed-capacity ring of samples.
 *
 * A0 applies to instruments too: the longest runs are exactly the ones worth
 * measuring, and an unbounded array behind a per-turn instrument would grow
 * with the run and eventually cost the player frames. The ring keeps the most
 * recent `capacity` samples and counts everything it ever saw, so a long run
 * degrades the resolution of its own histogram rather than the run.
 */
export class SampleRing {
  private readonly values: number[] = [];
  private next = 0;
  private seen = 0;

  constructor(private readonly capacity: number) {}

  push(value: number): void {
    if (!Number.isFinite(value)) return;
    this.seen += 1;
    if (this.values.length < this.capacity) {
      this.values.push(value);
      return;
    }
    this.values[this.next] = value;
    this.next = (this.next + 1) % this.capacity;
  }

  /** How many samples were pushed, including any the ring has since dropped. */
  get observed(): number {
    return this.seen;
  }

  get size(): number {
    return this.values.length;
  }

  summary(): SampleSummary {
    return summarizeSamples(this.values);
  }

  reset(): void {
    this.values.length = 0;
    this.next = 0;
    this.seen = 0;
  }
}

import {
  ageMsBetween,
  computeRunDilation,
  dilationBand,
  settlementAgeBucket,
} from './runTelemetry';

describe('ageMsBetween', () => {
  it('measures forward from an ISO timestamp', () => {
    const from = '2026-08-06T12:00:00.000Z';
    expect(ageMsBetween(from, Date.parse(from) + 4_500)).toBe(4_500);
  });

  it('never returns a negative age', () => {
    const from = '2026-08-06T12:00:00.000Z';
    // Clock skew between the row's writer and this reader is real; a negative
    // age would read as "settled before it started" in every chart.
    expect(ageMsBetween(from, Date.parse(from) - 1_000)).toBe(0);
  });

  it('is null when there is no timestamp to measure from', () => {
    expect(ageMsBetween(null, Date.now())).toBeNull();
    expect(ageMsBetween(undefined, Date.now())).toBeNull();
    expect(ageMsBetween('not a date', Date.now())).toBeNull();
  });
});

describe('settlementAgeBucket', () => {
  it('buckets by magnitude', () => {
    expect(settlementAgeBucket(500)).toBe('under_10s');
    expect(settlementAgeBucket(30_000)).toBe('under_1m');
    expect(settlementAgeBucket(300_000)).toBe('under_10m');
    expect(settlementAgeBucket(1_800_000)).toBe('under_1h');
    expect(settlementAgeBucket(50_000_000)).toBe('under_1d');
    expect(settlementAgeBucket(200_000_000)).toBe('over_1d');
  });

  it('distinguishes unknown from fast', () => {
    // The sweep settles rows whose terminal timestamp predates the column.
    // Calling that "under_10s" would make the recovery latency look perfect.
    expect(settlementAgeBucket(null)).toBe('unknown');
    expect(settlementAgeBucket(Number.NaN)).toBe('unknown');
  });
});

describe('computeRunDilation', () => {
  const base = {
    sessionId: 'session-1',
    fromTick: 100,
    toTick: 200,
    fromSpeedMs: 200,
    toSpeedMs: 200,
  };

  it('reads about 1.0 for a run played at its own cadence', () => {
    // 100 ticks at a fixed 200ms is 20s of expected play.
    const result = computeRunDilation({ ...base, observedMs: 20_000 });
    expect(result.ticks).toBe(100);
    expect(result.expectedMs).toBe(20_000);
    expect(result.dilationRatio).toBeCloseTo(1);
    expect(result.band).toBe('nominal');
  });

  it('reads high when the wall clock outran the ticks', () => {
    // A backgrounded tab: the ticks did not happen, so wall clock ran on.
    const result = computeRunDilation({ ...base, observedMs: 120_000 });
    expect(result.dilationRatio).toBeCloseTo(6);
    expect(result.band).toBe('stalled');
  });

  it('reads low when more ticks happened than wall clock allows', () => {
    // The direction that cannot happen honestly.
    const result = computeRunDilation({ ...base, observedMs: 10_000 });
    expect(result.dilationRatio).toBeCloseTo(0.5);
    expect(result.band).toBe('compressed');
  });

  it('takes the mean interval across a segment whose cadence changed', () => {
    // CYBER speeds up with every food. 100 ticks from 200ms to 100ms is
    // measured against the 150ms mean of the endpoints.
    const result = computeRunDilation({
      ...base,
      toSpeedMs: 100,
      observedMs: 15_000,
    });
    expect(result.expectedMs).toBe(15_000);
    expect(result.dilationRatio).toBeCloseTo(1);
  });

  it('reports no ratio for a segment that carried no ticks', () => {
    const result = computeRunDilation({
      ...base,
      toTick: base.fromTick,
      observedMs: 5_000,
    });
    expect(result.dilationRatio).toBeNull();
    expect(result.band).toBe('no_ticks');
    // A zero-tick segment is a paused decision, not a violation.
    expect(result.claimedRatio).toBeNull();
  });

  it('compares the client clock against the same expectation', () => {
    const result = computeRunDilation({
      ...base,
      observedMs: 20_000,
      claimedElapsedMs: 10_000,
    });
    // The server saw 20s pass; the client's own play clock claims 10s of it
    // was play. Both ratios are reported so the disagreement is visible.
    expect(result.dilationRatio).toBeCloseTo(1);
    expect(result.claimedRatio).toBeCloseTo(0.5);
  });
});

describe('dilationBand', () => {
  it('is wide and advisory, not a threshold anything branches on', () => {
    expect(dilationBand(null)).toBe('no_ticks');
    expect(dilationBand(0.5)).toBe('compressed');
    expect(dilationBand(1)).toBe('nominal');
    expect(dilationBand(1.5)).toBe('nominal');
    expect(dilationBand(3)).toBe('slow');
    expect(dilationBand(10)).toBe('stalled');
    // An ordinary tab switch reaches 'stalled' easily. That is the point:
    // the band names the shape, the owner rules on the tolerance.
    expect(dilationBand(Number.POSITIVE_INFINITY)).toBe('no_ticks');
  });
});

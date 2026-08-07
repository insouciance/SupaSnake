import {
  buildDeathForensics,
  COYOTE_OBSERVATION_MS,
  InputLatencyMeter,
  RenderTierLedger,
  TickJitterMeter,
} from './runInstruments';
import { SampleRing, summarizeSamples } from '@/lib/telemetry/percentiles';

describe('summarizeSamples', () => {
  it('returns nearest-rank values that actually occurred', () => {
    const summary = summarizeSamples([10, 20, 30, 40, 100]);
    expect(summary.count).toBe(5);
    expect(summary.minMs).toBe(10);
    expect(summary.maxMs).toBe(100);
    // Nearest rank, never interpolation: every number reported is a number
    // that was measured.
    expect([10, 20, 30, 40, 100]).toContain(summary.p50Ms);
    expect(summary.p50Ms).toBe(30);
    expect(summary.p95Ms).toBe(100);
  });

  it('is empty rather than zero when nothing was sampled', () => {
    const summary = summarizeSamples([]);
    expect(summary.count).toBe(0);
    expect(summary.p50Ms).toBeNull();
    // A p50 of 0 would read as "instant", which is the opposite of "unknown".
    expect(summary.meanMs).toBeNull();
  });
});

describe('SampleRing', () => {
  it('bounds memory while still counting everything it saw (A0)', () => {
    const ring = new SampleRing(4);
    for (let i = 1; i <= 10; i += 1) ring.push(i);
    expect(ring.size).toBe(4);
    expect(ring.observed).toBe(10);
    // The most recent four, not the first four: a long run degrades its own
    // histogram resolution, never the run.
    expect(ring.summary().minMs).toBe(7);
    expect(ring.summary().maxMs).toBe(10);
  });
});

describe('InputLatencyMeter', () => {
  it('measures event timestamp to consuming tick', () => {
    const meter = new InputLatencyMeter();
    meter.record(1_000, 1_040);
    meter.record(1_100, 1_260);
    expect(meter.summary().count).toBe(2);
    expect(meter.summary().maxMs).toBe(160);
    expect(meter.observed).toBe(2);
  });

  it('drops samples whose clocks are not on one time origin', () => {
    const meter = new InputLatencyMeter();
    // A browser handing back epoch milliseconds against performance.now().
    meter.record(1_700_000_000_000, 5_000);
    // A synthetic event stamped after the tick that supposedly consumed it.
    meter.record(2_000, 1_000);
    meter.record(NaN, 1_000);
    expect(meter.summary().count).toBe(0);
  });
});

describe('TickJitterMeter', () => {
  it('reports lateness against the scheduled interval', () => {
    const meter = new TickJitterMeter();
    meter.record(0, 100);
    meter.record(100, 100); // on time  -> delta 0
    meter.record(340, 100); // 140 late -> delta 140
    const summary = meter.summary();
    expect(summary.count).toBe(2);
    expect(summary.maxMs).toBe(140);
    expect(summary.worstGapMs).toBe(240);
    expect(summary.worstGapScheduledMs).toBe(100);
    expect(meter.tickCount).toBe(3);
  });

  it('realizes ticks per second over the measured span', () => {
    const meter = new TickJitterMeter();
    meter.record(0, 200);
    meter.record(200, 200);
    meter.record(400, 200);
    // Two intervals across 400 ms is 5 ticks/second.
    expect(meter.summary().realizedTicksPerSecond).toBeCloseTo(5);
  });

  it('drops the sample straddling a cadence change rather than mis-attributing it', () => {
    const meter = new TickJitterMeter();
    meter.record(0, 200);
    // CYBER sped up: the gap belongs to the OLD interval, the schedule to the
    // new one. Neither describes this appointment.
    meter.record(120, 200);
    expect(meter.summary().count).toBe(0);
    // The gap is still tracked — it is a real gap, whatever it belongs to.
    expect(meter.summary().worstGapMs).toBe(120);
  });
});

describe('buildDeathForensics', () => {
  const base = {
    cause: 'wall' as const,
    tick: 412,
    dynasty: 'CYBER',
    tickIntervalMs: 120,
    fatalTickAtMs: 10_000,
  };

  it('counts a turn inside the observation window as the coyote zone', () => {
    const forensics = buildDeathForensics({
      ...base,
      lastInputAtMs: 9_930,
      alphaAtLastInput: 0.42,
      cellDistanceAtInput: 1,
      turnAfterFatalTickAtMs: 10_035,
    });
    expect(forensics.coyoteZone).toBe(true);
    expect(forensics.turnAfterFatalTickMs).toBe(35);
    expect(forensics.inputToFatalTickMs).toBe(70);
    expect(forensics.alphaAtLastInput).toBe(0.42);
  });

  it('does not count a turn beyond the observation window', () => {
    const forensics = buildDeathForensics({
      ...base,
      turnAfterFatalTickAtMs: base.fatalTickAtMs + COYOTE_OBSERVATION_MS + 1,
    });
    expect(forensics.coyoteZone).toBe(false);
    expect(forensics.turnAfterFatalTickMs).toBeNull();
  });

  it('observes wider than ET-2 intends to ship, so the data cannot agree by construction', () => {
    // The recommendation on the table is min(40ms, 0.25 x tick). A turn at
    // 50 ms is outside that and must still be COUNTED, or the cluster the
    // owner is sizing would be invisible past the proposed edge.
    const forensics = buildDeathForensics({
      ...base,
      turnAfterFatalTickAtMs: base.fatalTickAtMs + 50,
    });
    expect(COYOTE_OBSERVATION_MS).toBeGreaterThan(40);
    expect(forensics.coyoteZone).toBe(true);
  });

  it('records a death with no input near it as exactly that', () => {
    const forensics = buildDeathForensics(base);
    expect(forensics.coyoteZone).toBe(false);
    expect(forensics.inputToFatalTickMs).toBeNull();
    expect(forensics.alphaAtLastInput).toBeNull();
    expect(forensics.cellDistanceAtInput).toBeNull();
  });

  it('clamps alpha into its interpolation range', () => {
    expect(
      buildDeathForensics({ ...base, alphaAtLastInput: 1.4 }).alphaAtLastInput
    ).toBe(1);
    expect(
      buildDeathForensics({ ...base, alphaAtLastInput: -0.2 }).alphaAtLastInput
    ).toBe(0);
  });
});

describe('RenderTierLedger', () => {
  it('accumulates time at tier, demotions and the worst tier reached', () => {
    const ledger = new RenderTierLedger();
    ledger.start(0);
    ledger.recordTierChange(0, 1, 1_000);
    ledger.recordTierChange(1, 2, 1_500);
    ledger.recordTierChange(2, 1, 3_000);
    ledger.mark(4_000);

    const summary = ledger.summary();
    expect(summary.maxTier).toBe(2);
    expect(summary.finalTier).toBe(1);
    expect(summary.demotions).toBe(2);
    expect(summary.promotions).toBe(1);
    expect(summary.msAtTier[0]).toBe(1_000);
    expect(summary.msAtTier[1]).toBe(1_500);
    expect(summary.msAtTier[2]).toBe(1_500);
    expect(summary.sampledMs).toBe(4_000);
  });

  it('reports a clean run as tier 0 throughout', () => {
    const ledger = new RenderTierLedger();
    ledger.start(0);
    ledger.mark(9_000);
    const summary = ledger.summary();
    expect(summary.maxTier).toBe(0);
    expect(summary.demotions).toBe(0);
    expect(summary.msAtTier[0]).toBe(9_000);
  });

  it('starts clean for the next run', () => {
    const ledger = new RenderTierLedger();
    ledger.start(0);
    ledger.recordTierChange(0, 3, 500);
    ledger.start(10_000);
    ledger.mark(11_000);
    const summary = ledger.summary();
    expect(summary.maxTier).toBe(0);
    expect(summary.demotions).toBe(0);
    expect(summary.sampledMs).toBe(1_000);
  });
});

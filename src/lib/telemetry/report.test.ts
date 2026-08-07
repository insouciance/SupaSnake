import * as Sentry from '@sentry/nextjs';
import { reportTelemetry, telemetryBreadcrumb } from './report';

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

const captureException = Sentry.captureException as jest.Mock;
const captureMessage = Sentry.captureMessage as jest.Mock;
const addBreadcrumb = Sentry.addBreadcrumb as jest.Mock;

describe('reportTelemetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('captures an exception when an error is supplied, keeping its stack', () => {
    const error = new Error('reducer refused');
    reportTelemetry({
      channel: 'engine-reducer',
      message: 'genomeV2 reducer refused openCrownWave',
      error,
    });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureMessage).not.toHaveBeenCalled();
    expect(captureException.mock.calls[0][0]).toBe(error);
  });

  it('captures a message when there is no error', () => {
    reportTelemetry({ channel: 'run-settlement', message: 'run settled', level: 'info' });
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('defaults the fingerprint to channel + message so a channel is one issue', () => {
    reportTelemetry({ channel: 'run-continuity', message: 'refused', level: 'warning' });
    expect(captureMessage.mock.calls[0][1].fingerprint).toEqual([
      'run-continuity',
      'refused',
    ]);
  });

  it('always tags the channel so a dashboard can name what it reads', () => {
    reportTelemetry({
      channel: 'run-dilation',
      message: 'segment',
      level: 'info',
      tags: { dynasty: 'CYBER' },
    });
    expect(captureMessage.mock.calls[0][1].tags).toEqual({
      telemetry_channel: 'run-dilation',
      dynasty: 'CYBER',
    });
  });

  it('coerces tag values to strings and drops empty ones', () => {
    reportTelemetry({
      channel: 'run-governor',
      message: 'summary',
      level: 'info',
      tags: { max_render_tier: 3, demoted: true, absent: null, missing: undefined },
    });
    expect(captureMessage.mock.calls[0][1].tags).toEqual({
      telemetry_channel: 'run-governor',
      max_render_tier: '3',
      demoted: 'true',
    });
  });

  // THE PROPERTY THE WHOLE PACKAGE RESTS ON. Every capture site added by this
  // work sits inside a live run — the engine tick, the reducer, the checkpoint
  // save. Doctrine FM-3: a diagnostic may never end a run.
  it('does not throw when the Sentry SDK throws', () => {
    captureMessage.mockImplementation(() => {
      throw new Error('transport is down');
    });
    captureException.mockImplementation(() => {
      throw new Error('transport is down');
    });
    expect(() =>
      reportTelemetry({ channel: 'engine-tick', message: 'tick fault' })
    ).not.toThrow();
    expect(() =>
      reportTelemetry({ channel: 'engine-tick', message: 'tick fault', error: new Error('x') })
    ).not.toThrow();
  });

  it('does not throw on data that cannot be serialised', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() =>
      reportTelemetry({ channel: 'run-death', message: 'death', data: cyclic })
    ).not.toThrow();
  });
});

describe('telemetryBreadcrumb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adds a crumb under the channel category without sending an event', () => {
    telemetryBreadcrumb({
      channel: 'run-dilation',
      message: 'segment 100->200 ratio 1.002',
      data: { ticks: 100 },
    });
    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'run-dilation',
      level: 'info',
      message: 'segment 100->200 ratio 1.002',
      data: { ticks: 100 },
    });
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('does not throw when the SDK throws', () => {
    addBreadcrumb.mockImplementation(() => {
      throw new Error('scope is gone');
    });
    expect(() =>
      telemetryBreadcrumb({ channel: 'run-input', message: 'sample' })
    ).not.toThrow();
  });
});

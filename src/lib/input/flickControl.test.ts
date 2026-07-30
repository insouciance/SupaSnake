/**
 * FlickControl helper tests: interactive-target filtering, result->feedback
 * dispatch table, and debug ring-buffer bookkeeping.
 */

import {
  isInteractiveTarget,
  feedbackForResult,
  createInputDebugState,
  recordDebugEvent,
  debugEventsInOrder,
  DEBUG_RING_SIZE,
  type InputDebugEvent,
} from './flickControl';

describe('isInteractiveTarget (surface must not steal UI events)', () => {
  it('ignores plain elements and null', () => {
    const div = document.createElement('div');
    expect(isInteractiveTarget(div)).toBe(false);
    expect(isInteractiveTarget(null)).toBe(false);
  });

  it('detects buttons, links, and role=button, including nested targets', () => {
    const button = document.createElement('button');
    const icon = document.createElement('span');
    button.appendChild(icon);
    expect(isInteractiveTarget(button)).toBe(true);
    expect(isInteractiveTarget(icon)).toBe(true);

    const link = document.createElement('a');
    expect(isInteractiveTarget(link)).toBe(true);

    const fakeButton = document.createElement('div');
    fakeButton.setAttribute('role', 'button');
    const inner = document.createElement('svg');
    fakeButton.appendChild(inner);
    expect(isInteractiveTarget(fakeButton)).toBe(true);
    expect(isInteractiveTarget(inner)).toBe(true);
  });

  it('handles non-Element event targets (window, document)', () => {
    expect(isInteractiveTarget(window)).toBe(false);
    expect(isInteractiveTarget(document)).toBe(false);
  });
});

describe('feedbackForResult (spec: player always knows a command was queued)', () => {
  it('accepted: haptic + sound + confirming edge glow', () => {
    expect(feedbackForResult('accepted')).toEqual({
      haptic: true,
      sound: true,
      glow: 'accept',
    });
  });

  it('reversal, micro-U, and queue_full: silent red flash, no haptic', () => {
    for (const result of ['reversal', 'micro_u', 'queue_full'] as const) {
      expect(feedbackForResult(result)).toEqual({
        haptic: false,
        sound: false,
        glow: 'reject',
      });
    }
  });

  it('duplicate and inactive: no feedback at all', () => {
    for (const result of ['duplicate', 'inactive'] as const) {
      expect(feedbackForResult(result)).toEqual({
        haptic: false,
        sound: false,
        glow: null,
      });
    }
  });
});

describe('input debug ring buffer (?debug=input)', () => {
  const ev = (kind: InputDebugEvent['kind'], time: number): InputDebugEvent => ({
    kind,
    dir: 'UP',
    detail: '',
    time,
  });

  it('tracks last flick / rejection / exec independently', () => {
    const state = createInputDebugState();
    recordDebugEvent(state, ev('flick', 1));
    recordDebugEvent(state, ev('reject', 2));
    recordDebugEvent(state, ev('exec', 3));
    recordDebugEvent(state, ev('flick', 4));
    expect(state.lastFlick?.time).toBe(4);
    expect(state.lastRejection?.time).toBe(2);
    expect(state.lastExec?.time).toBe(3);
  });

  it('keeps only the last DEBUG_RING_SIZE events, in order', () => {
    const state = createInputDebugState();
    for (let i = 0; i < DEBUG_RING_SIZE + 3; i++) {
      recordDebugEvent(state, ev('flick', i));
    }
    const events = debugEventsInOrder(state);
    expect(events).toHaveLength(DEBUG_RING_SIZE);
    expect(events[0].time).toBe(3);
    expect(events[events.length - 1].time).toBe(DEBUG_RING_SIZE + 2);
  });

  it('returns partial history before the ring wraps', () => {
    const state = createInputDebugState();
    recordDebugEvent(state, ev('flick', 10));
    recordDebugEvent(state, ev('exec', 11));
    const events = debugEventsInOrder(state);
    expect(events.map((e) => e.time)).toEqual([10, 11]);
  });
});

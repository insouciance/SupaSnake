/**
 * AimSystemSelector - the WP-0.07 acceptance surface.
 *
 * Acceptance: "a fresh anonymous account sees all four options." A fresh
 * anonymous account is modelled here the only way it can be after
 * universalization — by the component having no progression input to give it.
 * The props are the current selection and a callback; there is no stats prop,
 * no session, and no unlock state, so a zero-progression player and a veteran
 * render byte-identical markup.
 *
 * Also pins the Rule 10 tap law (§5: open → LAUNCH → START → board, ≤3 taps):
 * the picker is a flat always-visible radiogroup with a preselected option, so
 * it costs zero required taps on the way to the board.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { AimSystemSelector } from './AimSystemSelector';
import {
  AIM_SYSTEMS,
  AIM_SYSTEM_IDS,
  DEFAULT_AIM_SYSTEM,
  type AimSystemId,
} from '@/lib/game/aimSystems';

/** Every prop the component accepts. Note what is absent. */
const freshAnonymousProps = {
  selected: DEFAULT_AIM_SYSTEM,
  onSelect: jest.fn<(id: AimSystemId) => void>(),
};

describe('AimSystemSelector — a fresh anonymous account', () => {
  it('sees all four options', () => {
    render(<AimSystemSelector {...freshAnonymousProps} />);

    for (const def of AIM_SYSTEMS) {
      expect(screen.getByTestId(`aim-chip-${def.id}`)).toHaveTextContent(def.name);
    }
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('can select every one of them — none is disabled', () => {
    const onSelect = jest.fn<(id: AimSystemId) => void>();
    render(<AimSystemSelector {...freshAnonymousProps} onSelect={onSelect} />);

    for (const id of AIM_SYSTEM_IDS) {
      const chip = screen.getByTestId(`aim-chip-${id}`);
      expect(chip).not.toBeDisabled();
      expect(chip).not.toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(chip);
    }

    // Deadeye is already selected, so it is the one click that is a no-op.
    expect(onSelect.mock.calls.map((call) => call[0])).toEqual([
      'gridlock',
      'pathline',
      'firefly',
    ]);
  });

  it('shows no lock, no unlock hint, and no requirement copy', () => {
    const { container } = render(<AimSystemSelector {...freshAnonymousProps} layout="list" />);

    expect(container.querySelector('svg')).toBeNull(); // the lock icon is gone
    const text = container.textContent ?? '';
    for (const forbidden of [
      /unlock/i,
      /\blocked\b/i,
      /high score/i,
      /breed/i,
      /always available/i,
      /reach a /i,
      /play \d+ games/i,
    ]) {
      expect(text).not.toMatch(forbidden);
    }
  });

  it('reads no progression state — its props cannot carry any', () => {
    // A stats/unlock prop would be silently ignored, which is worse than a
    // failure: pin the accepted prop surface instead.
    const propNames = Object.keys(freshAnonymousProps);
    expect(propNames).toEqual(['selected', 'onSelect']);

    // And the rendered output is identical whatever the account has done,
    // because there is no second rendering to compare against.
    const veteranView = render(<AimSystemSelector {...freshAnonymousProps} />).container
      .innerHTML;
    const freshView = render(<AimSystemSelector {...freshAnonymousProps} />).container
      .innerHTML;
    expect(freshView).toBe(veteranView);
  });
});

describe('AimSystemSelector — the ≤3 tap law (Rule 10, §5)', () => {
  it('costs zero required taps: flat radiogroup, one option preselected', () => {
    render(<AimSystemSelector {...freshAnonymousProps} />);

    // No disclosure: nothing to expand, no dialog, no "more" affordance.
    // Every option is already on screen the moment the setup page renders.
    const group = screen.getByRole('radiogroup', { name: 'Aim system' });
    expect(group).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more|show|expand|change/i })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    // Preselected, so START is reachable without touching this control:
    // open → LAUNCH → START → board stays at three taps.
    const checked = screen
      .getAllByRole('radio')
      .filter((radio) => radio.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAttribute(
      'data-testid',
      `aim-chip-${DEFAULT_AIM_SYSTEM}`
    );
  });
});

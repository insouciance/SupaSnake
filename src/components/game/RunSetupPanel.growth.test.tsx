/**
 * The growth readout (WP-3.02).
 *
 * It exists because three runs once played identically with nothing on screen
 * explaining why. Its first version then had the same disease: it read the
 * ENGINE's profile, which is `baseline` until the server answers, so it said
 * "Classic" whatever was selected. A readout that lies is worse than none.
 *
 * So these assert the two things that make it a diagnostic: it reflects the
 * SELECTION, and it renders whether or not the lab flag is armed.
 */

import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { RunSetupPanel } from './RunSetupPanel';
import { GROWTH_PROFILES, baseGrowthForFood } from '@/shared/game/growth';
import type { GrowthProfileId } from '@/shared/game/growth';

function note(id: GrowthProfileId) {
  const profile = GROWTH_PROFILES[id];
  return (
    <p data-testid="growth-readout">
      Growth: {profile.label} · +{baseGrowthForFood(profile, 1)} per food
      {profile.simultaneousFoods > 1
        ? ` · ${profile.simultaneousFoods} foods on the board`
        : ''}
    </p>
  );
}

function panel(id: GrowthProfileId, withSelector: boolean) {
  return render(
    <RunSetupPanel
      snake={{ name: 'Vyper', dynasty: 'PRIMAL' }}
      noSnakeAvailable={false}
      rulesetExplainer="Steady growth."
      masteryLevel={2}
      modeLabel="Earning run"
      aimLabel="Deadeye"
      startLabel="Start run"
      startTestId="earn-start"
      isStarting={false}
      onStart={() => {}}
      growthNote={note(id)}
      growthSelector={withSelector ? <div data-testid="growth-lab-selector" /> : null}
    />
  );
}

describe('the growth readout', () => {
  it('names the SELECTED profile and its rate', () => {
    panel('tuned', true);
    const readout = screen.getByTestId('growth-readout');
    expect(readout).toHaveTextContent('Tuned');
    expect(readout).toHaveTextContent('+6 per food');
    expect(readout).toHaveTextContent('3 foods on the board');
  });

  it('distinguishes every profile — the point of having it', () => {
    for (const [id, expected] of [
      ['baseline', '+1 per food'],
      ['tuned', '+6 per food'],
      ['aggressive', '+8 per food'],
    ] as const) {
      const { unmount } = panel(id, true);
      expect(screen.getByTestId('growth-readout')).toHaveTextContent(expected);
      unmount();
    }
  });

  it('renders even with the lab flag OFF — that is what makes it a diagnostic', () => {
    // With no selector (flag off) the line must still say Classic +1, so an
    // unarmed flag is visible instead of silent.
    panel('baseline', false);
    expect(screen.queryByTestId('growth-lab-selector')).toBeNull();
    const readout = screen.getByTestId('growth-readout');
    expect(readout).toHaveTextContent('Classic');
    expect(readout).toHaveTextContent('+1 per food');
  });
});

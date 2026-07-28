/**
 * The growth readout and its step notice (WP-3.09).
 *
 * These are the BEHAVIOUR assertions - what the player sees and what the
 * notice is allowed to do to them. The assertions that the readout is actually
 * connected to a live run live in `growthReadout.visible.test.ts`, because a
 * component that renders perfectly and is mounted nowhere is precisely the
 * defect WP-3.03 shipped.
 */

import { act, render, screen } from '@testing-library/react';
import { GROWTH_PROFILES, baseGrowthForFood } from '@/shared/game/growth';
import { GrowthReadout, GrowthStepNotice } from './GrowthReadout';

function readout(
  presentation: 'panel' | 'ticker' | 'cockpit',
  profileId: 'baseline' | 'tuned' | 'aggressive',
  n: number,
  /**
   * Overrides the profile's own count. Needed because WP-3.06 set
   * `simultaneousFoods` to 1 on ALL THREE profiles (owner: "what i certainly
   * don't like are the 3 foods on the screen"), so no shipped profile exercises
   * the multi-food branch any more — and that branch must survive anyway, since
   * COSMIC's constellation still places a group of 3 and the owner asked that
   * the food count stay a cheap dial rather than a rewrite.
   */
  foodsOnBoard?: number
) {
  const profile = GROWTH_PROFILES[profileId];
  return render(
    <GrowthReadout
      profileId={profile.id}
      label={profile.label}
      perFood={baseGrowthForFood(profile, n)}
      foodsOnBoard={foodsOnBoard ?? profile.simultaneousFoods}
      presentation={presentation}
    />
  );
}

describe('the growth readout', () => {
  it('reports the rate for the food in question, on every presentation', () => {
    // Tuned steps 6 -> 2 at food 12. Each presentation must carry the number
    // it was handed, so the same derivation drives the setup panel, the
    // cockpit and the rollback HUD.
    for (const presentation of ['panel', 'ticker', 'cockpit'] as const) {
      const { unmount } = readout(presentation, 'tuned', 1);
      expect(screen.getByTestId('growth-readout')).toHaveAttribute(
        'data-growth-per-food',
        '6'
      );
      unmount();

      const later = readout(presentation, 'tuned', 12);
      expect(screen.getByTestId('growth-readout')).toHaveAttribute(
        'data-growth-per-food',
        '2'
      );
      later.unmount();
    }
  });

  it('keeps naming the profile - that is what makes it a diagnostic', () => {
    // WP-3.02's reason for existing: three runs once played identically with
    // nothing on screen explaining why.
    readout('panel', 'baseline', 1);
    const line = screen.getByTestId('growth-readout');
    expect(line).toHaveTextContent('Classic');
    expect(line).toHaveTextContent('+1 per food');
    expect(line).toHaveAttribute('data-growth-profile', 'baseline');
  });

  it('states the food count only when there is more than one', () => {
    const single = readout('panel', 'baseline', 1);
    expect(screen.getByTestId('growth-readout')).not.toHaveTextContent(
      'foods on the board'
    );
    single.unmount();

    // Explicitly 3, not `aggressive`'s own count: every shipped profile is 1
    // after WP-3.06, so binding this case to a profile would have made it
    // assert nothing the moment the dial moved. It is the RENDERING of a count
    // above one that is under test here.
    readout('panel', 'aggressive', 1, 3);
    expect(screen.getByTestId('growth-readout')).toHaveTextContent(
      '3 foods on the board'
    );
  });

  it('every shipped profile now runs one food', () => {
    // The owner's ruling, pinned where the readout can see it: if a profile
    // ever goes back above one, the line above stops being hypothetical and
    // this test says so rather than letting it drift silently.
    for (const profile of Object.values(GROWTH_PROFILES)) {
      expect(profile.simultaneousFoods).toBe(1);
    }
  });

  it('is named for a screen reader on the in-run presentations', () => {
    // The compact chips show "+6"; the sentence has to come from somewhere.
    for (const presentation of ['ticker', 'cockpit'] as const) {
      const { unmount } = readout(presentation, 'tuned', 1);
      expect(screen.getByTestId('growth-readout')).toHaveAccessibleName(
        'Growth Tuned, plus 6 per food'
      );
      unmount();
    }
  });
});

describe('the growth step notice', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function notice(presentation: 'ticker' | 'cockpit', onDone = jest.fn()) {
    const view = render(
      <GrowthStepNotice
        from={6}
        to={2}
        presentation={presentation}
        onDone={onDone}
      />
    );
    return { view, onDone };
  }

  it('announces the step it was given, both HUDs', () => {
    for (const presentation of ['ticker', 'cockpit'] as const) {
      const { view } = notice(presentation);
      const el = screen.getByTestId('growth-step-notice');
      expect(el).toHaveTextContent('+6');
      expect(el).toHaveTextContent('+2');
      expect(el).toHaveAttribute('data-growth-step', 'down');
      expect(el).toHaveAccessibleName('Growth down: 6 to 2 segments per food');
      view.unmount();
    }
  });

  it('dismisses ITSELF, and nothing else has to', () => {
    // Rule 1 boundary (§3.3): auto-dismissing and non-blocking. If this timer
    // ever stops firing the notice becomes a permanent HUD element that the
    // player cannot clear, because there is deliberately nothing to click.
    const { onDone } = notice('cockpit');
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1800);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('drops its timer on unmount rather than firing into a dead tree', () => {
    const { view, onDone } = notice('ticker');
    view.unmount();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onDone).not.toHaveBeenCalled();
  });

  it('takes no input: nothing focusable, nothing clickable, polite not assertive', () => {
    // The whole reason this is not a Toast. `useToast` renders role="alert"
    // (assertive - wrong for a passive growth step) and ships a dismiss
    // button, i.e. it takes input, which §3.3 rules out.
    for (const presentation of ['ticker', 'cockpit'] as const) {
      const { view } = notice(presentation);
      const el = screen.getByTestId('growth-step-notice');
      expect(el).toHaveAttribute('role', 'status');
      expect(el).toHaveAttribute('aria-live', 'polite');
      expect(el.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0);
      expect(screen.queryByRole('alert')).toBeNull();
      view.unmount();
    }
  });

  it('marks a rise differently from a fall', () => {
    render(
      <GrowthStepNotice from={2} to={3} presentation="ticker" onDone={jest.fn()} />
    );
    expect(screen.getByTestId('growth-step-notice')).toHaveAttribute(
      'data-growth-step',
      'up'
    );
  });
});

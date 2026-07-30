/**
 * Tests for the read-only Season Track modal (Constitution v1.6 §7.2):
 * level/XP history, settling vs locked vs secured states, and reward labels.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  SeasonTrack,
  tierRewardLabel,
  type SeasonTierView,
  type SeasonTrackView,
  type SeasonView,
} from './SeasonTrack';

const season: SeasonView = {
  seq: 1,
  name: 'Season 1 — Solstice',
  theme: 'solstice',
  week: 3,
  weeks: 7,
  playoff_phase: 'none',
  genes: [
    { id: 'solstice_engine', name: 'Solstice Engine' },
    { id: 'glacial_reserve', name: 'Glacial Reserve' },
  ],
};

function tier(overrides: Partial<SeasonTierView>): SeasonTierView {
  return {
    level: 1,
    reward_type: 'cosmetic',
    reward_id: 'solstice_trail_1',
    reward_amount: null,
    claimed: false,
    ...overrides,
  };
}

function track(overrides: Partial<SeasonTrackView> = {}): SeasonTrackView {
  return {
    xp: 2200,
    level: 6,
    max_level: 30,
    xp_per_level: 400,
    tiers: [
      tier({ level: 1 }),
      tier({ level: 5, reward_type: 'cosmetic', reward_id: 'solstice_board_accent', claimed: true }),
      tier({ level: 10, reward_type: 'cosmetic', reward_id: 'solstice_trail_1' }),
      tier({ level: 30, reward_type: 'title', reward_id: 'solstice_sovereign' }),
    ],
    ...overrides,
  };
}

const baseProps = {
  isVisible: true,
  season,
  track: track(),
  onDismiss: jest.fn(),
};

describe('SeasonTrack', () => {
  it('renders nothing while hidden', () => {
    const { container } = render(<SeasonTrack {...baseProps} isVisible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the season name, week line, level and XP progress', () => {
    render(<SeasonTrack {...baseProps} />);
    expect(screen.getByText('Season 1 — Solstice')).toBeInTheDocument();
    expect(screen.getByTestId('season-week-line')).toHaveTextContent('Week 3 of 7');
    expect(screen.getByTestId('season-level')).toHaveTextContent('Level 6');
    expect(screen.getByTestId('season-genes')).toHaveTextContent('Solstice Engine');
    // 2200 XP at 400/level -> 200 into the current level
    expect(screen.getByText('200 / 400 XP')).toBeInTheDocument();
    // WP-1.05: the held-token line is deleted with the tokens themselves.
    expect(screen.queryByText(/reroll token/i)).not.toBeInTheDocument();
  });

  it('flags the playoff window on the week line', () => {
    render(
      <SeasonTrack
        {...baseProps}
        season={{ ...season, week: 7, playoff_phase: 'championship' }}
      />
    );
    expect(screen.getByTestId('season-week-line')).toHaveTextContent(
      /Playoffs: championship week/
    );
  });

  it('states: reached+unsettled is settling, settled is secured, future is locked', () => {
    render(<SeasonTrack {...baseProps} />);
    expect(screen.getByTestId('season-tier-1')).toHaveAttribute('data-state', 'settling');
    expect(screen.getByTestId('season-tier-5')).toHaveAttribute('data-state', 'secured');
    expect(screen.getByTestId('season-tier-10')).toHaveAttribute('data-state', 'locked');
    expect(screen.getByTestId('season-tier-30')).toHaveAttribute('data-state', 'locked');
    expect(screen.getByText('Securing…')).toBeInTheDocument();
    expect(screen.getByText('Secured')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /claim/i })).not.toBeInTheDocument();
  });

  it('closes through onDismiss', () => {
    const onDismiss = jest.fn();
    render(<SeasonTrack {...baseProps} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText('Close'));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('tierRewardLabel', () => {
  it('labels titles and prettified cosmetic ids', () => {
    // WP-1.05: the 'reroll_token' label is deleted - migration 047 removes
    // the unclaimed tiers that paid one, and nothing mints them again.
    expect(tierRewardLabel(tier({ reward_type: 'title' }))).toBe('Title');
    expect(
      tierRewardLabel(tier({ reward_type: 'cosmetic', reward_id: 'solstice_board_accent' }))
    ).toBe('Solstice Board Accent');
  });
});

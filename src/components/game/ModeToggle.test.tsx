/**
 * Tests for the pre-game run-mode toggle (Design v2 §7.4 Free Play)
 */

import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeToggle } from './ModeToggle';
import { GAME_CONFIG } from '@/shared/config/game';

describe('ModeToggle', () => {
  const baseProps = {
    mode: 'earn' as const,
    energy: 3,
    maxEnergy: GAME_CONFIG.economy.energy.maxEnergy,
    energyRegenAt: null,
    onSelect: jest.fn(),
  };

  it('renders EARN with the energy cost and FREE PLAY chips', () => {
    render(<ModeToggle {...baseProps} />);

    expect(screen.getByTestId('mode-earn')).toHaveTextContent(
      `EARN (${GAME_CONFIG.economy.energy.costPerGame}`
    );
    expect(screen.getByTestId('mode-free')).toHaveTextContent('FREE PLAY');
  });

  it('marks the selected mode with aria-pressed', () => {
    const { rerender } = render(<ModeToggle {...baseProps} mode="earn" />);
    expect(screen.getByTestId('mode-earn')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('mode-free')).toHaveAttribute('aria-pressed', 'false');

    rerender(<ModeToggle {...baseProps} mode="free" />);
    expect(screen.getByTestId('mode-earn')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('mode-free')).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects a mode on click', () => {
    const onSelect = jest.fn();
    render(<ModeToggle {...baseProps} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId('mode-free'));
    expect(onSelect).toHaveBeenCalledWith('free');

    fireEvent.click(screen.getByTestId('mode-earn'));
    expect(onSelect).toHaveBeenCalledWith('earn');
  });

  it('shows the no-rewards practice hint in free mode', () => {
    render(<ModeToggle {...baseProps} mode="free" />);
    expect(screen.getByTestId('mode-free-hint')).toHaveTextContent(
      /no rewards — pure practice/
    );
  });

  it('disables EARN at zero energy and keeps FREE PLAY available', () => {
    render(<ModeToggle {...baseProps} mode="free" energy={0} />);

    expect(screen.getByTestId('mode-earn')).toBeDisabled();
    expect(screen.getByTestId('mode-free')).not.toBeDisabled();
  });

  it('shows the regen countdown on the zero-energy message', () => {
    const in90s = new Date(Date.now() + 90_000).toISOString();
    render(
      <ModeToggle {...baseProps} mode="free" energy={0} energyRegenAt={in90s} />
    );

    const message = screen.getByTestId('mode-out-of-energy');
    expect(message).toHaveTextContent(/out of energy — keep practicing in free play/i);
    expect(message).toHaveTextContent(/or wait 1:[0-3][0-9]/i); // ~1:30 MM:SS
  });

  it('omits the zero-energy message when energy is available', () => {
    render(<ModeToggle {...baseProps} energy={2} />);
    expect(screen.queryByTestId('mode-out-of-energy')).toBeNull();
  });

  // --- Weekly Anomaly board (Design v2 §7.2) -------------------------------

  it('hides the ANOMALY chip while the board is not live (pre-021)', () => {
    render(<ModeToggle {...baseProps} />);
    expect(screen.queryByTestId('mode-anomaly')).toBeNull();
  });

  it('renders the ANOMALY chip when live and selects the mode on click', () => {
    const onSelect = jest.fn();
    render(
      <ModeToggle {...baseProps} onSelect={onSelect} anomalyName="Gold Rush" />
    );

    const chip = screen.getByTestId('mode-anomaly');
    expect(chip).toHaveTextContent('ANOMALY');
    fireEvent.click(chip);
    expect(onSelect).toHaveBeenCalledWith('anomaly');
  });

  it('shows the week-modifier hint in anomaly mode', () => {
    render(
      <ModeToggle {...baseProps} mode="anomaly" anomalyName="Blackout" />
    );
    const hint = screen.getByTestId('mode-anomaly-hint');
    expect(hint).toHaveTextContent(/This week: Blackout/);
    expect(hint).toHaveTextContent(/normal DNA, own leaderboard/);
  });

  it('disables ANOMALY at zero energy (anomaly runs are earning runs)', () => {
    render(
      <ModeToggle {...baseProps} mode="free" energy={0} anomalyName="Twin Exits" />
    );
    expect(screen.getByTestId('mode-anomaly')).toBeDisabled();
    expect(screen.getByTestId('mode-free')).not.toBeDisabled();
  });
});

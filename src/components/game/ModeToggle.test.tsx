/**
 * Tests for the pre-game run-mode toggle (Design v2 §7.4 Free Play)
 */

import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeToggle } from './ModeToggle';
import { GAME_CONFIG } from '@/shared/config/game';

const CAPACITY = GAME_CONFIG.economy.energy.capacity;

/** A day with charges left. */
const charged = {
  available: 3,
  capacity: CAPACITY,
  recoveryIntervalSeconds: 3600,
  recoveryStartedAt: '2026-07-25T12:00:00.000Z',
  nextRecoveryAt: '2026-07-25T13:00:00.000Z',
  recoveryProgress: 0,
  serverNow: '2026-07-25T12:00:00.000Z',
  remaining: 3,
  perDay: CAPACITY,
  usedToday: CAPACITY - 3,
  day: '2026-07-25',
  refillsAt: '2026-07-25T13:00:00.000Z',
};

/** A day whose rich harvest is spent. */
const spent = {
  ...charged,
  available: 0,
  remaining: 0,
  usedToday: CAPACITY,
};

describe('ModeToggle', () => {
  const baseProps = {
    mode: 'earn' as const,
    charge: charged,
    onSelect: jest.fn(),
  };

  it('renders EARN and FREE PLAY chips', () => {
    render(<ModeToggle {...baseProps} />);

    expect(screen.getByTestId('mode-earn')).toHaveTextContent('EARN');
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
    expect(screen.getByTestId('training-lab-link')).toHaveAttribute('href', '/training');
  });

  // --- The envelope never gates a mode (Constitution §8.6) -----------------

  it('keeps EARN enabled and selectable when the day is spent', () => {
    // This is the rule the old build broke: EARN and ANOMALY were disabled
    // at zero energy and Free Play was offered as the consolation. §8.6
    // abolishes the second-class run - every mode stays available.
    const onSelect = jest.fn();
    render(<ModeToggle {...baseProps} charge={spent} onSelect={onSelect} />);

    const earn = screen.getByTestId('mode-earn');
    expect(earn).not.toBeDisabled();
    fireEvent.click(earn);
    expect(onSelect).toHaveBeenCalledWith('earn');
  });

  it('explains the lean harvest without implying the run is blocked', () => {
    render(<ModeToggle {...baseProps} charge={spent} />);

    const message = screen.getByTestId('mode-lean-harvest');
    expect(message).toHaveTextContent(/this run still counts everywhere/i);
    expect(message).toHaveTextContent(/lean harvest/i);
    expect(message).toHaveTextContent(/one Energy recovers each hour/i);
    // No language of permission, waiting, or exhaustion.
    expect(message).not.toHaveTextContent(/out of energy/i);
    expect(message).not.toHaveTextContent(/wait/i);
    expect(message).not.toHaveTextContent(/cannot|can't|unavailable/i);
  });

  it('omits the lean notice while charges remain', () => {
    render(<ModeToggle {...baseProps} />);
    expect(screen.queryByTestId('mode-lean-harvest')).toBeNull();
  });

  it('omits the lean notice in free mode, which is exempt anyway', () => {
    render(<ModeToggle {...baseProps} mode="free" charge={spent} />);
    expect(screen.queryByTestId('mode-lean-harvest')).toBeNull();
  });

  it('shows no envelope copy at all before the server has synced', () => {
    render(<ModeToggle {...baseProps} charge={null} />);
    expect(screen.queryByTestId('mode-lean-harvest')).toBeNull();
    expect(screen.getByTestId('mode-earn')).not.toBeDisabled();
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
      <ModeToggle {...baseProps} mode="anomaly" anomalyName="Blackout" anomalyStrain="UMBRA" />
    );
    const hint = screen.getByTestId('mode-anomaly-hint');
    expect(hint).toHaveTextContent(/This week: Blackout/);
    expect(hint).toHaveTextContent(/Risk strain/);
    expect(hint).toHaveTextContent(/normal DNA, own leaderboard/);
  });

  it('keeps ANOMALY enabled when the day is spent', () => {
    const onSelect = jest.fn();
    render(
      <ModeToggle
        {...baseProps}
        charge={spent}
        onSelect={onSelect}
        anomalyName="Twin Exits"
      />
    );
    const chip = screen.getByTestId('mode-anomaly');
    expect(chip).not.toBeDisabled();
    fireEvent.click(chip);
    expect(onSelect).toHaveBeenCalledWith('anomaly');
  });
});

/**
 * Run Setup — the constitutional shape (§5).
 *
 * "First-time players see it fully preset: START is the only emphasized
 * action, zero required configuration. Everything adjustable, nothing
 * demanded." These assertions hold that line.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { RunSetupPanel, type RunSetupPanelProps } from './RunSetupPanel';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function props(overrides: Partial<RunSetupPanelProps> = {}): RunSetupPanelProps {
  return {
    snake: { name: 'Ouro', generation: 1, dynasty: 'CYBER' },
    noSnakeAvailable: false,
    rulesetExplainer: 'CYBER accelerates as you eat.',
    masteryLevel: 2,
    modeLabel: 'Earning run',
    aimLabel: 'Deadeye',
    startLabel: 'Play',
    startTestId: 'earn-start',
    isStarting: false,
    onStart: jest.fn(),
    startError: null,
    modeToggle: <div data-testid="mode-toggle" />,
    aimSelector: <div data-testid="aim-selector" />,
    controlScheme: <div data-testid="control-scheme" />,
    ...overrides,
  };
}

describe('RunSetupPanel', () => {
  it('is one consolidated surface with one primary action', () => {
    const { container } = render(<RunSetupPanel {...props()} />);
    expect(screen.getByTestId('run-setup')).toBeInTheDocument();
    // Emphasis in this design system is the `btn-go` treatment. Exactly one.
    expect(container.querySelectorAll('.btn-go')).toHaveLength(1);
    expect(screen.getByTestId('earn-start')).toHaveClass('btn-go');
  });

  it('presets the whole run: nothing is required before START', () => {
    render(<RunSetupPanel {...props()} />);
    const summary = screen.getByTestId('run-setup-summary');
    expect(summary).toHaveTextContent('Earning run');
    expect(summary).toHaveTextContent('Deadeye');
    expect(summary).toHaveTextContent('Mastery M2');
    expect(screen.getByTestId('earn-start')).toBeEnabled();
  });

  it('folds every adjustable control into one closed disclosure', () => {
    const { container } = render(<RunSetupPanel {...props()} />);
    const disclosures = container.querySelectorAll(
      '[data-testid="run-setup-adjust"]'
    );
    expect(disclosures).toHaveLength(1);
    expect((disclosures[0] as HTMLDetailsElement).open).toBe(false);
    for (const id of ['mode-toggle', 'aim-selector', 'control-scheme']) {
      expect(disclosures[0]).toContainElement(screen.getByTestId(id));
    }
  });

  it('names the equipped snake, its dynasty and its ruleset', () => {
    render(<RunSetupPanel {...props()} />);
    expect(screen.getByTestId('ruleset-explainer')).toHaveTextContent(
      'CYBER accelerates as you eat.'
    );
    expect(screen.getByText('Ouro')).toBeInTheDocument();
  });

  it('starts through its callback', () => {
    const onStart = jest.fn();
    render(<RunSetupPanel {...props({ onStart })} />);
    fireEvent.click(screen.getByTestId('earn-start'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('carries no commercial surface (Rule 7)', () => {
    const { container } = render(<RunSetupPanel {...props()} />);
    for (const anchor of Array.from(container.querySelectorAll('a[href]'))) {
      expect(anchor.getAttribute('href')).not.toMatch(/shop|premium|checkout/i);
    }
  });

  it('offers a recovery path instead of START when no snake resolved', () => {
    render(
      <RunSetupPanel {...props({ snake: null, noSnakeAvailable: true })} />
    );
    expect(screen.queryByTestId('earn-start')).toBeNull();
    expect(screen.queryByTestId('run-setup-adjust')).toBeNull();
    expect(screen.getByText(/Return Home to Retry/i)).toBeInTheDocument();
  });

  it('surfaces a start error without hiding START', () => {
    render(<RunSetupPanel {...props({ startError: 'Rate limited. Wait 5s' })} />);
    expect(screen.getByText('Rate limited. Wait 5s')).toBeInTheDocument();
    expect(screen.getByTestId('earn-start')).toBeInTheDocument();
  });

  /**
   * WP-2.07a. What the snake brings to the run is not an adjustable setting:
   * a trait that removes every mutation food is something the player has to
   * know BEFORE pressing START, so it sits outside the closed disclosure
   * while everything tunable stays inside it.
   */
  it('shows the heirloom block outside the disclosure, without a second emphasis', () => {
    const { container } = render(
      <RunSetupPanel
        {...props({ heirloom: <div data-testid="heirloom-summary" /> })}
      />
    );
    const heirloom = screen.getByTestId('heirloom-summary');
    const disclosure = screen.getByTestId('run-setup-adjust');

    expect(screen.getByTestId('run-setup')).toContainElement(heirloom);
    expect(disclosure).not.toContainElement(heirloom);
    // Still exactly one emphasised action (§5).
    expect(container.querySelectorAll('.btn-go')).toHaveLength(1);
  });

  it('drops the heirloom block when no snake resolved', () => {
    render(
      <RunSetupPanel
        {...props({
          snake: null,
          noSnakeAvailable: true,
          heirloom: <div data-testid="heirloom-summary" />,
        })}
      />
    );
    expect(screen.queryByTestId('heirloom-summary')).toBeNull();
  });
});

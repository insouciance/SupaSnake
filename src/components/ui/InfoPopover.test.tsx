/**
 * InfoPopover — the tap-to-explain primitive (WP-2.07a).
 *
 * These assertions hold the three properties that are load-bearing rather
 * than stylistic: the portal (so `overflow-hidden` hosts cannot clip it and
 * `z-[110]` clears ModalDialog's `z-[100]`), the always-present screen-
 * reader description (so the text arrives without a tap), and a panel with
 * nothing focusable in it (so the portal's DOM position cannot wreck the
 * tab order).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { InfoPopover } from './InfoPopover';

function renderPopover(props: Partial<React.ComponentProps<typeof InfoPopover>> = {}) {
  return render(
    <InfoPopover
      title="Scavenger"
      effect="First 15 foods +30% DNA"
      cost="Foods after 50: −10%"
      testId="scavenger"
      {...props}
    >
      <span>Scavenger</span>
    </InfoPopover>
  );
}

describe('InfoPopover', () => {
  it('reaches a screen reader without ever being opened', () => {
    renderPopover();
    const trigger = screen.getByTestId('info-popover-scavenger');

    // Closed: no panel.
    expect(screen.queryByTestId('info-panel-scavenger')).toBeNull();

    // But the description is already there and already wired up.
    const describedBy = trigger.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const description = document.getElementById(describedBy!);
    expect(description).toHaveClass('sr-only');
    expect(description).toHaveTextContent('Scavenger');
    expect(description).toHaveTextContent('First 15 foods +30% DNA');
    expect(description).toHaveTextContent('Foods after 50: −10%');
  });

  it('names the trigger explicitly rather than from its chip children', () => {
    // Chips carry their own aria-label; name-from-content would announce the
    // whole effect string as the button's NAME and then again as its
    // description.
    renderPopover();
    expect(
      screen.getByRole('button', { name: 'Scavenger: what it does' })
    ).toBeInTheDocument();
  });

  it('opens on tap and closes on a second tap', () => {
    renderPopover();
    const trigger = screen.getByTestId('info-popover-scavenger');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('info-panel-scavenger')).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('info-panel-scavenger')).toBeNull();
  });

  it('portals to document.body, fixed and above ModalDialog', () => {
    const { container } = renderPopover();
    fireEvent.click(screen.getByTestId('info-popover-scavenger'));
    const panel = screen.getByTestId('info-panel-scavenger');

    // The clipping motive: VariantCard and VariantDetailModal are both
    // overflow-hidden, so the panel must not live inside the component tree.
    expect(container.contains(panel)).toBe(false);
    expect(panel.parentElement).toBe(document.body);
    expect(panel.className).toContain('fixed');
    // ModalDialog's backdrop is z-[100]; anything lower vanishes behind it.
    expect(panel.className).toContain('z-[110]');
    expect(panel.className).toContain('max-w-[min(20rem,calc(100vw-2rem))]');
  });

  it('puts nothing focusable in the panel', () => {
    renderPopover({ notice: 'Ascetic: no mutation foods this run.' });
    fireEvent.click(screen.getByTestId('info-popover-scavenger'));
    const panel = screen.getByTestId('info-panel-scavenger');

    expect(
      panel.querySelectorAll('a, button, input, select, textarea, [tabindex]')
    ).toHaveLength(0);
    // The sr-only description already carries the words, so the visual
    // duplicate is hidden from assistive tech rather than read twice.
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel).toHaveTextContent('Ascetic: no mutation foods this run.');
  });

  it('never escalates to a dialog at any viewport', () => {
    renderPopover();
    fireEvent.click(screen.getByTestId('info-popover-scavenger'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
  });

  it('dismisses on an outside mousedown and on an outside touchstart', () => {
    renderPopover();
    const trigger = screen.getByTestId('info-popover-scavenger');

    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('info-panel-scavenger')).toBeNull();

    // Touch matters most here: this whole component exists because touch
    // devices never show a `title` tooltip.
    fireEvent.click(trigger);
    expect(screen.getByTestId('info-panel-scavenger')).toBeInTheDocument();
    fireEvent.touchStart(document.body);
    expect(screen.queryByTestId('info-panel-scavenger')).toBeNull();
  });

  it('stays open when the tap lands inside the panel or on the trigger', () => {
    renderPopover();
    const trigger = screen.getByTestId('info-popover-scavenger');
    fireEvent.click(trigger);

    fireEvent.mouseDown(screen.getByTestId('info-panel-scavenger'));
    expect(screen.getByTestId('info-panel-scavenger')).toBeInTheDocument();

    fireEvent.mouseDown(trigger);
    expect(screen.getByTestId('info-panel-scavenger')).toBeInTheDocument();
  });

  it('closes on Escape and gives focus back to the trigger', () => {
    renderPopover();
    const trigger = screen.getByTestId('info-popover-scavenger');
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('info-panel-scavenger')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('drops the cost line for a documented costless entry', () => {
    renderPopover({ title: 'Gilt', effect: 'Every food +5%', cost: '' });
    fireEvent.click(screen.getByTestId('info-popover-scavenger'));
    const panel = screen.getByTestId('info-panel-scavenger');
    expect(panel).toHaveTextContent('Every food +5%');
    expect(panel.querySelectorAll('p')).toHaveLength(2); // title + effect
  });
});

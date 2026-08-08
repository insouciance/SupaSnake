/**
 * HeirloomSummary — what the equipped snake brings to this run (WP-2.07a).
 *
 * The load-bearing assertion is the negative one: this block is NOT behind
 * the spawn-point gate, because traits are live from run 1 while strain pips
 * genuinely are not. And it carries no `btn-go`, because Run Setup has
 * exactly one emphasised action and `RunSetupPanel.test.tsx` pins that.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { HeirloomSummary } from './HeirloomSummary';
import { describe as describeEntry } from '@/shared/game/lexicon';
import { TRAITS } from '@/shared/game/traits';

describe('HeirloomSummary', () => {
  it('names the equipped traits and fills the remaining slots', () => {
    render(<HeirloomSummary traits={['scavenger']} slots={2} />);
    expect(screen.getByTestId('heirloom-summary')).toBeInTheDocument();
    expect(screen.getByTestId('trait-chip-scavenger')).toBeInTheDocument();
    expect(screen.getByTestId('trait-slot-empty')).toBeInTheDocument();
  });

  it('makes every trait tappable, which is the defect this WP exists for', () => {
    // `TRAITS[].effect` shipped long ago, but only as an HTML `title` — so a
    // player on a phone could never read it.
    render(<HeirloomSummary traits={['scavenger', 'gambler']} slots={2} />);

    const trigger = screen.getByTestId('info-popover-trait-gambler');
    fireEvent.click(trigger);

    const panel = screen.getByTestId('info-panel-trait-gambler');
    expect(panel).toHaveTextContent(TRAITS.gambler.effect);
    expect(panel).toHaveTextContent(TRAITS.gambler.cost);
  });

  it('warns when a trait removes a whole system, and only informs when one is dampened', () => {
    const { rerender } = render(<HeirloomSummary traits={['ascetic']} slots={1} />);
    const warning = screen.getByTestId('heirloom-notice-ascetic');
    expect(warning).toHaveTextContent('no mutation foods');
    expect(warning.className).toContain('text-strike-red');

    rerender(<HeirloomSummary traits={['patient']} slots={1} />);
    const notice = screen.getByTestId('heirloom-notice-patient');
    expect(notice).toHaveTextContent(
      describeEntry('trait', 'patient')!.runNotice!.text
    );
    expect(notice.className).not.toContain('text-strike-red');
  });

  it('says nothing extra for a trait that removes nothing', () => {
    render(<HeirloomSummary traits={['scavenger']} slots={1} />);
    expect(screen.queryByTestId('heirloom-notice-scavenger')).toBeNull();
  });

  it('offers a traitless snake potential rather than silence', () => {
    render(<HeirloomSummary traits={[]} slots={1} />);
    expect(screen.getByTestId('heirloom-empty')).toHaveTextContent(
      'breed in the Lab to fill this slot'
    );
    expect(screen.getByTestId('trait-slot-empty')).toBeInTheDocument();
  });

  it('never carries the one emphasised action', () => {
    // RunSetupPanel.test.tsx asserts exactly one `.btn-go` in the panel.
    const { container } = render(
      <HeirloomSummary traits={['ascetic', 'gambler']} slots={2} />
    );
    expect(container.querySelectorAll('.btn-go')).toHaveLength(0);
  });

  it('never exceeds the hard slot cap, whatever it is handed', () => {
    const { container } = render(<HeirloomSummary traits={[]} slots={99} />);
    expect(container.querySelectorAll('[data-testid="trait-slot-empty"]')).toHaveLength(2);
  });

  /**
   * COMPACT, NOT CUT (owner item 5, 2026-08-08).
   *
   * "ruleset line and heirloom block can remain, but COMPACT." Every fact this
   * block ever stated is still stated — the tests above are the proof of that,
   * and not one of them was weakened to make room. What went is a ROW: the
   * "Heirlooms" label now sits ON the chip row rather than above it, which is
   * a label doing what a label does at no cost to what it labels. Setup's
   * binding constraint is that the Energy reactor still ends above the fold on
   * a 320x568 phone, so a row saved here is a row the reactor gets.
   */
  it('spends one row on the label and the chips together, not two', () => {
    render(<HeirloomSummary traits={['scavenger']} slots={2} />);
    const label = screen.getByText('Heirlooms');
    const chip = screen.getByTestId('trait-chip-scavenger');
    const empty = screen.getByTestId('trait-slot-empty');
    expect(label.parentElement).toContainElement(chip);
    expect(label.parentElement).toContainElement(empty);
  });

  it('keeps the recess, and only its padding got smaller', () => {
    render(<HeirloomSummary traits={[]} slots={1} />);
    const block = screen.getByTestId('heirloom-summary');
    /*
     * Still a recess cut into the Setup tray — one tray, one frame. The tray
     * went DARK on the owner's 2026-08-08 ruling, so the recess it is cut into
     * takes the deck's rung of the same ladder instead of paper's. It is the
     * identical object and the identical rule; what changed is the ground the
     * whole surface is drawn on.
     */
    expect(block).toHaveClass('deck-recess');
    expect(block).toHaveClass('py-1.5');
    expect(block).not.toHaveClass('p-2');
    // The empty-state note keeps every word and loses only its leading.
    expect(screen.getByTestId('heirloom-empty')).toHaveClass('leading-tight');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { ModalDialog } from './ModalDialog';

describe('ModalDialog', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('portals above transformed parents and locks viewport scrolling', () => {
    const onClose = jest.fn();
    const { unmount } = render(
      <div data-testid="clipped-parent" className="animate-fade-up overflow-hidden">
        <ModalDialog
          onClose={onClose}
          ariaLabel="Authentication"
          testId="test-dialog"
          panelClassName="max-w-sm"
        >
          <button type="button">Continue</button>
        </ModalDialog>
      </div>
    );

    const dialog = screen.getByRole('dialog', { name: 'Authentication' });
    const layer = dialog.closest('[data-modal-layer="true"]');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('clipped-parent')).not.toContainElement(dialog);
    expect(layer?.parentElement).toBe(document.body);
    expect(layer).toHaveClass('fixed', 'inset-0', 'z-[100]', 'overflow-y-auto');
    expect(document.body).toHaveStyle({ overflow: 'hidden' });
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on Escape and backdrop input but not panel input', () => {
    const onClose = jest.fn();
    render(
      <ModalDialog onClose={onClose} ariaLabel="Authentication" testId="test-dialog">
        <button type="button">Continue</button>
      </ModalDialog>
    );

    const dialog = screen.getByTestId('test-dialog');
    const layer = dialog.closest('[data-modal-layer="true"]');
    if (!layer) throw new Error('Expected a modal layer');

    fireEvent.pointerDown(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(layer);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { AccountUpgradeModal } from './UpgradePrompt';

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ isAnonymous: true, isLoading: false }),
}));

jest.mock('@/components/auth/AccountUpgrade', () => ({
  AccountUpgrade: () => <div>Account upgrade form</div>,
}));

describe('AccountUpgradeModal', () => {
  it('uses the viewport dialog layer instead of its triggering parent', () => {
    const onClose = jest.fn();
    render(
      <div data-testid="navigation-context" className="animate-fade-up overflow-hidden">
        <AccountUpgradeModal isOpen onClose={onClose} />
      </div>
    );

    const dialog = screen.getByRole('dialog', { name: 'Create an account' });
    const layer = dialog.closest('[data-modal-layer="true"]');

    expect(screen.getByTestId('navigation-context')).not.toContainElement(dialog);
    expect(layer?.parentElement).toBe(document.body);
    expect(layer).toHaveClass('z-[100]');
    expect(screen.getByText('Account upgrade form')).toBeInTheDocument();

    if (!layer) throw new Error('Expected a modal layer');
    fireEvent.pointerDown(layer);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

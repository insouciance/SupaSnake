/**
 * Toast Component Tests
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { Toast, ToastProvider, useToast } from './Toast';

const mockUsePathname = jest.fn(() => '/');

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('Toast', () => {
  describe('Toast component', () => {
    it('renders with message', () => {
      render(
        <Toast
          id="test-1"
          message="Test notification"
          type="info"
          onDismiss={() => {}}
        />
      );
      expect(screen.getByText('Test notification')).toBeInTheDocument();
    });

    it('calls onDismiss when close button clicked', () => {
      const onDismiss = jest.fn();
      render(
        <Toast
          id="test-1"
          message="Test notification"
          type="info"
          onDismiss={onDismiss}
        />
      );

      fireEvent.click(screen.getByRole('button'));
      expect(onDismiss).toHaveBeenCalledWith('test-1');
    });

    it('cannot intercept steering input when rendered non-interactively', () => {
      const onDismiss = jest.fn();
      render(
        <Toast
          id="test-1"
          message="Splice unlocked"
          type="triumph"
          onDismiss={onDismiss}
          interactive={false}
        />
      );

      const toast = screen.getByRole('alert');
      expect(toast).toHaveAttribute('data-input-transparent', 'true');
      expect(toast).toHaveClass('pointer-events-none');
      expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    });

    it('renders success type with correct styling', () => {
      render(
        <Toast
          id="test-1"
          message="Success!"
          type="success"
          onDismiss={() => {}}
        />
      );
      const toast = screen.getByText('Success!').parentElement;
      expect(toast).toHaveClass('[--glow:#4ade80]');
    });

    it('renders error type with correct styling', () => {
      render(
        <Toast
          id="test-1"
          message="Error!"
          type="error"
          onDismiss={() => {}}
        />
      );
      const toast = screen.getByText('Error!').parentElement;
      expect(toast).toHaveClass('[--glow:#f43f5e]');
    });
  });

  describe('useToast hook', () => {
    function TestComponent() {
      const { showToast, toasts } = useToast();
      return (
        <div>
          <button onClick={() => showToast('Test message', 'info')}>
            Show Toast
          </button>
          <div data-testid="toast-count">{toasts.length}</div>
        </div>
      );
    }

    it('adds toast when showToast is called', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');

      fireEvent.click(screen.getByText('Show Toast'));

      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');
    });
  });

  describe('ToastProvider', () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue('/');
    });

    it('renders children', () => {
      render(
        <ToastProvider>
          <div data-testid="child">Child content</div>
        </ToastProvider>
      );
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('auto-dismisses toasts after duration', () => {
      jest.useFakeTimers();

      function TestComponent() {
        const { showToast, toasts } = useToast();
        return (
          <div>
            <button onClick={() => showToast('Test', 'info', 1000)}>Show</button>
            <div data-testid="count">{toasts.length}</div>
          </div>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show'));
      expect(screen.getByTestId('count')).toHaveTextContent('1');

      act(() => {
        jest.advanceTimersByTime(1100);
      });

      expect(screen.getByTestId('count')).toHaveTextContent('0');

      jest.useRealTimers();
    });

    it('makes every live-run toast input-transparent while preserving the notice', () => {
      mockUsePathname.mockReturnValue('/game');

      function TestComponent() {
        const { showToast } = useToast();
        return <button onClick={() => showToast('Strain awakened', 'triumph')}>Show</button>;
      }

      const { container } = render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show'));

      const noticeLayer = container.querySelector('[data-live-run="true"]');
      expect(noticeLayer).toHaveClass('pointer-events-none');
      expect(screen.getByRole('alert')).toHaveAttribute('data-input-transparent', 'true');
      expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    });

    it('keeps notices dismissible away from active gameplay', () => {
      function TestComponent() {
        const { showToast } = useToast();
        return <button onClick={() => showToast('Saved', 'success')}>Show</button>;
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show'));
      expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveClass('pointer-events-auto');
    });
  });
});

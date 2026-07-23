import { render, screen } from '@testing-library/react';
import { NotificationBadge } from './NotificationBadge';

describe('NotificationBadge', () => {
  it('renders nothing for hidden and empty numeric states', () => {
    const { container, rerender } = render(<NotificationBadge kind="hidden" />);
    expect(container).toBeEmptyDOMElement();

    rerender(<NotificationBadge kind="numeric" count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces exact counts while visually capping large values', () => {
    render(<NotificationBadge kind="numeric" count={120} />);

    expect(screen.getByRole('status', { name: '120 unread notifications' })).toHaveTextContent('99+');
  });

  it('supports an accessible exclamation indicator', () => {
    render(<NotificationBadge kind="exclamation" label="New Lab discovery" />);

    expect(screen.getByRole('status', { name: 'New Lab discovery' })).toHaveTextContent('!');
  });
});

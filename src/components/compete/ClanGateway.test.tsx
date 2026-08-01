import { render, screen } from '@testing-library/react';
import { ClanGateway } from './ClanGateway';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('ClanGateway', () => {
  it('makes Clan visibly discoverable within Compete without adding a primary pillar', () => {
    render(<ClanGateway />);

    const entry = screen.getByRole('link', { name: 'Open Clan competition' });
    expect(entry).toHaveAttribute('href', '/clan');
    expect(entry).toHaveClass('min-h-[76px]');
    expect(screen.getByText('Clan Energy Battle')).toHaveClass('whitespace-nowrap');
    expect(screen.getByText('Find · Form · Fight')).toHaveClass('truncate');
  });
});

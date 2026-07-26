/**
 * The clan directory (§9.2): alive-only, no total, and readable when it is
 * empty or when every clan in it has one member.
 *
 * The empty directory is the state a solo player actually meets pre-launch, so
 * it is tested as a first-class reading rather than as a fallback.
 */

import { render, screen, within } from '@testing-library/react';
import { ClanDirectory, type ClanDirectoryRow } from './ClanDirectory';

const SOLO_CLAN: ClanDirectoryRow = {
  id: 'c1',
  name: 'Lone Coil',
  tag: 'LC',
  memberCount: 1,
  bestWeekDepth: 320,
  lastHuntedWeek: '2026-07-20',
};

describe('the empty directory is a reading, not a dead end', () => {
  it('offers founding as the way to fill it', () => {
    render(<ClanDirectory clans={[]} />);

    const empty = screen.getByTestId('clan-directory-empty');
    expect(empty).toHaveTextContent(/No clan has settled a hunt yet/i);
    expect(empty).toHaveTextContent(/be the first name here/i);
  });

  it('says a clan of one needs nobody else, so the empty list costs nothing', () => {
    render(<ClanDirectory clans={[]} />);
    expect(screen.getByTestId('clan-directory-empty')).toHaveTextContent(
      /nothing here you are waiting on other people for/i
    );
  });

  it('shows the loading state instead of the empty one while reading', () => {
    render(<ClanDirectory clans={[]} loading />);
    expect(screen.getByTestId('clan-directory-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('clan-directory-empty')).not.toBeInTheDocument();
  });
});

describe('N = 1: a directory of one clan, with one member', () => {
  it('lists it on the same terms as any other clan', () => {
    render(<ClanDirectory clans={[SOLO_CLAN]} />);

    const row = screen.getByTestId('directory-row');
    expect(within(row).getByText('Lone Coil')).toBeInTheDocument();
    expect(within(row).getByText('[LC]')).toBeInTheDocument();
    expect(row).toHaveTextContent('1 member · deepest week 320 segments');
  });

  it('says "1 member", never "1/20"', () => {
    const { container } = render(<ClanDirectory clans={[SOLO_CLAN]} />);
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*\d+/);
  });

  it('links the week the clan last hunted (Rule 14)', () => {
    render(<ClanDirectory clans={[SOLO_CLAN]} />);
    expect(screen.getByTestId('directory-week-link')).toHaveAttribute(
      'href',
      '/serpent?week=2026-07-20'
    );
  });

  it('omits the week link rather than linking nowhere', () => {
    render(<ClanDirectory clans={[{ ...SOLO_CLAN, lastHuntedWeek: null }]} />);
    expect(screen.queryByTestId('directory-week-link')).not.toBeInTheDocument();
  });
});

describe('what the directory must never show (§9.2, Rule 8)', () => {
  const clans: ClanDirectoryRow[] = [
    SOLO_CLAN,
    { id: 'c2', name: 'Dragon Lords', tag: 'DRAG', memberCount: 12, bestWeekDepth: 9000, lastHuntedWeek: '2026-07-20' },
  ];

  it('shows no population total and no "showing N of M"', () => {
    const { container } = render(<ClanDirectory clans={clans} />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/\bshowing\b/i);
    expect(text).not.toMatch(/\b\d+\s+clans\b/i);
    expect(text).not.toMatch(/\btotal\b/i);
  });

  it('numbers nobody and offers no join button', () => {
    const { container } = render(<ClanDirectory clans={clans} />);

    expect(container.querySelector('ol')).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByText(/^join$/i)).not.toBeInTheDocument();
  });

  it('renders both clans, the one-member one first as the server sent them', () => {
    render(<ClanDirectory clans={clans} />);
    const rows = screen.getAllByTestId('directory-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Lone Coil');
  });
});

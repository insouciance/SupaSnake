import { fireEvent, render, screen, within } from '@testing-library/react';
import { ClanDirectory, type ClanDirectoryRow } from './ClanDirectory';

function clan(overrides: Partial<ClanDirectoryRow> = {}): ClanDirectoryRow {
  return {
    id: 'open-clan',
    name: 'Lone Coil',
    tag: 'COIL',
    bannerId: 'cosmic_veil',
    emblemId: 'coil',
    colorPrimary: '#a855f7',
    memberCount: 5,
    maxMembers: 12,
    availableSpots: 7,
    joinPolicy: 'open',
    bestWeekDepth: 4320,
    recentActivityAt: '2026-07-31T10:00:00Z',
    lastHuntedWeek: '2026-07-31',
    lastHuntKind: 'energy_battle',
    ...overrides,
  };
}

describe('ClanDirectory discovery controls', () => {
  it('searches and filters with mobile-sized controls', () => {
    const onQueryChange = jest.fn();
    const onPolicyChange = jest.fn();
    const onHasSpaceChange = jest.fn();
    render(
      <ClanDirectory
        clans={[]}
        query="coil"
        policy="application"
        hasSpace
        onQueryChange={onQueryChange}
        onPolicyChange={onPolicyChange}
        onHasSpaceChange={onHasSpaceChange}
      />
    );

    const search = screen.getByRole('searchbox');
    expect(search).toHaveClass('min-h-[44px]');
    fireEvent.change(search, { target: { value: 'fang' } });
    fireEvent.change(screen.getByLabelText('Join policy'), { target: { value: 'open' } });
    fireEvent.click(screen.getByLabelText('Has space'));

    expect(onQueryChange).toHaveBeenCalledWith('fang');
    expect(onPolicyChange).toHaveBeenCalledWith('open');
    expect(onHasSpaceChange).toHaveBeenCalledWith(false);
  });

  it('shows the truthful action for open, application, and invite-only clans', () => {
    const onRequest = jest.fn();
    render(
      <ClanDirectory
        clans={[
          clan(),
          clan({ id: 'apply-clan', name: 'Deep Fangs', joinPolicy: 'application' }),
          clan({ id: 'invite-clan', name: 'Hidden Coil', joinPolicy: 'invite_only' }),
        ]}
        onRequestMembership={onRequest}
      />
    );

    const rows = screen.getAllByTestId('directory-row');
    const join = within(rows[0]).getByRole('button', { name: 'Join Lone Coil' });
    const apply = within(rows[1]).getByRole('button', { name: 'Apply to Deep Fangs' });
    expect(join).toHaveClass('min-h-[44px]');
    expect(apply).toHaveClass('min-h-[44px]');
    expect(within(rows[2]).getByTestId('invite-only-state')).toHaveTextContent('Invite required');
    expect(within(rows[2]).queryByRole('button')).not.toBeInTheDocument();

    fireEvent.click(join);
    fireEvent.click(apply);
    expect(onRequest).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'open-clan' }));
    expect(onRequest).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'apply-clan' }));
  });

  it('replaces Apply with durable pending feedback after the server reports an application', () => {
    render(
      <ClanDirectory
        clans={[clan({ id: 'apply-clan', joinPolicy: 'application' })]}
        pendingClanIds={new Set(['apply-clan'])}
        onRequestMembership={jest.fn()}
      />
    );
    expect(screen.getByTestId('application-pending')).toHaveTextContent('Application sent');
    expect(screen.queryByRole('button', { name: /Apply to/ })).not.toBeInTheDocument();
  });

  it('shows capacity, policy, activity and verified performance without fabricating results', () => {
    render(<ClanDirectory clans={[clan()]} />);
    const row = screen.getByTestId('directory-row');
    expect(row).toHaveTextContent('5/12 members');
    expect(row).toHaveTextContent('7 spots open');
    expect(row).toHaveTextContent('Open');
    expect(row).toHaveTextContent('4,320');
    expect(within(row).getByTestId('directory-week-link')).toHaveAttribute('href', '/serpent');
    const report = within(row).getByRole('link', { name: 'Report clan Lone Coil' });
    expect(report.getAttribute('href')).toContain('mailto:support@supasnake.com?');
    expect(report.getAttribute('href')).toContain('open-clan');
  });

  it('provides a useful empty-search recovery', () => {
    render(<ClanDirectory clans={[]} />);
    expect(screen.getByTestId('clan-directory-empty')).toHaveTextContent(/broader filters/i);
    expect(screen.getByTestId('clan-directory-empty')).toHaveTextContent(/found the clan/i);
  });
});

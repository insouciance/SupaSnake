import { fireEvent, render, screen } from '@testing-library/react';
import { ClanRoster } from './ClanRoster';
import type {
  ClanFullView,
  ClanPermissions,
  ClanRosterEntry,
} from './useClanFull';

const ownerPermissions: ClanPermissions = {
  invite: true,
  reviewApplications: true,
  removeMembers: true,
  manageCoLeaders: true,
  manageSettings: true,
  transferOwnership: true,
  assignGlory: true,
};
const coLeaderPermissions: ClanPermissions = {
  ...ownerPermissions,
  manageCoLeaders: false,
  manageSettings: false,
  transferOwnership: false,
  assignGlory: false,
};
const memberPermissions: ClanPermissions = {
  invite: false,
  reviewApplications: false,
  removeMembers: false,
  manageCoLeaders: false,
  manageSettings: false,
  transferOwnership: false,
  assignGlory: false,
};

function member(overrides: Partial<ClanRosterEntry>): ClanRosterEntry {
  const role = overrides.role ?? 'member';
  return {
    userId: 'member-user',
    role,
    roleLabel: role === 'owner' ? 'Leader' : role === 'co_leader' ? 'Co-leader' : 'Member',
    permissions: role === 'owner' ? ownerPermissions : role === 'co_leader' ? coLeaderPermissions : memberPermissions,
    joinedAt: '2026-07-01T00:00:00Z',
    tenureSince: '2026-07-01T00:00:00Z',
    identity: null,
    contribution: {
      cycleIndex: 8,
      hasEligibleContribution: true,
      bestFiveDepth: 1200,
      rank: 2,
      eligibleResults: 4,
      bestGeneration: 11,
      lastContributedAt: '2026-07-31T10:00:00Z',
    },
    ...overrides,
  };
}

function view(role: 'owner' | 'co_leader' | 'member'): ClanFullView {
  const permissions = role === 'owner' ? ownerPermissions : role === 'co_leader' ? coLeaderPermissions : memberPermissions;
  return {
    clan: { name: 'Coil Guard' },
    membership: {
      clanId: 'clan-1',
      role,
      roleLabel: role === 'owner' ? 'Leader' : role === 'co_leader' ? 'Co-leader' : 'Member',
      permissions,
      joinedAt: '2026-07-01T00:00:00Z',
    },
    limits: { maxMembers: 12, softFullMembers: 6 },
    roster: [
      member({ userId: 'owner-user', role: 'owner', contribution: { cycleIndex: 8, hasEligibleContribution: true, bestFiveDepth: 3300, rank: 1, eligibleResults: 5, bestGeneration: 20, lastContributedAt: null } }),
      member({ userId: 'co-user', role: 'co_leader', contribution: { cycleIndex: 8, hasEligibleContribution: true, bestFiveDepth: 900, rank: 3, eligibleResults: 3, bestGeneration: 9, lastContributedAt: null } }),
      member({ userId: 'member-user', role: 'member', contribution: { cycleIndex: 8, hasEligibleContribution: false, bestFiveDepth: null, rank: null, eligibleResults: 0, bestGeneration: null, lastContributedAt: null } }),
    ],
  };
}

describe('ClanRoster competitive truth', () => {
  it('shows earned rank, best five, generation and a distinct no-result state', () => {
    render(<ClanRoster accessToken="token" viewerUserId="member-user" view={view('member')} onChanged={jest.fn()} />);
    const rows = screen.getAllByTestId('roster-row');
    expect(rows[0]).toHaveTextContent('#1');
    expect(rows[0]).toHaveTextContent('3,300');
    expect(rows[0]).toHaveTextContent('Gen 20');
    expect(screen.getByTestId('no-eligible-result')).toHaveTextContent(/No eligible Energy result/i);
    expect(screen.getByText('You')).toBeInTheDocument();
    const reportLinks = screen.getAllByRole('link', { name: 'Report handle Handler' });
    expect(reportLinks).toHaveLength(3);
    expect(reportLinks[0].getAttribute('href')).toContain('owner-user');
  });

  it('gives a Member no governance controls', () => {
    render(<ClanRoster accessToken="token" viewerUserId="member-user" view={view('member')} onChanged={jest.fn()} />);
    expect(screen.queryByText('Manage')).not.toBeInTheDocument();
    expect(screen.queryByText('Make Co-leader')).not.toBeInTheDocument();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
  });

  it('lets a Co-leader care for Members but not alter peers or leadership', () => {
    render(<ClanRoster accessToken="token" viewerUserId="co-user" view={view('co_leader')} onChanged={jest.fn()} />);
    expect(screen.getAllByText('Manage')).toHaveLength(1);
    expect(screen.getByText('Remove')).toHaveClass('min-h-[44px]');
    expect(screen.queryByText('Make Co-leader')).not.toBeInTheDocument();
    expect(screen.queryByText('Make Leader')).not.toBeInTheDocument();
  });

  it('requires an explicit consequence dialog before leadership transfer', () => {
    render(<ClanRoster accessToken="token" viewerUserId="owner-user" view={view('owner')} onChanged={jest.fn()} />);
    fireEvent.click(screen.getAllByText('Make Leader')[0]);
    const dialog = screen.getByTestId('roster-confirmation');
    expect(dialog).toHaveTextContent(/become Leader immediately/i);
    expect(dialog).toHaveTextContent(/remain in the clan as a Co-leader/i);
    expect(screen.getByRole('button', { name: 'Transfer leadership' })).toHaveClass('min-h-[44px]');
  });
});

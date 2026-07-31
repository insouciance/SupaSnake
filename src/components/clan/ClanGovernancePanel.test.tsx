import { render, screen } from '@testing-library/react';
import { ClanGovernancePanel } from './ClanGovernancePanel';
import type { ClanFullView, ClanPermissions } from './useClanFull';

const leader: ClanPermissions = {
  invite: true,
  reviewApplications: true,
  removeMembers: true,
  manageCoLeaders: true,
  manageSettings: true,
  transferOwnership: true,
  assignGlory: true,
};
const coLeader: ClanPermissions = { ...leader, manageCoLeaders: false, manageSettings: false, transferOwnership: false, assignGlory: false };
const basic: ClanPermissions = { invite: false, reviewApplications: false, removeMembers: false, manageCoLeaders: false, manageSettings: false, transferOwnership: false, assignGlory: false };

function governanceView(role: 'owner' | 'co_leader' | 'member'): ClanFullView {
  const permissions = role === 'owner' ? leader : role === 'co_leader' ? coLeader : basic;
  return {
    clan: { name: 'Coil Guard' },
    membership: { clanId: 'clan-1', role, roleLabel: role === 'owner' ? 'Leader' : role === 'co_leader' ? 'Co-leader' : 'Member', permissions, joinedAt: '2026-07-01' },
    settings: { joinPolicy: 'application' },
    invite: { code: 'ABC23456', url: '/clan/join/ABC23456' },
    applications: [{ id: 'app-1', applicantUserId: 'candidate', status: 'pending', createdAt: '2026-07-30T00:00:00Z', identity: null }],
  };
}

describe('ClanGovernancePanel role matrix', () => {
  it('gives the Leader applications, exact-handle invitations, and settings', () => {
    render(<ClanGovernancePanel accessToken="token" view={governanceView('owner')} onChanged={jest.fn()} />);
    expect(screen.getByText('Applications')).toBeInTheDocument();
    expect(screen.getByLabelText('Exact player handle')).toBeInTheDocument();
    expect(screen.getByText('Membership settings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toHaveClass('min-h-[44px]');
  });

  it('gives a Co-leader recruitment and review but not policy control', () => {
    render(<ClanGovernancePanel accessToken="token" view={governanceView('co_leader')} onChanged={jest.fn()} />);
    expect(screen.getByText('Applications')).toBeInTheDocument();
    expect(screen.getByLabelText('Exact player handle')).toBeInTheDocument();
    expect(screen.queryByText('Membership settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Replace code')).not.toBeInTheDocument();
  });

  it('does not render an empty management wall for a Member', () => {
    const { container } = render(<ClanGovernancePanel accessToken="token" view={governanceView('member')} onChanged={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClanGloryPanel } from './ClanGloryPanel';
import type {
  ClanFullView,
  ClanPermissions,
  ClanRosterEntry,
} from './useClanFull';

const leaderPermissions: ClanPermissions = {
  invite: true,
  reviewApplications: true,
  removeMembers: true,
  manageCoLeaders: true,
  manageSettings: true,
  transferOwnership: true,
  assignGlory: true,
};

function contributor(): ClanRosterEntry {
  return {
    userId: 'ace-user',
    role: 'member',
    roleLabel: 'Member',
    permissions: { invite: false, reviewApplications: false, removeMembers: false, manageCoLeaders: false, manageSettings: false, transferOwnership: false, assignGlory: false },
    joinedAt: '2026-07-01T00:00:00Z',
    tenureSince: '2026-07-01T00:00:00Z',
    identity: null,
    contribution: {
      cycleIndex: 8,
      hasEligibleContribution: true,
      bestFiveDepth: 5432,
      rank: 1,
      eligibleResults: 5,
      bestGeneration: 20,
      lastContributedAt: '2026-07-31T10:00:00Z',
    },
  };
}

function gloryView(canAssign = true): ClanFullView {
  return {
    clan: { name: 'Coil Guard' },
    membership: {
      clanId: 'clan-1',
      role: canAssign ? 'owner' : 'member',
      roleLabel: canAssign ? 'Leader' : 'Member',
      permissions: canAssign ? leaderPermissions : { invite: false, reviewApplications: false, removeMembers: false, manageCoLeaders: false, manageSettings: false, transferOwnership: false, assignGlory: false },
      joinedAt: '2026-07-01T00:00:00Z',
    },
    roster: [contributor()],
    glory: {
      terms: {
        maxSeats: 2,
        rewardDna: 250,
        minimumTenureSeconds: 604800,
        minimumContributionDepth: 1,
        allowOwnerSelfAward: false,
        allowPendingReassignment: false,
      },
      seats: [{
        id: 'glory-1',
        seat: 1,
        holderUserId: 'historic-user',
        holderIdentity: null,
        assignedByUserId: 'leader-user',
        sourceCycleIndex: 7,
        effectiveCycleIndex: 8,
        effectiveAt: '2026-08-01T00:00:00Z',
        evidenceDepth: 4100,
        evidenceRank: 1,
        evidenceContributionCount: 5,
        rewardDna: 250,
        assignedAt: '2026-07-28T00:00:00Z',
        state: 'active',
        rewarded: false,
      }],
    },
  };
}

describe('ClanGloryPanel', () => {
  afterEach(() => jest.restoreAllMocks());

  it('makes the seat public proof instead of a decorative title', () => {
    render(<ClanGloryPanel accessToken="token" view={gloryView(false)} onChanged={jest.fn()} />);
    expect(screen.getByTestId('glory-seat-1')).toHaveTextContent('rank #1');
    expect(screen.getByTestId('glory-seat-1')).toHaveTextContent('4,100 Depth');
    expect(screen.getByTestId('glory-seat-2')).toHaveTextContent('Unassigned');
    expect(screen.queryByText(/Assign next battle/)).not.toBeInTheDocument();
  });

  it('requires a deliberate, evidence-rich confirmation before assignment', () => {
    render(<ClanGloryPanel accessToken="token" viewerUserId="leader-user" view={gloryView()} onChanged={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Seat'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Contributor'), { target: { value: 'ace-user' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review assignment' }));

    const dialog = screen.getByTestId('glory-confirmation');
    expect(dialog).toHaveTextContent('rank #1');
    expect(dialog).toHaveTextContent('5,432 Depth');
    expect(dialog).toHaveTextContent('locks for the next battle');
    expect(dialog).toHaveTextContent('250 DNA');
    expect(screen.getByRole('button', { name: 'Confirm Glory' })).toHaveClass('min-h-[44px]');
  });

  it('posts only target and seat, then refreshes the server view', async () => {
    const onChanged = jest.fn();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: { assignment_id: 'assignment-1' } }),
    } as Response);
    render(<ClanGloryPanel accessToken="token" viewerUserId="leader-user" view={gloryView()} onChanged={onChanged} />);
    fireEvent.change(screen.getByLabelText('Seat'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Contributor'), { target: { value: 'ace-user' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review assignment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Glory' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({ action: 'assign_glory', targetUserId: 'ace-user', seat: 2 });
  });
});

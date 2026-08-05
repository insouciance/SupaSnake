/**
 * A guest meets the ownership rule BEFORE the form, not after the spend
 * (WP-E; PEO §6 "Anonymous accounts may not found or own a clan").
 *
 * The server refuses the write either way — `src/app/api/clan/route.test.ts`
 * owns that half — but a refusal delivered at the end of naming a clan,
 * choosing heraldry and confirming a DNA cost is the same rule delivered as a
 * trap. These tests assert the honest path: the reason, the one action that
 * fixes it, and the join form still there beside it.
 */

import { fireEvent, render, screen } from '@testing-library/react';

const mockUseAuth = jest.fn();
const mockUseClanFull = jest.fn();
const mockUseClanDirectory = jest.fn();

jest.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));
jest.mock('@/components/clan/useClanFull', () => ({
  clanAction: jest.fn(),
  useClanFull: (...args: unknown[]) => mockUseClanFull(...args),
  useClanDirectory: (...args: unknown[]) => mockUseClanDirectory(...args),
}));
jest.mock('@/components/ui/NavBar', () => ({ NavBar: () => null }));
jest.mock('@/components/clan/EnergyBattlePanel', () => ({ EnergyBattlePanel: () => null }));
jest.mock('@/components/clan/DuelPanel', () => ({ DuelPanel: () => null }));
jest.mock('@/components/clan/GauntletPanel', () => ({ GauntletPanel: () => null }));
jest.mock('@/components/clan/PlayoffBracket', () => ({ PlayoffBracket: () => null }));
jest.mock('@/components/clan/ClanIdentityEditor', () => ({ ClanIdentityEditor: () => null }));
jest.mock('@/components/clan/ClanDiscordPanel', () => ({ ClanDiscordPanel: () => null }));
jest.mock('@/components/clan/ClanDirectory', () => ({ ClanDirectory: () => null }));
jest.mock('@/components/clan/ClanGovernancePanel', () => ({ ClanGovernancePanel: () => null }));
jest.mock('@/components/clan/ClanGloryPanel', () => ({ ClanGloryPanel: () => null }));
jest.mock('@/components/clan/ClanRoster', () => ({
  ClanRoster: () => null,
  InviteInbox: () => null,
}));

import ClanPage from './page';

function setup(isAnonymous: boolean) {
  mockUseAuth.mockReturnValue({
    user: { id: 'user-1' },
    session: { access_token: 'token' },
    isAuthenticated: true,
    isAnonymous,
  });
  mockUseClanFull.mockReturnValue({
    view: { clan: null, membership: null, competitiveConfig: { foundingDnaCost: 500 } },
    loading: false,
    error: null,
    refresh: jest.fn(),
  });
  mockUseClanDirectory.mockReturnValue({
    clans: [],
    loading: false,
    error: null,
    refresh: jest.fn(),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

/** The clan journey opens on Discover; founding lives one tab across. */
function openFoundTab() {
  fireEvent.click(screen.getByRole('tab', { name: /found or invite/i }));
}

describe('founding as a guest', () => {
  it('replaces the founding form with the reason and the fix', () => {
    setup(true);
    render(<ClanPage />);
    openFoundTab();
    const panel = screen.getByTestId('found-clan-account-required');
    expect(panel).toHaveTextContent(/save your account first/i);
    expect(screen.getByTestId('found-clan-save-account')).toHaveAttribute(
      'href',
      '/signup'
    );
    expect(screen.queryByRole('button', { name: /review founding/i })).toBeNull();
  });

  it('never quotes a DNA cost it is going to refuse', () => {
    setup(true);
    render(<ClanPage />);
    openFoundTab();
    expect(screen.queryByText(/founding cost/i)).toBeNull();
    expect(screen.queryByText(/500 DNA/)).toBeNull();
  });

  it('keeps joining wide open — a guest’s runs are real runs', () => {
    setup(true);
    render(<ClanPage />);
    openFoundTab();
    expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^join$/i })).toBeInTheDocument();
  });

  it('leaves a saved account’s founding form exactly as it was', () => {
    setup(false);
    render(<ClanPage />);
    openFoundTab();
    expect(screen.queryByTestId('found-clan-account-required')).toBeNull();
    expect(screen.getByRole('button', { name: /review founding/i })).toBeInTheDocument();
    expect(screen.getByText(/founding cost/i)).toBeInTheDocument();
  });
});

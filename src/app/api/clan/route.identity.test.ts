/**
 * @jest-environment node
 */

/**
 * Clan identity/roster/invite action tests (Identity v1 sections
 * 8.1/8.2) - Supabase mocked. The RPC error->HTTP matrix
 * (update_clan_identity heraldry gate, set_clan_member_role owner rule,
 * respond_clan_invite accept/decline paths), the invite-by-handle flow
 * and the pre-024 503s.
 */

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;
var mockRpc: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

function request(body: Record<string, unknown>) {
  return new NextRequest('https://supasnake.com/api/clan', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

interface InviteFixture {
  callerRole?: 'owner' | 'officer' | 'member' | null;
  target?: { user_id: string | null; handle: string } | null;
  targetInClan?: boolean;
  inviteInsertError?: { code?: string; message: string } | null;
  inserts: Array<Record<string, unknown>>;
}

function configureInvite(fixture: InviteFixture) {
  let call = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table === 'clan_members') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              call += 1;
              // 1st read: the caller's membership; 2nd: the target's
              if (call === 1) {
                return {
                  data: fixture.callerRole
                    ? { clan_id: 'clan-1', role: fixture.callerRole }
                    : null,
                  error: null,
                };
              }
              return {
                data: fixture.targetInClan ? { clan_id: 'clan-2' } : null,
                error: null,
              };
            },
          }),
        }),
      };
    }
    if (table === 'players') {
      return {
        select: () => ({
          ilike: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: fixture.target ?? null, error: null }),
            }),
          }),
        }),
      };
    }
    if (table === 'clan_invites') {
      return {
        insert: async (values: Record<string, unknown>) => {
          fixture.inserts.push(values);
          return { error: fixture.inviteInsertError ?? null };
        },
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

beforeEach(() => {
  mockAuth = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom = jest.fn();
  mockRpc = jest.fn();
});

describe('POST update_identity (RPC matrix)', () => {
  it('passes nullable fields through to update_clan_identity', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, banner_id: 'venom_wake' },
      error: null,
    });
    const response = await POST(
      request({ action: 'update_identity', bannerId: 'venom_wake', colorPrimary: '#f97316' })
    );
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('update_clan_identity', {
      p_user_id: 'user-1',
      p_banner_id: 'venom_wake',
      p_emblem_id: null,
      p_color_primary: '#f97316',
      p_color_secondary: null,
    });
  });

  it('maps heraldry_locked -> 403, invalid_color -> 400, not_in_clan -> 404', async () => {
    for (const [code, status] of [
      ['heraldry_locked', 403],
      ['invalid_color', 400],
      ['not_in_clan', 404],
      ['not_authorized', 403],
    ] as const) {
      mockRpc.mockResolvedValue({ data: { error: code }, error: null });
      const response = await POST(request({ action: 'update_identity', bannerId: 'x' }));
      expect(response.status).toBe(status);
      expect((await response.json()).code).toBe(code);
    }
  });

  it('503s pre-024', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'function update_clan_identity not found' },
    });
    expect((await POST(request({ action: 'update_identity' }))).status).toBe(503);
  });
});

describe('POST set_role (owner-only matrix)', () => {
  it('refuses owner as a target role client-side', async () => {
    const response = await POST(
      request({ action: 'set_role', targetUserId: 'user-2', role: 'owner' })
    );
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('maps the SQL matrix: not_authorized 403, cannot_change_owner 400, target_not_in_clan 404', async () => {
    for (const [code, status] of [
      ['not_authorized', 403],
      ['cannot_change_owner', 400],
      ['target_not_in_clan', 404],
    ] as const) {
      mockRpc.mockResolvedValue({ data: { error: code }, error: null });
      const response = await POST(
        request({ action: 'set_role', targetUserId: 'user-2', role: 'officer' })
      );
      expect(response.status).toBe(status);
    }
  });

  it('promotes on success', async () => {
    mockRpc.mockResolvedValue({ data: { success: true, role: 'officer' }, error: null });
    const response = await POST(
      request({ action: 'set_role', targetUserId: 'user-2', role: 'officer' })
    );
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('set_clan_member_role', {
      p_user_id: 'user-1',
      p_target_user_id: 'user-2',
      p_role: 'officer',
    });
  });
});

describe('POST invite (officer creates by handle)', () => {
  it('officers invite a registered handler', async () => {
    const fixture: InviteFixture = {
      callerRole: 'officer',
      target: { user_id: 'user-9', handle: 'Souci' },
      inserts: [],
    };
    configureInvite(fixture);
    const response = await POST(request({ action: 'invite', handle: 'Souci' }));
    expect(response.status).toBe(200);
    expect(fixture.inserts[0]).toEqual({
      clan_id: 'clan-1',
      player_id: 'user-9',
      invited_by: 'user-1',
    });
  });

  it('members may not invite (403)', async () => {
    const fixture: InviteFixture = { callerRole: 'member', inserts: [] };
    configureInvite(fixture);
    expect((await POST(request({ action: 'invite', handle: 'Souci' }))).status).toBe(403);
    expect(fixture.inserts).toHaveLength(0);
  });

  it('404s unknown handles and guests (no auth account)', async () => {
    const noSuch: InviteFixture = { callerRole: 'owner', target: null, inserts: [] };
    configureInvite(noSuch);
    expect((await POST(request({ action: 'invite', handle: 'Nobody' }))).status).toBe(404);

    const guest: InviteFixture = {
      callerRole: 'owner',
      target: { user_id: null, handle: 'Ghost' },
      inserts: [],
    };
    configureInvite(guest);
    expect((await POST(request({ action: 'invite', handle: 'Ghost' }))).status).toBe(404);
  });

  it('409s targets already in a clan and duplicate invites', async () => {
    const inClan: InviteFixture = {
      callerRole: 'owner',
      target: { user_id: 'user-9', handle: 'Souci' },
      targetInClan: true,
      inserts: [],
    };
    configureInvite(inClan);
    expect((await POST(request({ action: 'invite', handle: 'Souci' }))).status).toBe(409);

    const duplicate: InviteFixture = {
      callerRole: 'owner',
      target: { user_id: 'user-9', handle: 'Souci' },
      inviteInsertError: { code: '23505', message: 'duplicate key' },
      inserts: [],
    };
    configureInvite(duplicate);
    const response = await POST(request({ action: 'invite', handle: 'Souci' }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('Already invited');
  });

  it('rejects malformed handles without touching the database', async () => {
    for (const bad of ['ab', 'a'.repeat(17), 'has space', 'söuci']) {
      const response = await POST(request({ action: 'invite', handle: bad }));
      expect(response.status).toBe(400);
    }
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('POST respond_invite (atomic accept in SQL)', () => {
  it('maps the accept path result codes', async () => {
    for (const [code, status] of [
      ['invite_not_found', 404],
      ['invite_not_pending', 409],
      ['invite_expired', 410],
      ['already_in_clan', 400],
      ['clan_full', 400],
    ] as const) {
      mockRpc.mockResolvedValue({ data: { error: code }, error: null });
      const response = await POST(
        request({ action: 'respond_invite', inviteId: 'inv-1', accept: true })
      );
      expect(response.status).toBe(status);
    }
  });

  it('accepts and declines through the RPC', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, accepted: true, clan_name: 'Elite' },
      error: null,
    });
    const accept = await POST(
      request({ action: 'respond_invite', inviteId: 'inv-1', accept: true })
    );
    expect(accept.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('respond_clan_invite', {
      p_user_id: 'user-1',
      p_invite_id: 'inv-1',
      p_accept: true,
    });

    mockRpc.mockResolvedValue({ data: { success: true, accepted: false }, error: null });
    const decline = await POST(
      request({ action: 'respond_invite', inviteId: 'inv-1', accept: false })
    );
    expect((await decline.json()).result.accepted).toBe(false);
  });

  it('validates inputs and 503s pre-024', async () => {
    expect((await POST(request({ action: 'respond_invite', accept: true }))).status).toBe(400);
    expect(
      (await POST(request({ action: 'respond_invite', inviteId: 'inv-1', accept: 'yes' }))).status
    ).toBe(400);

    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function respond_clan_invite does not exist' },
    });
    expect(
      (await POST(request({ action: 'respond_invite', inviteId: 'inv-1', accept: true }))).status
    ).toBe(503);
  });
});

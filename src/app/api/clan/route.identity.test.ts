/**
 * @jest-environment node
 */

/**
 * Clan identity, invite artifact and ownership — the RPC error->HTTP matrix
 * (WP-1.02; Constitution §9.2, Rules 5, 8, 11).
 *
 * WHAT THIS SUITE USED TO ASSERT, AND WHY IT NO LONGER CAN
 *
 * It was written for Identity v1 and pinned three things this rework removed
 * on purpose. Each is replaced here by the surface that took its place, not
 * dropped:
 *
 *   `update_clan_identity` -> `set_clan_heraldry`. The 024 RPC gated every
 *      heraldry edit behind the `heraldry_1` research node, which lives inside
 *      the Gauntlet — now behind a population gate that will not open for a
 *      long time (§9.3). Under 024 a clan's identity would have been
 *      permanently locked. Identity is not a reward for reaching a population
 *      threshold, so 048 replaces the RPC and this suite follows it.
 *
 *   `set_role` (owner-only promote/demote) -> GONE, with nothing in its place,
 *      because Rule 8 forbids the rank it granted. `ClanRole` is `owner |
 *      member`; migration 048 narrows the CHECK constraint and drops
 *      `set_clan_member_role`. The only thing that still moves between members
 *      is the WHOLE clan — `transfer_ownership`, pinned below — which is not a
 *      lever because it leaves no ladder to stand on. The structural proof that
 *      no such endpoint, column or affordance exists anywhere in `src/` is
 *      `noOfficerLever.test.ts`.
 *
 *   `invite` by handle (officer-only recruitment) -> `rotate_invite_code` and
 *      `join_by_code`. §9.2 makes invite links the only recruitment surface and
 *      every member can share one, so the officer's recruitment lever became an
 *      artifact with a URL (Rule 14). `join_by_code` is pinned in
 *      `route.test.ts`; the code's own lifecycle is pinned below.
 *
 * What is unchanged is `respond_invite`: no path in this route issues an invite
 * any more, but Rule 5 says a pending one is not destroyed by the change, so
 * answering it must keep working exactly as it did.
 */

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;
var mockRpc: jest.Mock;
var mockCaptureException: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
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

beforeEach(() => {
  mockAuth = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom = jest.fn();
  mockRpc = jest.fn();
  mockCaptureException = jest.fn();
});

describe('POST update_identity — heraldry, ungated (§9.2)', () => {
  it('passes nullable fields through to set_clan_heraldry', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, banner_id: 'venom_wake' },
      error: null,
    });
    const response = await POST(
      request({ action: 'update_identity', bannerId: 'venom_wake', colorPrimary: '#f97316' })
    );
    expect(response.status).toBe(200);
    // The five parameters are exact: an omitted field travels as an explicit
    // null, so a caller clearing a colour is distinguishable from one that
    // never mentioned it.
    expect(mockRpc).toHaveBeenCalledWith('set_clan_heraldry', {
      p_user_id: 'user-1',
      p_banner_id: 'venom_wake',
      p_emblem_id: null,
      p_color_primary: '#f97316',
      p_color_secondary: null,
    });
  });

  it('never calls the research-gated 024 RPC', async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });
    await POST(request({ action: 'update_identity', bannerId: 'venom_wake' }));
    expect(mockRpc).not.toHaveBeenCalledWith('update_clan_identity', expect.anything());
  });

  it('maps heraldry_locked -> 403, invalid_* -> 400, not_in_clan -> 404', async () => {
    for (const [code, status] of [
      ['heraldry_locked', 403],
      ['invalid_color', 400],
      ['invalid_banner', 400],
      ['invalid_emblem', 400],
      ['not_in_clan', 404],
      ['not_authorized', 403],
    ] as const) {
      mockRpc.mockResolvedValue({ data: { error: code }, error: null });
      const response = await POST(request({ action: 'update_identity', bannerId: 'x' }));
      expect(response.status).toBe(status);
      expect((await response.json()).code).toBe(code);
    }
  });

  it('503s before migration 048, and does not report a missing migration as a fault', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'function set_clan_heraldry not found' },
    });
    expect((await POST(request({ action: 'update_identity' }))).status).toBe(503);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('500s and reports a real RPC failure (Rule 11)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'deadlock detected' } });
    const response = await POST(request({ action: 'update_identity', bannerId: 'x' }));
    expect(response.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalled();
  });
});

describe('POST rotate_invite_code — the surface that replaced the officer invite', () => {
  it('returns the new code AND its shareable URL (Rule 14: if it matters it has a URL)', async () => {
    mockRpc.mockResolvedValue({ data: { invite_code: 'ABCDEFGH' }, error: null });
    const response = await POST(request({ action: 'rotate_invite_code' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('rotate_clan_invite_code', { p_user_id: 'user-1' });
    expect(body.invite).toEqual({ code: 'ABCDEFGH', url: '/clan/join/ABCDEFGH' });
  });

  it('carries no target and no recipient: rotation is not addressed at a person', async () => {
    mockRpc.mockResolvedValue({ data: { invite_code: 'ABCDEFGH' }, error: null });
    await POST(
      request({ action: 'rotate_invite_code', handle: 'Souci', targetUserId: 'user-9' })
    );
    const [, args] = mockRpc.mock.calls[0] as [string, Record<string, unknown>];
    // The old lever was "an officer picks who gets in". The replacement has no
    // parameter to name anyone with — the extra fields above are ignored.
    expect(Object.keys(args)).toEqual(['p_user_id']);
  });

  it('maps not_authorized -> 403 and not_in_clan -> 404', async () => {
    for (const [code, status] of [
      ['not_authorized', 403],
      ['not_in_clan', 404],
    ] as const) {
      mockRpc.mockResolvedValue({ data: { error: code }, error: null });
      const response = await POST(request({ action: 'rotate_invite_code' }));
      expect(response.status).toBe(status);
      expect((await response.json()).code).toBe(code);
    }
  });

  it('503s before migration 048', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function rotate_clan_invite_code does not exist' },
    });
    expect((await POST(request({ action: 'rotate_invite_code' }))).status).toBe(503);
  });
});

describe('POST transfer_ownership — the whole clan moves, or nothing does', () => {
  it('requires a target and reaches no RPC without one', async () => {
    const response = await POST(request({ action: 'transfer_ownership' }));
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('takes a target and nothing else — no rank, no reason, no metric', async () => {
    mockRpc.mockResolvedValue({ data: { clan_id: 'clan-1' }, error: null });
    await POST(request({ action: 'transfer_ownership', targetUserId: 'user-2', role: 'officer' }));

    const [name, args] = mockRpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('transfer_clan_ownership');
    // `role` above is ignored because there is no rank to send. Handing the
    // clan over is the only thing that can change a member's standing, and it
    // is all-or-nothing rather than a ladder to be climbed (Rule 8).
    expect(Object.keys(args).sort()).toEqual(['p_target_user_id', 'p_user_id']);
    expect(JSON.stringify(args)).not.toMatch(/role|officer|depth|contribution|rank/i);
  });

  it('maps not_authorized -> 403, target_not_in_clan -> 404, use_leave -> 400', async () => {
    for (const [code, status] of [
      ['not_authorized', 403],
      ['target_not_in_clan', 404],
      ['use_leave', 400],
    ] as const) {
      mockRpc.mockResolvedValue({ data: { error: code }, error: null });
      const response = await POST(
        request({ action: 'transfer_ownership', targetUserId: 'user-2' })
      );
      expect(response.status).toBe(status);
    }
  });

  it('503s before migration 048', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function transfer_clan_ownership does not exist' },
    });
    expect(
      (await POST(request({ action: 'transfer_ownership', targetUserId: 'user-2' }))).status
    ).toBe(503);
  });
});

describe('POST respond_invite — Rule 5: a pending invite outlives the rework', () => {
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

  it('lands against the 12 cap that is current, not the one it was issued under', async () => {
    mockRpc.mockResolvedValue({ data: { error: 'clan_full' }, error: null });
    const response = await POST(
      request({ action: 'respond_invite', inviteId: 'inv-1', accept: true })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('clan_full');
  });

  it('validates inputs and 503s pre-048', async () => {
    expect((await POST(request({ action: 'respond_invite', accept: true }))).status).toBe(400);
    expect(
      (await POST(request({ action: 'respond_invite', inviteId: 'inv-1', accept: 'yes' }))).status
    ).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();

    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function respond_clan_invite does not exist' },
    });
    expect(
      (await POST(request({ action: 'respond_invite', inviteId: 'inv-1', accept: true }))).status
    ).toBe(503);
  });
});

describe('the levers this suite used to test are unreachable, not merely unused', () => {
  /**
   * `route.test.ts` pins the plain 400 for each removed action and
   * `noOfficerLever.test.ts` pins the structural absence across the whole tree.
   * What is checked here is the specific claim THIS file once made: that the
   * removed actions cannot reach the database through any argument shape it
   * used to send them.
   */
  it.each([
    { action: 'set_role', targetUserId: 'user-2', role: 'officer' },
    { action: 'set_role', targetUserId: 'user-2', role: 'owner' },
    { action: 'set_role', targetUserId: 'user-2', role: 'member' },
    { action: 'invite', handle: 'Souci' },
    { action: 'invite', targetUserId: 'user-9' },
  ])('answers 400 and touches nothing for %o', async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Invalid action');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

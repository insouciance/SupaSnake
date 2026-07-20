/**
 * Tests for Premium Checkout API - exercises the real POST handler with
 * mocked Stripe and Supabase clients (same harness as /api/checkout).
 *
 * Pins the launch rules: anonymous accounts cannot subscribe, BOTH
 * consents (§10 FAGG service start + 18+ self-declaration) are mandatory,
 * one live subscription per player, the durable customer is created and
 * reused, and playerId rides subscription_data.metadata (webhook
 * resolution).
 */

import { NextRequest } from 'next/server';

const mockGetUser = jest.fn();
const mockPlayerSingle = jest.fn();
const mockLiveSubMaybeSingle = jest.fn();
const mockPlayersUpdate = jest.fn();
const mockCustomersCreate = jest.fn();
const mockSessionsCreate = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    customers: { create: (...args: unknown[]) => mockCustomersCreate(...args) },
    checkout: { sessions: { create: (...args: unknown[]) => mockSessionsCreate(...args) } },
  }))
);

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: jest.fn((table: string) => {
      if (table === 'players') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({ single: () => mockPlayerSingle() })),
          })),
          update: jest.fn((values: unknown) => ({
            eq: jest.fn(() => mockPlayersUpdate(values)),
          })),
        };
      }
      // premium_subscriptions live-sub lookup
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            in: jest.fn(() => ({ maybeSingle: () => mockLiveSubMaybeSingle() })),
          })),
        })),
      };
    }),
  })),
}));

let POST: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_STRIPE_PREMIUM_MONTHLY = 'price_premium_monthly';
  process.env.NEXT_PUBLIC_STRIPE_PREMIUM_YEARLY = 'price_premium_yearly';
  ({ POST } = await import('./route'));
});

function createSubscribeRequest(
  body: object,
  options: { auth?: string | null } = {}
): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.auth !== null) {
    headers['authorization'] = options.auth ?? 'Bearer valid-token';
  }
  return new NextRequest('http://localhost:3000/api/premium/checkout', {
    method: 'POST',
    // Both consents default on so each test doesn't repeat them
    // (override to test the gates).
    body: JSON.stringify({
      planId: 'premium_monthly',
      serviceStartConsent: true,
      adultConfirmation: true,
      ...body,
    }),
    headers,
  });
}

function registeredUser(overrides: object = {}) {
  return {
    data: {
      user: {
        id: 'user-uuid-1',
        email: 'player@example.com',
        is_anonymous: false,
        app_metadata: { provider: 'email' },
        ...overrides,
      },
    },
    error: null,
  };
}

describe('Premium Checkout POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    delete process.env.NEXT_PUBLIC_APP_URL;
    mockGetUser.mockResolvedValue(registeredUser());
    mockPlayerSingle.mockResolvedValue({
      data: { id: 'player-uuid-1', stripe_customer_id: null },
      error: null,
    });
    mockLiveSubMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockPlayersUpdate.mockResolvedValue({ error: null });
    mockCustomersCreate.mockResolvedValue({ id: 'cus_test_1' });
    mockSessionsCreate.mockResolvedValue({
      id: 'cs_sub_1',
      url: 'https://checkout.stripe.com/pay/cs_sub_1',
    });
  });

  describe('Configuration and authentication', () => {
    it('returns 503 when Stripe is not configured', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const response = await POST(createSubscribeRequest({}));
      expect(response.status).toBe(503);
    });

    it('returns 401 without an authorization header', async () => {
      const response = await POST(createSubscribeRequest({}, { auth: null }));
      expect(response.status).toBe(401);
    });

    it('rejects anonymous accounts with 403 account_required', async () => {
      mockGetUser.mockResolvedValue(registeredUser({ is_anonymous: true }));
      const response = await POST(createSubscribeRequest({}));
      const data = await response.json();
      expect(response.status).toBe(403);
      expect(data.error).toBe('account_required');
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });
  });

  describe('Plan and consent gates', () => {
    it('returns 400 for an unknown plan', async () => {
      const response = await POST(createSubscribeRequest({ planId: 'premium_lifetime' }));
      expect(response.status).toBe(400);
    });

    it('requires the §10 FAGG service-start consent', async () => {
      const response = await POST(
        createSubscribeRequest({ serviceStartConsent: false })
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toBe('service_start_consent_required');
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });

    it('requires the 18+ self-declaration', async () => {
      const response = await POST(createSubscribeRequest({ adultConfirmation: false }));
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toBe('adult_confirmation_required');
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });
  });

  describe('One live subscription per player', () => {
    it('returns 409 already_subscribed when a live subscription exists', async () => {
      mockLiveSubMaybeSingle.mockResolvedValue({
        data: { id: 'sub-row-1' },
        error: null,
      });
      const response = await POST(createSubscribeRequest({}));
      const data = await response.json();
      expect(response.status).toBe(409);
      expect(data.error).toBe('already_subscribed');
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });
  });

  describe('Durable customer + session construction', () => {
    it('creates and persists a Stripe customer for first-time subscribers', async () => {
      const response = await POST(createSubscribeRequest({}));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sessionId).toBe('cs_sub_1');
      expect(mockCustomersCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'player@example.com',
          metadata: { userId: 'user-uuid-1', playerId: 'player-uuid-1' },
        })
      );
      expect(mockPlayersUpdate).toHaveBeenCalledWith({
        stripe_customer_id: 'cus_test_1',
      });
    });

    it('reuses an existing customer without creating a new one', async () => {
      mockPlayerSingle.mockResolvedValue({
        data: { id: 'player-uuid-1', stripe_customer_id: 'cus_existing' },
        error: null,
      });

      await POST(createSubscribeRequest({}));

      expect(mockCustomersCreate).not.toHaveBeenCalled();
      expect(mockSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_existing' })
      );
    });

    it('creates a subscription-mode session with consents + subscription metadata', async () => {
      await POST(createSubscribeRequest({ planId: 'premium_yearly' }));

      expect(mockSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          line_items: [{ price: 'price_premium_yearly', quantity: 1 }],
          automatic_tax: { enabled: true },
          metadata: expect.objectContaining({
            userId: 'user-uuid-1',
            playerId: 'player-uuid-1',
            planId: 'premium_yearly',
            service_start_consent: 'immediate_service_requested',
            adult_confirmation: 'confirmed_18_plus',
          }),
          // customer.subscription.* events do not carry Checkout metadata:
          // the subscription needs its own copy for webhook resolution
          subscription_data: {
            metadata: {
              userId: 'user-uuid-1',
              playerId: 'player-uuid-1',
              planId: 'premium_yearly',
            },
          },
        })
      );
    });

    it('returns 500 when Stripe session creation fails', async () => {
      mockSessionsCreate.mockRejectedValue(new Error('stripe down'));
      const response = await POST(createSubscribeRequest({}));
      expect(response.status).toBe(500);
    });
  });
});

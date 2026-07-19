/**
 * Tests for Checkout API - exercises the real POST handler with mocked
 * Stripe and Supabase clients.
 *
 * The route module is imported dynamically after the Stripe price env vars
 * are set, because products.ts reads them at module evaluation time.
 */

import { NextRequest } from 'next/server';

const mockGetUser = jest.fn();
const mockPlayerSingle = jest.fn();
const mockSessionsCreate = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: (...args: unknown[]) => mockSessionsCreate(...args) } },
  }))
);

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: () => mockPlayerSingle(),
        })),
      })),
    })),
  })),
}));

let POST: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_STRIPE_ENERGY_SMALL = 'price_energy_small';
  process.env.NEXT_PUBLIC_STRIPE_ENERGY_MEDIUM = 'price_energy_medium';
  process.env.NEXT_PUBLIC_STRIPE_ENERGY_LARGE = 'price_energy_large';
  process.env.NEXT_PUBLIC_STRIPE_STARTER_BUNDLE = 'price_starter_bundle';
  process.env.NEXT_PUBLIC_STRIPE_DYNASTY_BUNDLE = 'price_dynasty_bundle';
  ({ POST } = await import('./route'));
});

function createCheckoutRequest(
  body: object,
  options: { auth?: string | null; origin?: string } = {}
): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.auth !== null) {
    headers['authorization'] = options.auth ?? 'Bearer valid-token';
  }
  if (options.origin) headers['origin'] = options.origin;
  return new NextRequest('http://localhost:3000/api/checkout', {
    method: 'POST',
    // §18 FAGG consent is mandatory for every real checkout; default it on
    // so each test doesn't have to repeat it (override to test the gate).
    body: JSON.stringify({ withdrawalConsent: true, ...body }),
    headers,
  });
}

function registeredUser(overrides: object = {}) {
  return {
    data: {
      user: {
        id: 'user-uuid-1',
        is_anonymous: false,
        app_metadata: { provider: 'email' },
        ...overrides,
      },
    },
    error: null,
  };
}

function playerCreatedDaysAgo(days: number) {
  const createdAt = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return {
    data: { id: 'player-uuid-1', created_at: createdAt.toISOString() },
    error: null,
  };
}

describe('Checkout POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    delete process.env.NEXT_PUBLIC_APP_URL;
    mockGetUser.mockResolvedValue(registeredUser());
    mockPlayerSingle.mockResolvedValue(playerCreatedDaysAgo(0));
    mockSessionsCreate.mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/pay/cs_test_1',
    });
  });

  describe('Configuration and authentication', () => {
    it('returns 503 when Stripe is not configured', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const response = await POST(createCheckoutRequest({ productId: 'energy_small' }));
      expect(response.status).toBe(503);
    });

    it('returns 401 without an authorization header', async () => {
      const response = await POST(
        createCheckoutRequest({ productId: 'energy_small' }, { auth: null })
      );
      expect(response.status).toBe(401);
    });

    it('returns 401 for an invalid token', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'invalid token' },
      });
      const response = await POST(createCheckoutRequest({ productId: 'energy_small' }));
      expect(response.status).toBe(401);
    });
  });

  describe('Anonymous user rejection', () => {
    it('rejects users with is_anonymous = true', async () => {
      mockGetUser.mockResolvedValue(registeredUser({ is_anonymous: true }));

      const response = await POST(createCheckoutRequest({ productId: 'energy_small' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('account_required');
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });

    it('rejects users whose provider is anonymous', async () => {
      mockGetUser.mockResolvedValue(
        registeredUser({ app_metadata: { provider: 'anonymous' } })
      );

      const response = await POST(createCheckoutRequest({ productId: 'energy_small' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('account_required');
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });
  });

  describe('Product validation', () => {
    it('returns 400 when productId is missing', async () => {
      const response = await POST(createCheckoutRequest({}));
      expect(response.status).toBe(400);
    });

    it('returns 400 for an unknown product', async () => {
      const response = await POST(createCheckoutRequest({ productId: 'not_a_product' }));
      expect(response.status).toBe(400);
    });

    it('returns 400 without §18 FAGG withdrawal consent', async () => {
      const response = await POST(
        createCheckoutRequest({ productId: 'energy_small', withdrawalConsent: false })
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toBe('withdrawal_consent_required');
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });

    it('returns 404 when the player row does not exist', async () => {
      mockPlayerSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });
      const response = await POST(createCheckoutRequest({ productId: 'energy_small' }));
      expect(response.status).toBe(404);
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });
  });

  describe('Bundle Day-2+ gating (BM-004, server-side)', () => {
    it('rejects a bundle purchase on Day 1', async () => {
      mockPlayerSingle.mockResolvedValue(playerCreatedDaysAgo(0.5));

      const response = await POST(createCheckoutRequest({ productId: 'starter_bundle' }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('bundle_not_available');
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });

    it('allows a bundle purchase from Day 2 on', async () => {
      mockPlayerSingle.mockResolvedValue(playerCreatedDaysAgo(2.1));

      const response = await POST(createCheckoutRequest({ productId: 'starter_bundle' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sessionId).toBe('cs_test_1');
      expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    });

    it('allows energy purchases on Day 1', async () => {
      mockPlayerSingle.mockResolvedValue(playerCreatedDaysAgo(0.1));

      const response = await POST(createCheckoutRequest({ productId: 'energy_small' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sessionId).toBe('cs_test_1');
      expect(data.url).toContain('checkout.stripe.com');
    });
  });

  describe('Session construction', () => {
    it('builds redirect URLs from NEXT_PUBLIC_APP_URL when set', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://supasnake.com';

      await POST(
        createCheckoutRequest(
          { productId: 'energy_small' },
          { origin: 'https://evil.example.com' }
        )
      );

      expect(mockSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url:
            'https://supasnake.com/shop?success=true&session_id={CHECKOUT_SESSION_ID}',
          cancel_url: 'https://supasnake.com/shop?canceled=true',
        })
      );
    });

    it('falls back to the request origin only when NEXT_PUBLIC_APP_URL is unset', async () => {
      await POST(
        createCheckoutRequest(
          { productId: 'energy_small' },
          { origin: 'http://localhost:3000' }
        )
      );

      expect(mockSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url:
            'http://localhost:3000/shop?success=true&session_id={CHECKOUT_SESSION_ID}',
        })
      );
    });

    it('embeds userId, playerId, productId and rewards in metadata', async () => {
      await POST(createCheckoutRequest({ productId: 'energy_small' }));

      expect(mockSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          line_items: [{ price: 'price_energy_small', quantity: 1 }],
          metadata: expect.objectContaining({
            userId: 'user-uuid-1',
            playerId: 'player-uuid-1',
            productId: 'energy_small',
            rewards: JSON.stringify({ energy: 3 }),
            withdrawal_consent: 'immediate_delivery_acknowledged',
          }),
        })
      );
    });

    it('returns 500 when Stripe session creation fails', async () => {
      mockSessionsCreate.mockRejectedValue(new Error('stripe down'));
      const response = await POST(createCheckoutRequest({ productId: 'energy_small' }));
      expect(response.status).toBe(500);
    });
  });
});

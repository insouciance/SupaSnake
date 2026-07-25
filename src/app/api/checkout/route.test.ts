/**
 * Checkout API — exercises the real POST handler with mocked Stripe and
 * Supabase clients.
 *
 * The one-time catalogue is empty (WP-0.09, Constitution §10.4). These tests
 * assert the rule that replaced the old fulfilment tests: **no productId
 * reaches Stripe** — least of all one of the five deleted SKUs. The
 * authentication, anonymous and §18 FAGG consent gates are still exercised,
 * because they must keep working for the archetypes that will fill the
 * catalogue (§10.2).
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

/** The SKUs WP-0.09 deleted. Every one must be unsellable forever. */
const RETIRED_SKU_IDS = [
  'energy_small',
  'energy_medium',
  'energy_large',
  'starter_bundle',
  'dynasty_bundle',
];

let POST: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  // Deliberately no NEXT_PUBLIC_STRIPE_* price ids are set: the catalogue no
  // longer reads any, and a test that supplied them would hide a regression
  // where a SKU came back reading one.
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

describe('Checkout POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    delete process.env.NEXT_PUBLIC_APP_URL;
    mockGetUser.mockResolvedValue(registeredUser());
    mockPlayerSingle.mockResolvedValue({
      data: { id: 'player-uuid-1' },
      error: null,
    });
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

  describe('A deleted SKU can never be sold again (§10.4)', () => {
    it.each(RETIRED_SKU_IDS)(
      'refuses %s with 400 product_not_available and creates no session',
      async (productId) => {
        const response = await POST(createCheckoutRequest({ productId }));
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('product_not_available');
        expect(mockSessionsCreate).not.toHaveBeenCalled();
      }
    );

    it('refuses an id that was never in the catalogue the same way', async () => {
      const response = await POST(createCheckoutRequest({ productId: 'not_a_product' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('product_not_available');
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });

    it('cannot be talked into a sale by a forged reward payload', async () => {
      // The body is not the catalogue. Rewards travel from the server-side
      // SKU or not at all — so extra fields change nothing.
      const response = await POST(
        createCheckoutRequest({
          productId: 'starter_bundle',
          rewards: { energy: 999, dna: 999999 },
          price: 0,
        })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('product_not_available');
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });

    it('never reaches Stripe for any productId at all', async () => {
      for (const productId of [...RETIRED_SKU_IDS, 'cosmetic_trail_x', 'season_1']) {
        await POST(createCheckoutRequest({ productId }));
      }
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });
  });

  describe('Request validation still gates ahead of the catalogue', () => {
    it('returns 400 when productId is missing', async () => {
      const response = await POST(createCheckoutRequest({}));
      expect(response.status).toBe(400);
      expect(mockSessionsCreate).not.toHaveBeenCalled();
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

    it('refuses the consent gate before it refuses the product', async () => {
      // Ordering matters for the archetypes that will fill the catalogue:
      // consent is a precondition of checkout, not of a particular SKU.
      const response = await POST(
        createCheckoutRequest({ productId: 'not_a_product', withdrawalConsent: false })
      );
      const data = await response.json();
      expect(data.error).toBe('withdrawal_consent_required');
    });
  });
});

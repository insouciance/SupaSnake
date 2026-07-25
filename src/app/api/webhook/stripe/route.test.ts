/**
 * Tests for Stripe Webhook API - exercises the real POST handler with
 * mocked Stripe signature verification and Supabase client.
 *
 * Two fulfilment shapes live here and they must never be confused:
 *   - mode=subscription (and customer.subscription.*) is the live path,
 *     synced through apply_subscription_update (migration 028);
 *   - mode=payment is recorded, escalated and REFUSED — WP-0.09 emptied the
 *     one-time catalogue and migration 042 drops grant_purchase_rewards, so
 *     no one-time payment can deliver anything (Constitution §10.4).
 */

import { NextRequest } from 'next/server';

const mockConstructEvent = jest.fn();
const mockRpc = jest.fn();
const mockUpsert = jest.fn();
const mockPlayerSingle = jest.fn();
const mockCaptureException = jest.fn();
const mockCaptureMessage = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: {
      retrieve: (...args: unknown[]) => mockSubscriptionsRetrieve(...args),
    },
  }))
);

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: jest.fn(() => ({
      upsert: (...args: unknown[]) => mockUpsert(...args),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: () => mockPlayerSingle(),
        })),
      })),
    })),
  })),
}));

import { POST } from './route';

function createWebhookRequest(
  body: string = '{}',
  signature: string | null = 't=1,v1=valid'
): NextRequest {
  const headers: Record<string, string> = {};
  if (signature !== null) headers['stripe-signature'] = signature;
  return new NextRequest('http://localhost:3000/api/webhook/stripe', {
    method: 'POST',
    body,
    headers,
  });
}

/**
 * A one-time (mode=payment) checkout. The default metadata is deliberately a
 * *retired* SKU carrying a reward payload: that is the shape a stale Checkout
 * Session or a forged metadata field would arrive in, and none of it may
 * deliver anything.
 */
function checkoutCompletedEvent(overrides: {
  eventId?: string;
  metadata?: Record<string, string> | null;
  amountTotal?: number;
} = {}) {
  return {
    id: overrides.eventId ?? 'evt_test_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_1',
        mode: 'payment',
        amount_total: overrides.amountTotal ?? 99,
        currency: 'usd',
        metadata:
          overrides.metadata === undefined
            ? {
                userId: 'user-uuid-1',
                playerId: 'player-uuid-1',
                productId: 'energy_small',
                rewards: JSON.stringify({ energy: 3 }),
              }
            : overrides.metadata,
      },
    },
  };
}

describe('Stripe Webhook POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
    mockRpc.mockResolvedValue({ data: 'processed', error: null });
    mockUpsert.mockResolvedValue({ error: null });
    mockPlayerSingle.mockResolvedValue({
      data: { id: 'player-uuid-1' },
      error: null,
    });
  });

  describe('Configuration and signature verification', () => {
    it('returns 503 when Stripe is not configured', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const response = await POST(createWebhookRequest());
      expect(response.status).toBe(503);
    });

    it('returns 400 when stripe-signature header is missing', async () => {
      const response = await POST(createWebhookRequest('{}', null));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('Missing signature');
    });

    it('returns 400 when signature verification fails', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('bad signature');
      });
      const response = await POST(createWebhookRequest());
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('Invalid signature');
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  /**
   * mode=payment: RECORDED AND REFUSED.
   *
   * WP-0.09 emptied the one-time catalogue (Constitution §10.4), and migration
   * 042 drops `grant_purchase_rewards` outright, so there is no fulfilment path
   * left for a one-time payment to take. These tests replace the old grant
   * tests: where they asserted "the RPC receives energy/dna/variants", they now
   * assert that **nothing is granted, ever, whatever the metadata claims** —
   * which is the property that actually protects the never-sold list. The
   * surviving valuable behaviour (idempotent event recording, the retryable
   * 500, the Sentry escalation) is kept and asserted here; the player-lookup
   * fallback and the 400-on-missing-payload now live only on the subscription
   * path and are covered in the premium lifecycle block below.
   */
  describe('checkout.session.completed (mode=payment): recorded and refused', () => {
    it('grants nothing — no RPC is called and the response says so', async () => {
      mockConstructEvent.mockReturnValue(checkoutCompletedEvent());

      const response = await POST(createWebhookRequest());
      const data = await response.json();

      // 200: retrying cannot make a deleted SKU deliverable, so Stripe must
      // stop rather than hammer an endpoint that will never fulfil.
      expect(response.status).toBe(200);
      expect(data.status).toBe('not_fulfillable');
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('records the event for audit and escalates it to Sentry', async () => {
      mockConstructEvent.mockReturnValue(checkoutCompletedEvent());

      await POST(createWebhookRequest());

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'evt_test_1',
          type: 'checkout.session.completed',
          payload_summary: expect.objectContaining({
            object_id: 'cs_test_1',
            product_id: 'energy_small',
            in_catalogue: false,
            amount: 99,
            currency: 'usd',
          }),
        }),
        expect.objectContaining({ onConflict: 'id', ignoreDuplicates: true })
      );
      // Money moved for something the game does not offer: a human must look.
      expect(mockCaptureMessage).toHaveBeenCalledWith(
        expect.stringContaining('nothing granted'),
        expect.objectContaining({ level: 'error' })
      );
    });

    it('is idempotent: the same event id twice records once and grants never', async () => {
      mockConstructEvent.mockReturnValue(checkoutCompletedEvent());

      const first = await POST(createWebhookRequest());
      const second = await POST(createWebhookRequest());

      expect(first.status).toBe(200);
      expect((await first.json()).status).toBe('not_fulfillable');
      expect(second.status).toBe(200);
      expect((await second.json()).status).toBe('not_fulfillable');
      // Both writes are the same insert-first claim on the event id, so the
      // second is a no-op at the database (010 idempotency pattern).
      expect(mockUpsert).toHaveBeenCalledTimes(2);
      for (const call of mockUpsert.mock.calls) {
        expect(call[0]).toEqual(expect.objectContaining({ id: 'evt_test_1' }));
        expect(call[1]).toEqual(
          expect.objectContaining({ onConflict: 'id', ignoreDuplicates: true })
        );
      }
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('never reads a reward payload out of session metadata', async () => {
      // The old bundle SKU shape: energy + DNA + a variant, all three on the
      // never-sold list. Metadata is attacker-influenced and stale-session
      // data; the handler must not so much as parse it into a grant.
      mockConstructEvent.mockReturnValue(
        checkoutCompletedEvent({
          metadata: {
            userId: 'user-uuid-1',
            playerId: 'player-uuid-1',
            productId: 'starter_bundle',
            rewards: JSON.stringify({
              energy: 20,
              dna: 1000,
              variants: ['CYBER VORTEX'],
            }),
          },
        })
      );

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect((await response.json()).status).toBe('not_fulfillable');
      expect(mockRpc).not.toHaveBeenCalled();
      // Nothing from the payload is even carried into the audit summary.
      const summary = mockUpsert.mock.calls[0][0].payload_summary;
      expect(summary).not.toHaveProperty('rewards');
      expect(summary.in_catalogue).toBe(false);
      expect(JSON.stringify(summary)).not.toMatch(/CYBER VORTEX/);
    });

    it('resolves no retired SKU: every deleted productId is out of catalogue', async () => {
      for (const productId of [
        'energy_small',
        'energy_medium',
        'energy_large',
        'starter_bundle',
        'dynasty_bundle',
      ]) {
        jest.clearAllMocks();
        mockUpsert.mockResolvedValue({ error: null });
        mockConstructEvent.mockReturnValue(
          checkoutCompletedEvent({
            metadata: { userId: 'user-uuid-1', playerId: 'player-uuid-1', productId },
          })
        );

        const response = await POST(createWebhookRequest());

        expect(response.status).toBe(200);
        expect(mockUpsert.mock.calls[0][0].payload_summary).toEqual(
          expect.objectContaining({ product_id: productId, in_catalogue: false })
        );
        expect(mockRpc).not.toHaveBeenCalled();
      }
    });

    it('refuses a session with no metadata at all, without erroring', async () => {
      mockConstructEvent.mockReturnValue(checkoutCompletedEvent({ metadata: {} }));

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect((await response.json()).status).toBe('not_fulfillable');
      expect(mockUpsert.mock.calls[0][0].payload_summary).toEqual(
        expect.objectContaining({ product_id: null, in_catalogue: false })
      );
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('returns 500 (retryable) and reports to Sentry when recording fails', async () => {
      // The event must not be lost: it is the only record that money moved
      // against an empty catalogue.
      mockConstructEvent.mockReturnValue(checkoutCompletedEvent());
      mockUpsert.mockResolvedValue({ error: { message: 'db down' } });

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(500);
      expect(mockCaptureException).toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('Refunds and disputes', () => {
    it('records charge.refunded and alerts Sentry for manual review', async () => {
      mockConstructEvent.mockReturnValue({
        id: 'evt_refund_1',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_1',
            payment_intent: 'pi_test_1',
            amount: 99,
            currency: 'usd',
          },
        },
      });

      const response = await POST(createWebhookRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('recorded');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'evt_refund_1',
          type: 'charge.refunded',
        }),
        expect.objectContaining({ onConflict: 'id', ignoreDuplicates: true })
      );
      expect(mockCaptureMessage).toHaveBeenCalledWith(
        expect.stringContaining('charge.refunded'),
        expect.objectContaining({ level: 'error' })
      );
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('records charge.dispute.created and alerts Sentry', async () => {
      mockConstructEvent.mockReturnValue({
        id: 'evt_dispute_1',
        type: 'charge.dispute.created',
        data: {
          object: {
            id: 'dp_test_1',
            payment_intent: 'pi_test_1',
            amount: 999,
            currency: 'usd',
          },
        },
      });

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'charge.dispute.created' }),
        expect.anything()
      );
      expect(mockCaptureMessage).toHaveBeenCalled();
    });

    it('returns 500 (retryable) when recording the event fails', async () => {
      mockConstructEvent.mockReturnValue({
        id: 'evt_refund_2',
        type: 'charge.refunded',
        data: { object: { id: 'ch_test_2', payment_intent: null } },
      });
      mockUpsert.mockResolvedValue({ error: { message: 'insert failed' } });

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(500);
      expect(mockCaptureException).toHaveBeenCalled();
    });
  });

  describe('Premium subscription lifecycle (migration 028)', () => {
    function subscription(overrides: Record<string, unknown> = {}) {
      return {
        id: 'sub_test_1',
        status: 'active',
        customer: 'cus_test_1',
        cancel_at_period_end: false,
        metadata: { userId: 'user-uuid-1', playerId: 'player-uuid-1' },
        items: {
          data: [
            {
              current_period_start: 1_780_000_000,
              current_period_end: 1_782_600_000,
              price: { recurring: { interval: 'month' } },
            },
          ],
        },
        ...overrides,
      };
    }

    function subscriptionEvent(
      type: string,
      overrides: Record<string, unknown> = {},
      eventOverrides: Record<string, unknown> = {}
    ) {
      return {
        id: 'evt_sub_1',
        type,
        created: 1_780_000_100,
        data: { object: subscription(overrides) },
        ...eventOverrides,
      };
    }

    it('syncs customer.subscription.updated through apply_subscription_update', async () => {
      mockConstructEvent.mockReturnValue(subscriptionEvent('customer.subscription.updated'));

      const response = await POST(createWebhookRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('processed');
      expect(mockRpc).toHaveBeenCalledWith('apply_subscription_update', {
        p_event_id: 'evt_sub_1',
        p_event_type: 'customer.subscription.updated',
        p_event_created: new Date(1_780_000_100 * 1000).toISOString(),
        p_player_id: 'player-uuid-1',
        p_customer_id: 'cus_test_1',
        p_subscription_id: 'sub_test_1',
        p_status: 'active',
        p_interval: 'month',
        p_period_start: new Date(1_780_000_000 * 1000).toISOString(),
        p_period_end: new Date(1_782_600_000 * 1000).toISOString(),
        p_cancel_at_period_end: false,
      });
    });

    it('maps yearly prices and cancel_at_period_end', async () => {
      mockConstructEvent.mockReturnValue(
        subscriptionEvent('customer.subscription.updated', {
          cancel_at_period_end: true,
          items: {
            data: [
              {
                current_period_start: 1_780_000_000,
                current_period_end: 1_811_536_000,
                price: { recurring: { interval: 'year' } },
              },
            ],
          },
        })
      );

      await POST(createWebhookRequest());

      expect(mockRpc).toHaveBeenCalledWith(
        'apply_subscription_update',
        expect.objectContaining({
          p_interval: 'year',
          p_cancel_at_period_end: true,
        })
      );
    });

    it('customer.subscription.deleted passes the canceled status through', async () => {
      mockConstructEvent.mockReturnValue(
        subscriptionEvent('customer.subscription.deleted', { status: 'canceled' })
      );

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledWith(
        'apply_subscription_update',
        expect.objectContaining({ p_status: 'canceled' })
      );
    });

    it('falls back to the customer mapping when subscription metadata is empty', async () => {
      mockConstructEvent.mockReturnValue(
        subscriptionEvent('customer.subscription.created', { metadata: {} })
      );

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockPlayerSingle).toHaveBeenCalled();
      expect(mockRpc).toHaveBeenCalledWith(
        'apply_subscription_update',
        expect.objectContaining({ p_player_id: 'player-uuid-1' })
      );
    });

    it('returns 500 (retryable) when the player cannot be resolved', async () => {
      mockConstructEvent.mockReturnValue(
        subscriptionEvent('customer.subscription.created', { metadata: {} })
      );
      mockPlayerSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(500);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('tolerates out-of-order delivery: stale_event is acknowledged with 200', async () => {
      mockConstructEvent.mockReturnValue(subscriptionEvent('customer.subscription.updated'));
      mockRpc.mockResolvedValue({ data: 'stale_event', error: null });

      const response = await POST(createWebhookRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('stale_event');
    });

    it('returns 500 (retryable) when apply_subscription_update fails', async () => {
      mockConstructEvent.mockReturnValue(subscriptionEvent('customer.subscription.updated'));
      mockRpc.mockResolvedValue({ data: null, error: { message: 'db down' } });

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(500);
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('checkout.session.completed in subscription mode NEVER hits the one-time grant path', async () => {
      mockConstructEvent.mockReturnValue({
        id: 'evt_sub_checkout_1',
        type: 'checkout.session.completed',
        created: 1_780_000_050,
        data: {
          object: {
            id: 'cs_sub_1',
            mode: 'subscription',
            subscription: 'sub_test_1',
            metadata: { userId: 'user-uuid-1', playerId: 'player-uuid-1' },
          },
        },
      });
      mockSubscriptionsRetrieve.mockResolvedValue(subscription());

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_test_1');
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith(
        'apply_subscription_update',
        expect.objectContaining({ p_subscription_id: 'sub_test_1' })
      );
    });

    it('returns 400 when a subscription checkout carries no subscription', async () => {
      // The one payload field the surviving fulfilment path cannot do
      // without. 400 (not 500): a retry cannot add a missing subscription.
      mockConstructEvent.mockReturnValue({
        id: 'evt_sub_checkout_bad',
        type: 'checkout.session.completed',
        created: 1_780_000_050,
        data: {
          object: {
            id: 'cs_sub_2',
            mode: 'subscription',
            subscription: null,
            metadata: { userId: 'user-uuid-1', playerId: 'player-uuid-1' },
          },
        },
      });

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(400);
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
      expect(mockCaptureMessage).toHaveBeenCalledWith(
        'Stripe subscription checkout missing subscription',
        expect.objectContaining({ level: 'error' })
      );
    });

    it('records invoice.payment_failed and warns Sentry (no state change)', async () => {
      mockConstructEvent.mockReturnValue({
        id: 'evt_inv_fail_1',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test_1',
            customer: 'cus_test_1',
            amount_due: 999,
            currency: 'eur',
          },
        },
      });

      const response = await POST(createWebhookRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('recorded');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'evt_inv_fail_1', type: 'invoice.payment_failed' }),
        expect.objectContaining({ onConflict: 'id', ignoreDuplicates: true })
      );
      expect(mockCaptureMessage).toHaveBeenCalledWith(
        'Stripe invoice.payment_failed',
        expect.objectContaining({ level: 'warning' })
      );
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('acknowledges invoice.paid without touching state', async () => {
      mockConstructEvent.mockReturnValue({
        id: 'evt_inv_paid_1',
        type: 'invoice.paid',
        data: { object: { id: 'in_test_2' } },
      });

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe('Other events', () => {
    it('acknowledges unknown event types with 200', async () => {
      mockConstructEvent.mockReturnValue({
        id: 'evt_other_1',
        type: 'payment_intent.created',
        data: { object: { id: 'pi_test_1' } },
      });

      const response = await POST(createWebhookRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });
});

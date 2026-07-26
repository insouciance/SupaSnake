/**
 * The settlement-dispatch rollout switch (WP-1.09; Constitution §11.6, §7.6).
 *
 * DEFAULTED OFF, like every player-visible surface under the handoff's merge
 * protocol. `NEXT_PUBLIC_SETTLEMENT_DISPATCH_V1` must be the exact string
 * `true` to arm it; anything else, including the variable being absent, is off.
 *
 * WHAT "OFF" MEANS, PRECISELY
 *
 *   - The one-tap publish card does not render on `/serpent`. The week still
 *     reads; only the publish affordance is absent.
 *   - `GET /api/ops/settlement-dispatch` answers 200 with `skipped:
 *     'flag-off'`, composes nothing and sends NOTHING. A cron pointed at a
 *     flag-off deployment is silent, not broken.
 *   - `sendSettlementEmail` refuses. That refusal is the outermost gate, so a
 *     future caller that forgets to check the flag still cannot mail anybody.
 *
 * The project rule is that a rollback path is TESTED, never inferred from an
 * omitted flag: `settlementEmail.test.ts` and `SettlementPostCard.test.tsx`
 * exercise the off path explicitly.
 *
 * One build-time constant for client and server, so a deployment can never
 * split the surface between the two halves.
 */
export const SETTLEMENT_DISPATCH_V1 =
  process.env.NEXT_PUBLIC_SETTLEMENT_DISPATCH_V1 === 'true';

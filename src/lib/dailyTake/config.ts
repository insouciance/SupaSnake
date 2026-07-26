/**
 * The Daily Take rollout switch (Constitution §7.2, Phase 1 gate).
 *
 * DEFAULTED OFF. The Take is a player-visible surface and a DNA faucet, and
 * the handoff's merge protocol keeps every one of those behind a
 * `NEXT_PUBLIC_*` flag until the Phase 1 gate passes — so
 * `NEXT_PUBLIC_DAILY_TAKE_V1` must be set to the exact string `true` to arm
 * it. Anything else, including the variable being absent, is off.
 *
 * The project rule is that a rollback path is TESTED, never inferred from an
 * omitted flag: `dailyTake.flagOff.test.ts` exercises the off path explicitly,
 * on both the settlement side and the collect endpoint.
 *
 * WHAT "OFF" MEANS, PRECISELY
 *
 *   - `POST /api/game/session { action: 'end' }` sends NO `dailyTake` block.
 *     `parseDailyTake` in `src/lib/game/dailyTake.ts` returns null for a
 *     missing block, so the Results slot does not render — which is exactly
 *     the state WP-1.06 shipped and tested against.
 *   - `POST /api/daily-take/collect` answers 200 with `live: false` and
 *     `collected: false`. It does NOT 404: the client helper maps 404/405/501
 *     to `unavailable`, and a flag flip must be distinguishable in logs from a
 *     route that was never deployed. Nothing is granted and nothing is
 *     written — the RPC is not called at all.
 *   - No chain advances while the flag is off, so no player silently
 *     accumulates or silently loses Take streak days behind a dark surface.
 *     A player's first collect after the flag flips starts them at day one,
 *     which is where a player who has never collected belongs.
 *   - Turning the flag back OFF strands nothing. Everything a collect wrote is
 *     a permanent DNA balance and a `player_streaks` row (Rule 6); the flag
 *     governs whether the Take can be collected, never whether what was
 *     already collected survives.
 *
 * Client and server import the same build-time constant, so a deployment can
 * never split the Take's existence between the two halves.
 */
export const DAILY_TAKE_V1_ENABLED = process.env.NEXT_PUBLIC_DAILY_TAKE_V1 === 'true';

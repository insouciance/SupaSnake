/**
 * The World Signal rollout switch (Constitution §7.2, Phase 1 gate).
 *
 * DEFAULTED OFF. The Signal is a player-visible surface and the handoff's
 * merge protocol keeps every one of those behind a `NEXT_PUBLIC_*` flag until
 * the Phase 1 gate passes — so `NEXT_PUBLIC_SIGNAL_V1` must be set to the
 * exact string `true` to arm it. Anything else, including the variable being
 * absent, is off.
 *
 * The project rule is that a rollback path is TESTED, never inferred from an
 * omitted flag: `signal.flagOff.test.ts` exercises the off path explicitly.
 *
 * WHAT "OFF" MEANS, PRECISELY
 *
 *   - `POST /api/game/session` with `mode: 'signal'` resolves NO day, opens NO
 *     objective run, stamps NO `signal_objective_run_id`, and therefore grants
 *     NO charge exemption. The run is an ordinary charged run. This is the
 *     closed-by-default posture WP-0.01 built: an exemption needs a
 *     server-resolved id, and with the flag off the server refuses to resolve
 *     one.
 *   - `GET /api/signal` answers 200 with `live: false` and an empty day, so
 *     WP-1.07/1.08 can build and render an off state rather than handling a
 *     404.
 *   - The settlement cron still runs and still settles. A Signal completed
 *     while the flag was on is an earned thing (Rule 6), and a flag flip must
 *     never strand it. With the flag off from the start there are no attempts,
 *     so the cron settles nothing and writes nothing.
 *   - The contracts cutover is NOT behind this flag. Contracts are retired by
 *     §7.2 and §13 outright; the flag governs whether the Signal is visible,
 *     never whether the thing it replaces comes back.
 *
 * Client and server import the same build-time constant, so a deployment can
 * never split the Signal's existence between the two halves.
 */
export const SIGNAL_V1_ENABLED = process.env.NEXT_PUBLIC_SIGNAL_V1 === 'true';

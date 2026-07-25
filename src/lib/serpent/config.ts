/**
 * The World Serpent rollout switch (Constitution §7.3, Phase 1 gate).
 *
 * DEFAULTED OFF. The Serpent is a player-visible surface and the handoff's
 * merge protocol keeps every one of those behind a `NEXT_PUBLIC_*` flag until
 * the Phase 1 gate passes — so `NEXT_PUBLIC_SERPENT_V1` must be set to the
 * exact string `true` to arm it. Anything else, including the variable being
 * absent, is off.
 *
 * The project rule is that a rollback path is TESTED, never inferred from an
 * omitted flag: `serpent.flagOff.test.ts` exercises the off path explicitly.
 *
 * WHAT "OFF" MEANS, PRECISELY
 *
 *   - `POST /api/game/session` with `mode: 'serpent'` resolves NO week, stamps
 *     NO `serpent_week_id`, and therefore grants NO charge exemption. The run
 *     is an ordinary charged run. This is the same closed-by-default posture
 *     WP-0.01 built: an exemption needs a server-resolved id, and with the
 *     flag off the server refuses to resolve one.
 *   - `GET /api/serpent/panel` answers 200 with `live: false` and zeroed
 *     standings, so WP-1.07 can build and render an off state rather than
 *     having to handle a 404.
 *   - The settlement cron still runs and still settles. Depth already earned
 *     is earned (Rule 6), and a flag flip must never strand a week that was
 *     hunted while the flag was on. With the flag off from the start there are
 *     no flagged runs, so the cron settles nothing and writes nothing.
 *
 * Client and server import the same build-time constant, so a deployment can
 * never split the Serpent's existence between the two halves.
 */
export const SERPENT_V1_ENABLED = process.env.NEXT_PUBLIC_SERPENT_V1 === 'true';

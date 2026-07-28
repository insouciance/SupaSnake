/**
 * D2 ladder rollout switch (WP-3.12).
 *
 * Gates ONE thing: whether Run Setup offers the rung selector, and whether the
 * session route will honour a rung a client asks for. Defaulted OFF — omitting
 * the variable must never be read as "on".
 *
 * WHAT IT DELIBERATELY DOES NOT GATE, AND WHY THAT MATTERS
 *
 * It does not gate the ladder's math. `NEXT_PUBLIC_*` values are inlined at
 * build time, so a flag on run rules means a client built under one rung's
 * parameters and a server recomputing under another — they would disagree on
 * every length an infuse produced, on where the doors stood, and on what a
 * crash salvaged. A disagreement of that kind silently invalidates runs a
 * player honestly earned, which is the defect WP-2.05 existed to eliminate and
 * the one `growthLab.ts` records for the same reason.
 *
 * So the rung is resolved SERVER-SIDE at run start, stamped into `run_context`,
 * and replayed from that stamp at settlement. With this flag off the server
 * simply never stamps one, every run is rung 0, and rung 0 folds
 * byte-identically to the shipped game on both sides.
 *
 * The consequence worth stating: an old client, a tampered client, and a client
 * built with the flag off are all physically incapable of choosing which rung a
 * run settles under. They play the rung the server stamped, or they play Ground.
 *
 * It also does not gate the always-visible rung READOUT on Run Setup. A readout
 * that disappears with its flag cannot tell you the flag is off, which is
 * exactly the hour WP-3.02 lost when three growth profiles played identically
 * and nothing on screen said why.
 *
 * SECOND GATE, INDEPENDENT OF THIS ONE: `player_ladders` (migration 057). Until
 * that table exists the server cannot know which rungs a player has unlocked,
 * so it offers none and stamps none — the ladder stays dark even with this flag
 * on. Two conditions, deliberately: the flag is a rollout decision and the table
 * is a deploy-order fact, and they must be able to be wrong independently.
 */
export const LADDER_ENABLED = process.env.NEXT_PUBLIC_LADDER_V1 === 'true';

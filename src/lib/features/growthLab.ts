/**
 * Growth Lab rollout switch (WP-3.02).
 *
 * Gates ONE thing: whether the Run Setup page offers the growth-profile
 * selector. Defaulted OFF — omitting the variable must never be read as "on".
 *
 * WHAT IT DELIBERATELY DOES NOT GATE, AND WHY THAT MATTERS
 *
 * It does not gate the growth math. `NEXT_PUBLIC_*` values are inlined at
 * build time, so a flag on length math means a client built with one curve and
 * a server recomputing with another — they disagree on every food, and a
 * length disagreement silently invalidates runs a player honestly earned. That
 * is the exact defect WP-2.05 existed to eliminate, and WP-2.10a recorded the
 * same hazard for payout math.
 *
 * So the profile is resolved SERVER-SIDE at run start, stamped into
 * `run_context`, and replayed from that stamp at settlement. With this flag
 * off the server simply never stamps one, every run is `baseline`, and
 * `baseline` folds byte-identically to the shipped game.
 *
 * The consequence worth stating: an old client, a tampered client, and a
 * client built with the flag off are all physically incapable of changing how
 * a run settles. They play what the server told them to play, or they play
 * baseline.
 *
 * DELIBERATELY NOT `GROWTH_SURFACES_V1` (`src/lib/features/growth.ts`), which
 * gates the marketing surfaces and is already on in production. Two unrelated
 * things that must roll back independently need two switches.
 */
export const GROWTH_LAB_ENABLED = process.env.NEXT_PUBLIC_GROWTH_LAB_V1 === 'true';

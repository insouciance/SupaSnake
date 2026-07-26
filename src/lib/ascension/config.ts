/**
 * The Ascension rollout switch (Constitution §6.1, Phase 2 gate).
 *
 * DEFAULTED OFF. `NEXT_PUBLIC_ASCENSION_V1` must be the exact string `true` to
 * arm it. Anything else, including the variable being absent, is off, and the
 * project rule is that a rollback path is TESTED rather than inferred from an
 * omitted flag: `AscensionMonth.flagOff.test.tsx` exercises the off path
 * directly.
 *
 * WHAT "OFF" MEANS, PRECISELY
 *
 *   - `<AscensionMonth />` returns null before it reads anything. No fetch, no
 *     markup, no measurable trace on the leaderboard.
 *   - `GET /api/signal/ascension` answers 200 with `live: false` and a zeroed
 *     reading rather than a 404, so the surface renders an off state instead
 *     of having to special-case an error. (It renders nothing at all, but the
 *     contract is the same shape either way, which is what keeps the two
 *     halves from drifting.)
 *   - NOTHING ELSE CHANGES. This is the property that proves Ascension stayed
 *     a view and did not become a surface (§12.2): with the flag off, the
 *     Signal opens, is taken, is played, settles and pays exactly as it did
 *     before this work package existed. There is no settlement to strand, no
 *     cycle to close, no grant to replay and no row this flag can orphan —
 *     because Ascension writes nothing, ever. §6.1's "ignoring it costs
 *     nothing" is enforced by there being nothing to ignore.
 *
 * Client and server read the same build-time constant, so a deployment cannot
 * split Ascension's existence between the two halves.
 */
export const ASCENSION_V1_ENABLED = process.env.NEXT_PUBLIC_ASCENSION_V1 === 'true';

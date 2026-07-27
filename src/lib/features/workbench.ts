/**
 * Workbench v1 rollout switch (WP-2.08).
 *
 * Gates the Workbench's two player-visible surfaces: the `?view=workbench`
 * tab on the Codex, and the `/b/<code>` build landing page. Defaulted OFF —
 * omitting the variable must never be read as "on", and the flag-off path is
 * tested deliberately rather than inferred from an absent variable.
 *
 * DELIBERATELY NOT `SHARE_ARTIFACTS_V1_ENABLED`. Reusing the Phase-1 share
 * flag would look tidier and would be wrong: that flag will already be ON by
 * the time this lands, so the build share would ship the instant the
 * Workbench merged, with no separate rollout and no separate rollback. Two
 * surfaces that must be able to fail independently need two switches.
 *
 * Deliberately NOT gated: `/b/<code>/opengraph-image`. A crawler unfurling a
 * link during a rollback must still get a real card rather than a grey box —
 * the same split `/x/` already ships and `share-artifacts.spec.ts` asserts.
 */
export const WORKBENCH_V1_ENABLED = process.env.NEXT_PUBLIC_WORKBENCH_V1 === 'true';

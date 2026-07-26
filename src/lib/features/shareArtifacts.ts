/**
 * Share artifacts v1 rollout switch (WP-1.08).
 *
 * Gates every NEW player-visible artifact surface: the `/s`, `/r`, `/w`,
 * `/c` and `/x` landing pages, and the share buttons that produce their
 * links. Defaulted OFF — omitting the variable must never be read as "on",
 * and the flag-off path is tested deliberately rather than inferred.
 *
 * Deliberately NOT gated: the F-12 engine determinism fix (a correctness
 * repair, not a surface) and the OG image added to the already-public
 * `/p/[handle]` profile, which is hygiene on a page that shipped long ago.
 */
export const SHARE_ARTIFACTS_V1_ENABLED =
  process.env.NEXT_PUBLIC_SHARE_ARTIFACTS_V1 === 'true';

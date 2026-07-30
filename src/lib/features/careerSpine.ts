/**
 * Career Spine presentation rollout.
 *
 * Settlement, receipts and earned progression are deliberately NOT gated:
 * turning a surface off must never stop or discard server-owned progress.
 * This flag controls only the new Career Pulse, snake passport presentation,
 * post-run recognition review, and attention fetch/seen transitions.
 */
export const CAREER_SPINE_V1_ENABLED =
  process.env.NEXT_PUBLIC_CAREER_SPINE_V1 === 'true';

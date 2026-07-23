/**
 * FTUE v2 rollout switch.
 *
 * Opt-in is deliberate: migration 037 must exist before the application can
 * call bootstrap_player. Client and server import the same build-time value so
 * a deployment cannot split launch behavior between the two halves.
 */
export const FTUE_V2_ENABLED = process.env.NEXT_PUBLIC_FTUE_V2 === 'true';

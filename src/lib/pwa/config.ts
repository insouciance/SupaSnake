/**
 * The PWA rollout switch (WP-2.04; Constitution §11.4, Rule 1, Rule 7).
 *
 * DEFAULTED OFF, like every player-visible surface under the handoff's merge
 * protocol. `NEXT_PUBLIC_PWA_V1` must be the exact string `true` to arm it;
 * anything else, including the variable being absent, is off.
 *
 * WHAT "OFF" MEANS, PRECISELY — all six of these, tested explicitly:
 *
 *   1. `<link rel="manifest">` is absent from the document head. The root
 *      layout omits `metadata.manifest` entirely rather than pointing it at a
 *      dead URL, so a browser never fetches a manifest it cannot have.
 *   2. `GET /manifest.webmanifest` answers 404. There is no manifest to find
 *      even by hand.
 *   3. `GET /sw.js` answers 404, so a service worker cannot be registered
 *      even by a client that hard-codes the path.
 *   4. The install prompt never mounts and never listens for
 *      `beforeinstallprompt`.
 *   5. `Notification.requestPermission()` is never reached. The opt-in panel
 *      does not render, and the eligibility function that guards it returns
 *      false before it inspects anything else.
 *   6. `POST /api/push/subscription` refuses, and `dispatchPushForTrigger`
 *      refuses. Those two refusals are the outermost gates, so a future caller
 *      that forgets the flag still cannot store a subscription or send.
 *
 * The project rule is that a rollback path is TESTED, never inferred from an
 * omitted flag: every file in `src/lib/pwa` and `src/lib/push` exercises its
 * own off path.
 *
 * One build-time constant for client and server, so a deployment can never
 * split the surface between the two halves.
 */
export const PWA_V1_ENABLED = process.env.NEXT_PUBLIC_PWA_V1 === 'true';

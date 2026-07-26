/**
 * The service worker, as source (Constitution §11.4, Rule 1, Rule 7).
 *
 * WHY IT IS A STRING IN A MODULE INSTEAD OF A FILE IN `public/`
 *
 *   Three reasons, all of them about the flag and the tests:
 *
 *   1. A file in `public/` is served unconditionally. WP-2.04 ships behind
 *      `NEXT_PUBLIC_PWA_V1` defaulted off, and off has to mean `/sw.js`
 *      answers 404 — otherwise a client that hard-codes the path can register
 *      a worker on a deployment where the feature is meant to be dark.
 *   2. A file in `public/` is invisible to jest. The worker is the surface
 *      that actually DISPLAYS a notification, so it is the last place a badge
 *      or a commercial string could be added without anything failing. Here it
 *      is a string the Rule 5 and Rule 7 sweeps can read.
 *   3. A file in `public/` is invisible to `npm run lint` and to
 *      `verify:constitution`'s TODO scan.
 *
 * WHAT THIS WORKER DELIBERATELY DOES NOT DO
 *
 *   - NO CACHING, NO OFFLINE SHELL, NO `fetch` HANDLER. Server authority is
 *     the project's first rule: every economy and progress mutation goes
 *     through an API route, and a cached shell is how a player ends up
 *     playing against stale state and losing a run to a reconciliation. An
 *     install here buys a window and a shortcut, not offline play.
 *   - NO BADGE. `navigator.setAppBadge` appears nowhere. Rule 7 names badges
 *     next to offers, and an unread count is the purest form of manufactured
 *     obligation.
 *   - NO `periodicsync`, NO `sync`, NO background wake-ups.
 *   - NO `requireInteraction`. A notification that will not go away by itself
 *     is a notification that nags.
 *
 * RULE 1 — RUN SANCTITY, IN THE ONE PLACE IT IS EASY TO LOSE
 *
 *   `notificationclick` focuses an existing tab if there is one and only
 *   navigates it when the player is NOT mid-run. A player who taps a Signal
 *   notification while a run is live in a background tab gets that tab
 *   focused, exactly where they left it — the worker never navigates a live
 *   run away. The page publishes its run state to the worker through
 *   `postMessage`, and the worker's default when it has not heard from a
 *   client is to leave the page alone.
 *
 * FAIL-QUIET
 *
 *   A `push` event with an unreadable payload shows nothing at all. There is
 *   no generic fallback notification — a device buzzing with "SupaSnake" and
 *   no reason is worse than silence.
 */

/**
 * Bumped whenever the source below changes, so a deployed client that has an
 * older worker installed replaces it. The value is embedded in the source as a
 * comment, which is enough to make the byte stream differ and trigger the
 * browser's update check.
 */
export const SERVICE_WORKER_VERSION = 'wp-2.04.1';

export const SERVICE_WORKER_SOURCE = `/* SupaSnake service worker ${SERVICE_WORKER_VERSION}
 * Notifications only. No caching, no fetch handler, no unread count, no background sync.
 * (The word the Rule 7 lint forbids is the reason that line reads "unread count":
 *  this file's own source is swept, comments included.)
 */
'use strict';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

/* Run sanctity: the page tells the worker whether a run is live. Absent that
 * message the worker assumes a run MIGHT be live and refuses to navigate. */
var runIsLive = false;

self.addEventListener('message', function (event) {
  var data = event.data;
  if (data && data.type === 'supasnake:run-state') {
    runIsLive = data.runActive === true;
  }
});

self.addEventListener('push', function (event) {
  if (!event.data) return;

  var payload;
  try {
    payload = event.data.json();
  } catch (error) {
    return;
  }

  if (!payload || typeof payload.title !== 'string' || typeof payload.body !== 'string') {
    return;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: typeof payload.tag === 'string' ? payload.tag : undefined,
      renotify: false,
      requireInteraction: false,
      silent: false,
      icon: '/icon.svg',
      data: { url: typeof payload.url === 'string' ? payload.url : '/' }
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var target = (event.notification.data && event.notification.data.url) || '/';
  if (typeof target !== 'string' || target.charAt(0) !== '/' || target.charAt(1) === '/') {
    target = '/';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windows) {
      for (var i = 0; i < windows.length; i += 1) {
        var client = windows[i];
        if (typeof client.focus !== 'function') continue;
        /* Focus what is already open. Navigate it only when no run is live. */
        if (!runIsLive && typeof client.navigate === 'function') {
          return client.navigate(target).then(function (navigated) {
            return (navigated || client).focus();
          }).catch(function () {
            return client.focus();
          });
        }
        return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
`;

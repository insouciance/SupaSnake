/**
 * GET /sw.js — the service worker script (Constitution §11.4).
 *
 * Served from a route handler rather than `public/` so that the flag can turn
 * it off: with `NEXT_PUBLIC_PWA_V1` unset this answers 404, and a worker
 * cannot be registered even by a client that hard-codes the path. The
 * reasoning is in `src/lib/pwa/serviceWorkerSource.ts`.
 *
 * `Service-Worker-Allowed: /` lets the worker claim the whole origin even
 * though it is delivered by a route; `Cache-Control: no-cache` is the
 * conventional posture for a worker script, so a flag flip or a version bump
 * reaches devices on the next visit instead of on the next day.
 */

import { NextResponse } from 'next/server';
import { PWA_V1_ENABLED } from '@/lib/pwa/config';
import { SERVICE_WORKER_SOURCE } from '@/lib/pwa/serviceWorkerSource';

export async function GET() {
  if (!PWA_V1_ENABLED) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(SERVICE_WORKER_SOURCE, {
    status: 200,
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-cache, max-age=0, must-revalidate',
    },
  });
}

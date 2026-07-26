/**
 * GET /manifest.webmanifest — the web app manifest (Constitution §11.4).
 *
 * WHY A ROUTE HANDLER AND NOT `app/manifest.ts`
 *
 *   Next's `app/manifest.ts` file convention is unconditional: its presence
 *   injects `<link rel="manifest">` into every document, whatever a feature
 *   flag says. WP-2.04 ships behind `NEXT_PUBLIC_PWA_V1` defaulted OFF, and
 *   "off" has to mean the browser never sees a manifest at all — not a
 *   manifest served to a page that no longer links it. A route handler can
 *   answer 404 when the flag is off; a file convention cannot.
 *
 *   The document-head half of the switch lives in `src/app/layout.tsx`, which
 *   sets `metadata.manifest` only when the flag is on. Both halves read the
 *   same build-time constant, so they cannot disagree.
 *
 * Cached for an hour with `stale-while-revalidate`: the manifest is a pure
 * function of the site config and changes about once a year, but a flag flip
 * must not take a day to reach a CDN edge.
 */

import { NextResponse } from 'next/server';
import { PWA_V1_ENABLED } from '@/lib/pwa/config';
import { buildWebManifest } from '@/lib/pwa/manifest';

export async function GET() {
  if (!PWA_V1_ENABLED) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json(buildWebManifest(), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}

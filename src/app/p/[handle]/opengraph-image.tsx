/**
 * The Open Graph image for the public profile `/p/<handle>` (Rule 14).
 *
 * The profile page shipped in Identity v1 without one, so a shared
 * Chronicle arrived in a feed as a bare grey box. This is the same read the
 * page already does, narrowed to the four public numbers a card can hold.
 *
 * NOT gated by NEXT_PUBLIC_SHARE_ARTIFACTS_V1: `/p/<handle>` is an existing
 * public page, and adding the image it always should have had is hygiene,
 * not a new player-visible surface.
 *
 * Rule 11: the Supabase error is checked and reported; a failed read falls
 * back to the generic card rather than rendering zeroes, because a zero
 * beside somebody's handle reads as a loss (Rules 5 and 6).
 */

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@supabase/supabase-js';
import {
  artifactImageResponse,
  ARTIFACT_IMAGE_CONTENT_TYPE,
  ARTIFACT_IMAGE_SIZE,
} from '@/lib/og/artifactCard';
import { profileCardModel } from '@/lib/share/artifactCards';
import { HANDLE_REGEX } from '@/lib/identity/handle';
import { isMissingIdentityInfra } from '@/lib/server/identity';
import { SITE_TAGLINE } from '@/shared/config/site';

export const alt = 'SupaSnake — a player’s Chronicle';
export const size = ARTIFACT_IMAGE_SIZE;
export const contentType = ARTIFACT_IMAGE_CONTENT_TYPE;

function positive(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null;
}

export default async function ProfileOpengraphImage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  if (HANDLE_REGEX.test(handle)) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
    // `_` is an ilike wildcard and must be escaped; the handle format allows
    // no other metacharacter.
    const { data, error } = await supabase
      .from('players')
      .select('handle, high_score, total_games_played, lifetime_depth')
      .ilike('handle', handle.replace(/_/g, '\\_'))
      .maybeSingle();

    if (error && !isMissingIdentityInfra(error)) {
      console.error('Profile OG image lookup failed:', { handle, error });
      Sentry.captureException(
        new Error(`Profile OG image lookup failed: ${error.message}`),
        { extra: { handle, code: error.code } }
      );
    }

    if (!error && data) {
      return artifactImageResponse(
        profileCardModel({
          handle: String(data.handle ?? handle),
          bestScore: positive(data.high_score),
          totalRuns: positive(data.total_games_played),
          lifetimeDepth: positive(data.lifetime_depth),
        })
      );
    }
  }

  return artifactImageResponse({
    kicker: 'Chronicle',
    title: 'Where skill creates legacy',
    subtitle: SITE_TAGLINE,
    provenance: 'verified',
    callToAction: 'Start your own chronicle',
  });
}

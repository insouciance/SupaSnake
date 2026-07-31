/**
 * Public profile /p/[handle] (Player Identity v1 section 7): the
 * read-only Chronicle - no auth and server-rendered on demand. The payload is
 * public, but it is still player progress, so neither HTML nor RSC responses
 * may enter browser, framework, or shared caches.
 *
 * handler-NNNN derived names never resolve here (section 3.2): real
 * handles cannot contain '-', so the format gate 404s them.
 */

import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { HANDLE_REGEX } from '@/lib/identity/handle';
import { isMissingIdentityInfra } from '@/lib/server/identity';
import { buildChronicle, type ChroniclePlayerRow } from '@/lib/server/chronicle';
import { ChronicleView } from '@/components/chronicle/ChronicleView';
import { NavBar } from '@/components/ui/NavBar';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ handle: string }>;
}

async function loadProfile(handle: string) {
  noStore();
  if (!handle || !HANDLE_REGEX.test(handle)) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Case-insensitive claimed-handle match; _ is an ilike wildcard and
  // must be escaped (the format allows no other metacharacters).
  const { data: player, error } = await supabase
    .from('players')
    .select('id, user_id, created_at, handle')
    .ilike('handle', handle.replace(/_/g, '\\_'))
    .maybeSingle();

  if (error) {
    if (!isMissingIdentityInfra(error)) {
      console.error('Public profile page lookup error:', error);
    }
    return null;
  }
  if (!player) return null;

  return buildChronicle(supabase, player as ChroniclePlayerRow, {
    publicView: true,
  });
}

export async function generateMetadata({ params }: PageProps) {
  const { handle } = await params;
  return {
    title: `${handle} — SupaSnake Chronicle`,
    description: `The career chronicle of ${handle} on SupaSnake.`,
  };
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { handle } = await params;
  const payload = await loadProfile(handle);
  if (!payload) notFound();

  return (
    <div className="app-bg text-bone-white">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-28 sm:pb-12 sm:pr-16">
        <div className="mb-6 animate-fade-up">
          <h1 className="heading-display text-3xl text-venom-orange text-glow-orange">
            The Chronicle
          </h1>
          <p className="text-beige font-body mt-1">
            {payload.identity.displayHandle}&apos;s career, on the record
          </p>
        </div>
        <ChronicleView payload={payload} />
      </div>
    </div>
  );
}

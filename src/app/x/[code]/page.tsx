/**
 * `/x/<code>` — a snake, as a URL (Rule 14: "a snake … is linkable").
 *
 * The card is a pure function of the code (see `lineageCode.ts` for why the
 * snake travels in the link rather than in a lookup). Nothing rankable is on
 * it: no score, no Depth, no placement — a lineage card is a portrait, and
 * §8.2 is explicit that Lineage is "what is special about my snake", not a
 * number to beat.
 *
 * Rule 7: no commercial surface. The secondary link goes to the Lab, which
 * is where breeding happens and where nothing is for sale.
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArtifactLanding } from '@/components/share/ArtifactLanding';
import { SHARE_ARTIFACTS_V1_ENABLED } from '@/lib/features/shareArtifacts';
import { lineageCardModelFor } from '@/lib/share/artifactCards';
import { lineageArtifactPath } from '@/lib/share/artifactUrls';
import { decodeLineageCode } from '@/lib/share/lineageCode';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const model = decodeLineageCode((await params).code);
  if (!model) return { title: 'SupaSnake' };
  return {
    title: `${model.snakeName} — Gen ${model.generation} ${model.dynasty} — SupaSnake`,
    description: `A ${model.dynasty} snake, generation ${model.generation}. Breed your own in the Snake Lab.`,
    alternates: { canonical: lineageArtifactPath((await params).code) },
  };
}

export default async function LineageArtifactPage({ params }: PageProps) {
  if (!SHARE_ARTIFACTS_V1_ENABLED) notFound();

  const model = decodeLineageCode((await params).code);
  if (!model) notFound();

  return (
    <ArtifactLanding
      card={lineageCardModelFor(model)}
      actionHref="/game"
      actionLabel="Play SupaSnake"
      blurb="Every snake is bred, not bought. Genes come out of runs, and what you keep compounds into a lineage."
      secondary={{ href: '/lab', label: 'Open the Snake Lab' }}
    />
  );
}

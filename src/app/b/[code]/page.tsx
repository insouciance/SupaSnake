/**
 * `/b/<code>` — a build, as a URL (WP-2.08; the seventh artifact class).
 *
 * The card is a pure function of the code (see `buildCode.ts` for why the
 * plan travels in the link rather than in a lookup, and for the refusal
 * table). Nothing rankable is on it: no Yield, no Score, no placement. A
 * build code is a RECIPE, and a recipe is not evidence — which is exactly
 * why a projected Yield is absent rather than merely unlabelled. Whoever
 * opens this link recomputes the numbers against their OWN inventory in the
 * Workbench, where they are labelled a floor.
 *
 * Rule 7: no commercial surface. The secondary link goes to the Codex, which
 * is the reference the plan is written in and where nothing is for sale.
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArtifactLanding } from '@/components/share/ArtifactLanding';
import { WORKBENCH_V1_ENABLED } from '@/lib/features/workbench';
import { buildCardModelFor, cardShare } from '@/lib/share/artifactCards';
import { buildArtifactPath, buildArtifactUrl } from '@/lib/share/artifactUrls';
import { buildContextName, decodeBuildCode, encodeBuildCode } from '@/lib/share/buildCode';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const model = decodeBuildCode((await params).code);
  if (!model) return { title: 'SupaSnake' };
  return {
    title: `${model.snakeName}'s build — ${model.dynasty} — SupaSnake`,
    description: `A ${model.dynasty} loadout planned for ${buildContextName(model)}. Open it in the Workbench against your own snakes.`,
    alternates: { canonical: buildArtifactPath((await params).code) },
  };
}

export default async function BuildArtifactPage({ params }: PageProps) {
  if (!WORKBENCH_V1_ENABLED) notFound();

  const model = decodeBuildCode((await params).code);
  if (!model) notFound();

  const card = buildCardModelFor(model);

  return (
    <ArtifactLanding
      card={card}
      actionHref="/game"
      actionLabel="Play SupaSnake"
      blurb="A plan, not a result. The Workbench reads your own snakes and your own run history, so the numbers it shows you are yours — and it shows a floor, never a forecast."
      secondary={{ href: '/codex?view=workbench', label: 'Open the Workbench' }}
      share={cardShare(card, buildArtifactUrl(encodeBuildCode(model)))}
    />
  );
}

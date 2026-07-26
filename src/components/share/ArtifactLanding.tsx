/**
 * The landing page every artifact URL resolves to (WP-1.08, Rule 14).
 *
 * Rule 14 asks for two things from a shared link: "an image and a way in".
 * The image is the route's `opengraph-image`; this is the way in. One
 * server component renders all six artifact classes from the same model the
 * card uses, so what a stranger sees on the page always matches what they
 * saw in the feed.
 *
 * RULE 7 — commerce stays in its district. This component renders no price,
 * no SKU, no store link, no subscription pitch and no "upgrade" of any kind,
 * and there is no prop through which a caller could add one. Its single
 * emphasised action is the game.
 *
 * RULE 5 / RULE 6 — nothing here implies a loss. An artifact page shows what
 * somebody did; it never shows what anybody no longer has.
 */

import Link from 'next/link';
import type { ArtifactCardModel } from '@/lib/og/artifactCard';
import { ARTIFACT_FOOTNOTES } from '@/lib/og/artifactCard';
import { ShareArtifactButton } from '@/components/share/ShareArtifactButton';
import type { SharePayload } from '@/lib/share/artifactUrls';

export interface ArtifactLandingProps {
  card: ArtifactCardModel;
  /** Where the primary action goes — a live board, or the Lab. */
  actionHref: string;
  actionLabel: string;
  /** Optional context paragraph explaining what this artifact is. */
  blurb?: string;
  /** A second, quiet link (never commercial). */
  secondary?: { href: string; label: string };
  /**
   * The payload for passing this artifact on. Built by
   * `@/lib/share/artifactUrls`, which is the only place a share text is
   * assembled — see `ShareArtifactButton` for why that matters.
   */
  share?: SharePayload;
}

export function ArtifactLanding({
  card,
  actionHref,
  actionLabel,
  blurb,
  secondary,
  share,
}: ArtifactLandingProps) {
  return (
    <main
      className="app-bg min-h-dvh px-4 py-12"
      data-testid="artifact-landing"
      data-provenance={card.provenance}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <p className="label-arcade text-cosmic" data-testid="artifact-kicker">
          {card.kicker}
        </p>

        <h1
          className="heading-display text-4xl text-venom-orange text-glow-orange"
          data-testid="artifact-title"
        >
          {card.title}
        </h1>

        {card.glyphs && (
          <p className="text-5xl leading-none" data-testid="artifact-glyphs">
            {card.glyphs}
          </p>
        )}

        {card.subtitle && (
          <p className="font-body text-lg text-beige" data-testid="artifact-subtitle">
            {card.subtitle}
          </p>
        )}

        {card.stats && card.stats.length > 0 && (
          <dl className="panel flex flex-wrap gap-8 p-4" data-testid="artifact-stats">
            {card.stats.map((stat) => (
              <div key={stat.label} className="flex flex-col">
                <dt className="label-arcade text-beige/70">{stat.label}</dt>
                <dd className="heading-display text-2xl text-bone-white">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {blurb && (
          <p className="font-body text-beige/80" data-testid="artifact-blurb">
            {blurb}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <Link
            href={actionHref}
            className="btn-go inline-flex min-h-[44px] items-center px-8 py-3 text-lg"
            data-testid="artifact-play"
          >
            {actionLabel}
          </Link>
          {secondary && (
            <Link
              href={secondary.href}
              className="font-body text-beige underline transition-colors hover:text-bone-white"
              data-testid="artifact-secondary"
            >
              {secondary.label}
            </Link>
          )}
          {share && <ShareArtifactButton payload={share} label="Share this" />}
        </div>

        <p className="font-body text-sm text-beige/60" data-testid="artifact-provenance">
          {ARTIFACT_FOOTNOTES[card.provenance]}
        </p>
      </div>
    </main>
  );
}

export default ArtifactLanding;

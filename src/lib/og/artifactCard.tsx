/**
 * One card, six artifacts (WP-1.08, Constitution Rule 14 and §11.3).
 *
 * Every artifact URL — a run, a snake, a clan, a Signal day, a Serpent week,
 * a profile — renders its Open Graph image through this single component, so
 * a link from any of them arrives in a feed looking like the same product.
 * Each route's `opengraph-image.tsx` is then only a data load plus a model.
 *
 * SATORI CONSTRAINTS. `next/og` renders through Satori, which supports a
 * flexbox subset with inline styles only: every container declares
 * `display: flex` explicitly, there are no CSS variables, no Tailwind, no
 * grid and no external font fetch (a strict-CSP artifact and a build-time
 * image both have to work offline). Colours come from `@/lib/og/brand`.
 *
 * RULE 7 — no commercial surface. There is no price, no SKU, no store link
 * and no upsell on any card produced here, and the footer's one call to
 * action is always the same: the game itself.
 *
 * RULES 5 AND 6 — nothing on a card may imply a loss. Cards render what a
 * player DID: a score, a Depth, a week's contribution, a lineage. There is
 * no decline, no "you dropped to", no expiry countdown, and no field in the
 * model through which one could be introduced.
 *
 * CLAIMED VS DERIVED. Numbers that came out of a URL are the sharer's claim,
 * not a record, and the card says so in its footnote via `provenance:
 * 'claimed'`. Numbers read from the calendar or the database are 'verified'.
 * The distinction is visible because a public image that presents a forgeable
 * number as a record is a leaderboard-integrity problem wearing a nice font.
 */

import { ImageResponse } from 'next/og';
import { OG_COLORS, OG_CONTENT_TYPE, OG_IMAGE_SIZE } from '@/lib/og/brand';
import { CANONICAL_ORIGIN } from '@/shared/config/site';

export const ARTIFACT_IMAGE_SIZE = OG_IMAGE_SIZE;
export const ARTIFACT_IMAGE_CONTENT_TYPE = OG_CONTENT_TYPE;

export interface ArtifactStat {
  label: string;
  value: string;
}

export interface ArtifactCardModel {
  /** The small line that names the artifact class: `WORLD SIGNAL · #214`. */
  kicker: string;
  /** The headline. A dare, a settlement, a name — never a sales line. */
  title: string;
  /** The portal-decision glyph row, when the artifact has an arc. */
  glyphs?: string;
  /** The words under the glyphs, or any one-line subtitle. */
  subtitle?: string;
  stats?: readonly ArtifactStat[];
  /**
   * 'verified' — derived from the calendar or read from the database.
   * 'claimed'  — carried in the URL by whoever made the link.
   */
  provenance: 'verified' | 'claimed';
  /** The way in, stated on the card. Rule 14's "a way in". */
  callToAction: string;
}

/** At most three stats fit at this size without the row wrapping. */
const MAX_STATS = 3;

const FOOTNOTES: Record<ArtifactCardModel['provenance'], string> = {
  verified: 'Same conditions worldwide',
  claimed: 'A shared result — play it yourself',
};

function ArtifactCard(model: ArtifactCardModel) {
  const stats = (model.stats ?? []).slice(0, MAX_STATS);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px',
        backgroundImage: `linear-gradient(160deg, ${OG_COLORS.panelTop} 0%, ${OG_COLORS.void} 45%, ${OG_COLORS.voidDeep} 100%)`,
        color: OG_COLORS.boneWhite,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: OG_COLORS.accent,
          }}
        >
          {model.kicker}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 22,
            fontSize: model.title.length > 42 ? 52 : 64,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            color: OG_COLORS.boneWhite,
          }}
        >
          {model.title}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {model.glyphs ? (
          <div
            style={{
              display: 'flex',
              fontSize: 68,
              letterSpacing: '0.08em',
              color: OG_COLORS.accentLight,
            }}
          >
            {model.glyphs}
          </div>
        ) : null}
        {model.subtitle ? (
          <div
            style={{
              display: 'flex',
              marginTop: model.glyphs ? 12 : 0,
              fontSize: 30,
              color: OG_COLORS.beige,
            }}
          >
            {model.subtitle}
          </div>
        ) : null}
        {stats.length > 0 ? (
          <div style={{ display: 'flex', marginTop: 28, gap: 48 }}>
            {stats.map((stat) => (
              <div
                key={stat.label}
                style={{ display: 'flex', flexDirection: 'column' }}
              >
                <div
                  style={{
                    display: 'flex',
                    fontSize: 20,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: OG_COLORS.beige,
                  }}
                >
                  {stat.label}
                </div>
                <div
                  style={{
                    display: 'flex',
                    marginTop: 6,
                    fontSize: 42,
                    fontWeight: 800,
                    color: OG_COLORS.accentLight,
                  }}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          borderTop: `2px solid ${OG_COLORS.scaleBlueLight}`,
          paddingTop: 22,
          fontSize: 24,
          color: OG_COLORS.beige,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', color: OG_COLORS.boneWhite }}>
            {model.callToAction}
          </div>
          <div style={{ display: 'flex', marginTop: 4, fontSize: 20 }}>
            {FOOTNOTES[model.provenance]}
          </div>
        </div>
        <div style={{ display: 'flex', color: OG_COLORS.accent, fontWeight: 700 }}>
          {CANONICAL_ORIGIN.replace('https://', '')}
        </div>
      </div>
    </div>
  );
}

/** Render an artifact card as the route's Open Graph image. */
export function artifactImageResponse(model: ArtifactCardModel): ImageResponse {
  return new ImageResponse(<ArtifactCard {...model} />, ARTIFACT_IMAGE_SIZE);
}

/** Exported for the model tests, which assert copy without rasterising. */
export { ArtifactCard, FOOTNOTES as ARTIFACT_FOOTNOTES, MAX_STATS as ARTIFACT_MAX_STATS };

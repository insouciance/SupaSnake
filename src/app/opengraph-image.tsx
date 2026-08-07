/**
 * The Open Graph card (Constitution §11.4). Generated at build time by
 * next/og — no new dependency, no committed binary, and it stays correct
 * when the pitch line changes because it reads the same site config every
 * other surface reads.
 *
 * Satori supports a flexbox subset only: every container declares display
 * flex explicitly, and no CSS variables or Tailwind classes are used.
 */

import { ImageResponse } from 'next/og';
import { OG_COLORS, OG_CONTENT_TYPE, OG_IMAGE_SIZE } from '@/lib/og/brand';
import { OG_MARK_DATA_URI, OG_MARK_HEIGHT, OG_MARK_WIDTH } from '@/lib/og/markImage';
import { CANONICAL_ORIGIN, SITE_NAME, SITE_TAGLINE } from '@/shared/config/site';

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = OG_IMAGE_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** The three portal choices, which are the product's signature (§5). */
const CHOICES = ['BANK IT', 'PUSH YOUR LUCK', 'FEED THE SNAKE'];

/**
 * Rendered width of the mark on the card. The content column is 1040px wide
 * (1200 less two 80px gutters); 560 leaves the burst clear of the tagline and
 * keeps the lettering comfortably above the size at which it stops reading.
 */
const MARK_W = 560;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          backgroundImage: `linear-gradient(160deg, ${OG_COLORS.panelTop} 0%, ${OG_COLORS.void} 45%, ${OG_COLORS.voidDeep} 100%)`,
          color: OG_COLORS.boneWhite,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* The real mark, not the product name set in whatever face Satori
              falls back to. Satori resolves no network and no filesystem, so
              the logo arrives as a data URI compiled into the bundle by
              `scripts/build-brand-assets.mjs`. */}
          <img
            src={OG_MARK_DATA_URI}
            alt={SITE_NAME}
            width={MARK_W}
            height={Math.round((MARK_W * OG_MARK_HEIGHT) / OG_MARK_WIDTH)}
          />
          <div
            style={{
              display: 'flex',
              marginTop: 4,
              fontSize: 26,
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              color: OG_COLORS.beige,
            }}
          >
            {SITE_TAGLINE}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 42,
              fontWeight: 700,
              lineHeight: 1.25,
              color: OG_COLORS.boneWhite,
            }}
          >
            Every run ends with a deal.
          </div>
          <div style={{ display: 'flex', marginTop: 28, gap: 16 }}>
            {CHOICES.map((choice) => (
              <div
                key={choice}
                style={{
                  display: 'flex',
                  padding: '12px 22px',
                  borderRadius: 4,
                  border: `2px solid ${OG_COLORS.scaleBlueLight}`,
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: OG_COLORS.accentLight,
                }}
              >
                {choice}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTop: `2px solid ${OG_COLORS.scaleBlueLight}`,
            paddingTop: 24,
            fontSize: 24,
            color: OG_COLORS.beige,
          }}
        >
          <div style={{ display: 'flex' }}>
            Three-minute precision snake · no install, no ads
          </div>
          <div style={{ display: 'flex', color: OG_COLORS.accent, fontWeight: 700 }}>
            {CANONICAL_ORIGIN.replace('https://', '')}
          </div>
        </div>
      </div>
    ),
    size
  );
}

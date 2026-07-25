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
import { CANONICAL_ORIGIN, SITE_NAME, SITE_TAGLINE } from '@/shared/config/site';

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = OG_IMAGE_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** The three portal choices, which are the product's signature (§5). */
const CHOICES = ['BANK IT', 'PUSH YOUR LUCK', 'FEED THE SNAKE'];

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
          <div
            style={{
              display: 'flex',
              fontSize: 96,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: OG_COLORS.accent,
            }}
          >
            {SITE_NAME.toUpperCase()}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 8,
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

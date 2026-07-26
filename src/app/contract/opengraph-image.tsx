/**
 * The Open Graph card for `/contract` (Rule 14 — if it matters, it has a URL
 * and it unfurls).
 *
 * The contract's whole value as a channel (§11.6) is that someone pastes the
 * link into a thread and the claim survives the paste. So the card carries
 * the four claims themselves, not the product's pitch: what unfurls has to
 * be the argument, or the link is just another logo in a feed.
 *
 * Deliberately NOT behind the page's flag: an image is not a player surface,
 * and a card that renders while the page is still dark is strictly better
 * than a card that breaks on the day the flag flips.
 *
 * Satori supports a flexbox subset only: every container declares display
 * flex explicitly, and no CSS variables or Tailwind classes are used.
 */

import { ImageResponse } from 'next/og';
import { OG_COLORS, OG_CONTENT_TYPE, OG_IMAGE_SIZE } from '@/lib/og/brand';
import { CONTRACT_CARD_LINES, CONTRACT_TITLE } from '@/lib/growth/playerContract';
import { CANONICAL_ORIGIN, SITE_NAME } from '@/shared/config/site';

export const alt = `${SITE_NAME} — ${CONTRACT_TITLE}`;
export const size = OG_IMAGE_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function ContractOpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 80px',
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
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: OG_COLORS.beige,
            }}
          >
            {SITE_NAME}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 10,
              fontSize: 68,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: OG_COLORS.accent,
            }}
          >
            {CONTRACT_TITLE}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {CONTRACT_CARD_LINES.map((line) => (
            <div
              key={line}
              style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: 36,
                fontWeight: 700,
                lineHeight: 1.2,
                color: OG_COLORS.boneWhite,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  width: 10,
                  height: 34,
                  marginRight: 22,
                  backgroundColor: OG_COLORS.accentLight,
                }}
              />
              {line}
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTop: `2px solid ${OG_COLORS.scaleBlueLight}`,
            paddingTop: 22,
            fontSize: 22,
            color: OG_COLORS.beige,
          }}
        >
          <div style={{ display: 'flex' }}>
            Nine clauses, each with the question you check it with
          </div>
          <div style={{ display: 'flex', color: OG_COLORS.accent, fontWeight: 700 }}>
            {`${CANONICAL_ORIGIN.replace('https://', '')}/contract`}
          </div>
        </div>
      </div>
    ),
    size
  );
}

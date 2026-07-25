/**
 * The iOS home-screen icon (Constitution §11.4). Apple's convention accepts
 * raster only, so this renders the same orthogonal snake mark as
 * `icon.svg` through next/og rather than shipping a hand-exported PNG.
 */

import { ImageResponse } from 'next/og';
import { APPLE_ICON_SIZE, OG_COLORS, OG_CONTENT_TYPE } from '@/lib/og/brand';

export const size = APPLE_ICON_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: OG_COLORS.voidDeep,
        }}
      >
        <svg width="180" height="180" viewBox="0 0 64 64">
          <path
            d="M46 18 H24 V32 H40 V46 H18"
            fill="none"
            stroke={OG_COLORS.accent}
            strokeWidth="9"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
          <rect x="41.5" y="13.5" width="9" height="9" fill={OG_COLORS.accentLight} />
        </svg>
      </div>
    ),
    size
  );
}

import type { Metadata, Viewport } from 'next';
import { Russo_One, Rajdhani } from 'next/font/google';
import './globals.css';

const fontDisplay = Russo_One({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const fontBody = Rajdhani({
  weight: ['500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { OfflineProgressProvider } from '@/components/engagement/OfflineProgressProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { AnalyticsProvider } from '@/components/analytics/AnalyticsProvider';
import { ConsentBanner } from '@/components/legal/ConsentBanner';
import { Footer } from '@/components/ui/Footer';
import { NotificationProvider } from '@/components/ui/NotificationProvider';
import {
  CANONICAL_ORIGIN,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  deploymentOrigin,
} from '@/shared/config/site';

/**
 * Document metadata (Constitution §11.4 — "hygiene shipped in Phase 0").
 *
 * `metadataBase` uses the deployment origin so relative OG image paths
 * resolve on previews and localhost; `alternates.canonical` pins the
 * canonical origin so a preview never competes with production in an index.
 * Icons and the OG/Twitter images come from the App Router file conventions
 * (`icon.svg`, `apple-icon.tsx`, `opengraph-image.tsx`, `twitter-image.tsx`)
 * and are therefore deliberately absent from this object.
 */
export const metadata: Metadata = {
  metadataBase: new URL(deploymentOrigin()),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'snake game',
    'online snake game',
    'browser game',
    'free snake game',
    'roguelite',
    'precision snake',
    'no download',
  ],
  alternates: { canonical: CANONICAL_ORIGIN },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: CANONICAL_ORIGIN,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  category: 'games',
};

// viewport-fit=cover lets env(safe-area-inset-*) resolve on notched phones
// (the game page anchors its touch controls above the home indicator).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e141c',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fontDisplay.variable} ${fontBody.variable}`}>
      <body>
        <AuthProvider>
          <ToastProvider>
            <NotificationProvider>
              <OfflineProgressProvider>
                <AnalyticsProvider>
                  {children}
                  <Footer />
                  <ConsentBanner />
                </AnalyticsProvider>
              </OfflineProgressProvider>
            </NotificationProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

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

export const metadata: Metadata = {
  title: 'SupaSnake - Collection RPG',
  description: 'Where skill creates legacy. Collect, breed, and evolve your dynasty.',
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

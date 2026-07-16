import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { OfflineProgressProvider } from '@/components/engagement/OfflineProgressProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { AnalyticsProvider } from '@/components/analytics/AnalyticsProvider';
import { ConsentBanner } from '@/components/legal/ConsentBanner';

export const metadata: Metadata = {
  title: 'SupaSnake - Collection RPG',
  description: 'Where skill creates legacy. Collect, breed, and evolve your dynasty.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>
            <OfflineProgressProvider>
              <AnalyticsProvider>
                {children}
                <ConsentBanner />
              </AnalyticsProvider>
            </OfflineProgressProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

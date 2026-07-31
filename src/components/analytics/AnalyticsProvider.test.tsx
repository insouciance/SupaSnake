import { render, waitFor } from '@testing-library/react';
import { AnalyticsProvider } from './AnalyticsProvider';
import {
  clearLegacyPostHogPersistence,
  disableAnalytics,
  initAnalytics,
} from '@/lib/analytics/posthog';

jest.mock('@/lib/analytics/posthog', () => ({
  ANALYTICS_READY_EVENT: 'analytics-ready',
  clearLegacyPostHogPersistence: jest.fn(),
  disableAnalytics: jest.fn(),
  enableAnalytics: jest.fn(),
  initAnalytics: jest.fn(),
  isAnalyticsInitialized: jest.fn(() => false),
}));

describe('AnalyticsProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('purges legacy analytics storage without consent or a current token', async () => {
    render(
      <AnalyticsProvider>
        <div>child</div>
      </AnalyticsProvider>
    );

    await waitFor(() => expect(clearLegacyPostHogPersistence).toHaveBeenCalledTimes(1));
    expect(initAnalytics).not.toHaveBeenCalled();
    expect(disableAnalytics).not.toHaveBeenCalled();
  });
});

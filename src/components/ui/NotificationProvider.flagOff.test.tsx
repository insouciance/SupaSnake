import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NotificationProvider } from './NotificationProvider';
import { useNotificationStore } from '@/lib/stores/notificationStore';

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { access_token: 'token' }, isLoading: false }),
}));
jest.mock('@/lib/features/careerSpine', () => ({
  CAREER_SPINE_V1_ENABLED: false,
}));

it('does not read or expose server recognition when presentation is off', async () => {
  global.fetch = jest.fn() as jest.Mock;
  useNotificationStore.setState({ notifications: {}, hasHydrated: false });
  useNotificationStore.getState().replaceServerItems([{
    id: 'record-recognition',
    kind: 'recognition',
    status: 'unseen',
    destination: 'records',
    headline: 'New record',
    momentId: 'moment-1',
    artifactRef: 'risk_carrier',
    source: { type: 'moment', id: 'moment-1' },
    createdAt: '2026-07-30T10:00:00.000Z',
  }]);

  render(<NotificationProvider><div>child</div></NotificationProvider>);

  expect(screen.getByText('child')).toBeInTheDocument();
  await waitFor(() => {
    expect(useNotificationStore.getState().notifications).toEqual({});
  });
  expect(global.fetch).not.toHaveBeenCalled();
});

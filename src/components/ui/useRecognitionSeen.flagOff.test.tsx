import { render } from '@testing-library/react';
import { useRecognitionSeen } from './useRecognitionSeen';
import { useNotificationStore } from '@/lib/stores/notificationStore';

jest.mock('@/lib/analytics/posthog', () => ({ trackEvent: jest.fn() }));
jest.mock('@/lib/features/careerSpine', () => ({
  CAREER_SPINE_V1_ENABLED: false,
}));

function Harness() {
  useRecognitionSeen('records', true, 'token', {
    artifactRefs: ['risk_carrier'],
  });
  return null;
}

it('never sends a seen mutation when Career Spine presentation is off', () => {
  global.fetch = jest.fn() as jest.Mock;
  useNotificationStore.setState({ notifications: {}, hasHydrated: true });
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

  render(<Harness />);

  expect(global.fetch).not.toHaveBeenCalled();
  expect(useNotificationStore.getState().notifications['record-recognition'])
    .toBeDefined();
});

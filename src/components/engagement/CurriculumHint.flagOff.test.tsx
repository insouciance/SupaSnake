import { render } from '@testing-library/react';

jest.mock('@/lib/features/playerEvolution', () => ({
  PLAYER_EVOLUTION_ENABLED: false,
  playerEvolutionEnabled: () => false,
}));
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { access_token: 'token' } }),
}));

const mockTransition = jest.fn();
jest.mock('@/lib/stores/notificationStore', () => {
  const actual = jest.requireActual('@/lib/stores/notificationStore');
  return {
    ...actual,
    transitionServerNotification: (...args: unknown[]) => mockTransition(...args),
  };
});

import { CurriculumHint } from './CurriculumHint';
import {
  useNotificationStore,
  type ServerAttentionItem,
} from '@/lib/stores/notificationStore';

const item: ServerAttentionItem = {
  id: 'attention-1',
  kind: 'action',
  status: 'unseen',
  destination: 'codex',
  headline: 'Loop Trap joined your Power Pods',
  artifactRef: 'gene:coilkeeper',
  source: { type: 'curriculum', id: 'session-1' },
  createdAt: '2026-08-05T12:00:00.000Z',
};

describe('CurriculumHint with the curriculum flag off', () => {
  it('renders nothing and transitions nothing, even with a live row present', () => {
    // A row written before a rollback must not be erased or acted on: flag-off
    // is a dual-version fallback, not a data migration (WP-B's flag contract).
    useNotificationStore.getState().replaceServerItems([item]);
    const { container } = render(<CurriculumHint />);
    expect(container).toBeEmptyDOMElement();
    expect(mockTransition).not.toHaveBeenCalled();
  });
});

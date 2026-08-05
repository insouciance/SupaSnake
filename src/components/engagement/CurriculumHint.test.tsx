import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockTransition = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('@/lib/features/playerEvolution', () => ({
  PLAYER_EVOLUTION_ENABLED: true,
  playerEvolutionEnabled: () => true,
}));
jest.mock('@/lib/features/careerSpine', () => ({
  CAREER_SPINE_V1_ENABLED: true,
}));
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

import { CurriculumHint } from './CurriculumHint';
import {
  transitionServerNotification,
  useNotificationStore,
  type ServerAttentionItem,
} from '@/lib/stores/notificationStore';

jest.mock('@/lib/stores/notificationStore', () => {
  const actual = jest.requireActual('@/lib/stores/notificationStore');
  return {
    ...actual,
    transitionServerNotification: (...args: unknown[]) => mockTransition(...args),
  };
});

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

beforeEach(() => {
  jest.clearAllMocks();
  mockTransition.mockResolvedValue(item);
  mockUseAuth.mockReturnValue({ session: { access_token: 'token' } });
  useNotificationStore.getState().replaceServerItems([]);
});

describe('CurriculumHint', () => {
  it('names the power and where to read it', async () => {
    useNotificationStore.getState().replaceServerItems([item]);
    render(<CurriculumHint />);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Loop Trap is in your Power Pods now.'
    );
    expect(screen.getByRole('status')).toHaveTextContent('read the rule');
  });

  it('records the introduction on the server, never in the browser', async () => {
    useNotificationStore.getState().replaceServerItems([item]);
    render(<CurriculumHint />);
    await waitFor(() =>
      expect(mockTransition).toHaveBeenCalledWith('attention-1', 'seen', 'token')
    );
    // Reading is not declining: the row is never moved to a terminal state here.
    expect(mockTransition).not.toHaveBeenCalledWith(
      'attention-1',
      'dismissed',
      'token'
    );
  });

  it('closes without declining the invitation', async () => {
    useNotificationStore.getState().replaceServerItems([item]);
    render(<CurriculumHint />);
    await screen.findByRole('status');
    fireEvent.click(screen.getByLabelText('Dismiss hint'));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(mockTransition).not.toHaveBeenCalledWith(
      'attention-1',
      'dismissed',
      'token'
    );
  });

  it('renders nothing without an open invitation', () => {
    const { container } = render(<CurriculumHint />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a signed-out visitor', () => {
    mockUseAuth.mockReturnValue({ session: null });
    useNotificationStore.getState().replaceServerItems([]);
    const { container } = render(<CurriculumHint />);
    expect(container).toBeEmptyDOMElement();
  });
});

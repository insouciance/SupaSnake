import { openClanRevealInvitation } from './clanRevealAttention';
import { openCurriculumInvitation } from './curriculumAttention';
import {
  destinationBadge,
  markedDestinationHref,
  useNotificationStore,
  type ServerAttentionItem,
} from '@/lib/stores/notificationStore';
import { CLAN_REVEAL_SOURCE_TYPE } from '@/shared/game/clanReveal';

function clanItem(overrides: Partial<ServerAttentionItem> = {}): ServerAttentionItem {
  return {
    id: 'clan-attention-1',
    kind: 'action',
    status: 'unseen',
    destination: 'clan',
    headline: 'Your runs can now power a Clan.',
    detail: 'Show me where they count — found one, join one, or start as a clan of one.',
    source: { type: CLAN_REVEAL_SOURCE_TYPE, id: 'clan-reveal' },
    createdAt: '2026-08-05T12:00:00.000Z',
    ...overrides,
  };
}

function geneItem(overrides: Partial<ServerAttentionItem> = {}): ServerAttentionItem {
  return {
    id: 'gene-attention-1',
    kind: 'action',
    status: 'unseen',
    destination: 'codex',
    headline: 'Loop Trap joined your Power Pods',
    detail: 'Read what it changes and what it commits before your next run.',
    artifactRef: 'gene:coilkeeper',
    source: { type: 'curriculum', id: 'session-1' },
    createdAt: '2026-08-05T12:00:00.000Z',
    ...overrides,
  };
}

function storeWith(items: ServerAttentionItem[]) {
  useNotificationStore.getState().replaceServerItems(items);
  return useNotificationStore.getState().notifications;
}

beforeEach(() => {
  useNotificationStore.getState().replaceServerItems([]);
});

describe('clan reveal lifecycle (server-held)', () => {
  it('is open while the row is unseen', () => {
    expect(openClanRevealInvitation(storeWith([clanItem()]))).toMatchObject({
      attentionId: 'clan-attention-1',
      label: 'Your runs can now power a Clan.',
      href: '/clan',
      declineLabel: 'Not now',
      unseen: true,
    });
  });

  it('stays open once seen — reading is not declining', () => {
    const reveal = openClanRevealInvitation(
      storeWith([clanItem({ status: 'seen', seenAt: '2026-08-05T12:01:00.000Z' })])
    );
    expect(reveal).not.toBeNull();
    expect(reveal?.unseen).toBe(false);
  });

  it('closes on **Not now** and never re-nags', () => {
    for (const status of ['dismissed', 'resolved'] as const) {
      expect(
        openClanRevealInvitation(
          storeWith([clanItem({ status, resolvedAt: '2026-08-05T12:02:00.000Z' })])
        )
      ).toBeNull();
    }
  });

  it('holds no browser copy of any of it (boundary 9)', () => {
    storeWith([clanItem()]);
    // The store is the only holder, and it is rebuilt from the server on every
    // sync. Nothing about the reveal is written to a browser store.
    expect(typeof localStorage.getItem('clan-reveal')).toBe('object');
    expect(localStorage.length).toBe(0);
  });

  it('never confuses the clan reveal with a Gene invitation', () => {
    const notifications = storeWith([clanItem(), geneItem()]);
    expect(openClanRevealInvitation(notifications)?.attentionId).toBe('clan-attention-1');
    expect(openCurriculumInvitation(notifications)?.attentionId).toBe('gene-attention-1');
  });

  it('is not produced by a row from another source type', () => {
    expect(
      openClanRevealInvitation(
        storeWith([clanItem({ source: { type: 'clan_battle', id: 'battle-1' } })])
      )
    ).toBeNull();
  });
});

describe('the quiet Compete marker (PEO §6 step 2, §6.2)', () => {
  it('marks Compete with a dot, never a pulsing exclamation', () => {
    expect(destinationBadge(storeWith([clanItem()]), 'clan')).toEqual({ kind: 'dot' });
  });

  it('sends the marked Compete node to /clan, not to the leaderboard', () => {
    expect(markedDestinationHref(storeWith([clanItem()]), 'clan')).toBe('/clan');
  });

  it('leaves a destination with nothing open unmarked', () => {
    expect(markedDestinationHref(storeWith([]), 'clan')).toBeNull();
    expect(destinationBadge(storeWith([]), 'clan')).toEqual({ kind: 'hidden' });
  });

  it('drops the mark once the reveal is declined', () => {
    const dismissed = storeWith([
      clanItem({ status: 'dismissed', resolvedAt: '2026-08-05T12:02:00.000Z' }),
    ]);
    expect(destinationBadge(dismissed, 'clan')).toEqual({ kind: 'hidden' });
    expect(markedDestinationHref(dismissed, 'clan')).toBeNull();
  });
});

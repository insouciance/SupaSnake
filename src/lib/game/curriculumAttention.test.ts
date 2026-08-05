import { openCurriculumInvitation } from './curriculumAttention';
import {
  parseServerAttentionItem,
  useNotificationStore,
  type ServerAttentionItem,
} from '@/lib/stores/notificationStore';

function serverItem(
  overrides: Partial<ServerAttentionItem> = {}
): ServerAttentionItem {
  return {
    id: 'attention-1',
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

describe('curriculum invitation lifecycle (server-held)', () => {
  it('is open while the row is unseen', () => {
    const invitation = openCurriculumInvitation(storeWith([serverItem()]));
    expect(invitation).toMatchObject({
      attentionId: 'attention-1',
      geneId: 'coilkeeper',
      label: 'Show me Loop Trap',
      declineLabel: 'Not now',
      href: '/codex',
      unseen: true,
    });
  });

  it('stays open once seen — reading is not declining', () => {
    const invitation = openCurriculumInvitation(
      storeWith([serverItem({ status: 'seen', seenAt: '2026-08-05T12:01:00.000Z' })])
    );
    expect(invitation).not.toBeNull();
    expect(invitation?.unseen).toBe(false);
  });

  it('closes on **Not now** and stays closed', () => {
    for (const status of ['dismissed', 'resolved'] as const) {
      expect(
        openCurriculumInvitation(
          storeWith([
            serverItem({ status, resolvedAt: '2026-08-05T12:02:00.000Z' }),
          ])
        )
      ).toBeNull();
    }
  });

  it('ignores every attention row that is not a curriculum invitation', () => {
    expect(
      openCurriculumInvitation(
        storeWith([
          serverItem({
            id: 'attention-2',
            kind: 'recognition',
            momentId: 'moment-1',
            artifactRef: 'PRIMAL',
            destination: 'mastery',
            source: { type: 'run', id: 'session-1' },
          }),
        ])
      )
    ).toBeNull();
  });

  it('ignores a curriculum row whose artifact is not a current-roster Gene', () => {
    expect(
      openCurriculumInvitation(
        storeWith([serverItem({ artifactRef: 'gene:not_a_gene' })])
      )
    ).toBeNull();
  });

  it('offers the oldest invitation when two are somehow open (boundary 5)', () => {
    const invitation = openCurriculumInvitation(
      storeWith([
        serverItem({
          id: 'attention-new',
          artifactRef: 'gene:wall_rush',
          createdAt: '2026-08-05T13:00:00.000Z',
        }),
        serverItem(),
      ])
    );
    expect(invitation?.attentionId).toBe('attention-1');
  });

  it('carries the row’s source type through the parser and the store', () => {
    // The badge for optional learning is a destination DOT, never a pulsing
    // global exclamation (§5 presentation constraints), and that decision is
    // made from `source_type` — so it has to survive the transport.
    const parsed = parseServerAttentionItem(serverItem());
    expect(parsed).not.toBeNull();
    const stored = Object.values(storeWith([serverItem()]))[0];
    expect(stored.sourceType).toBe('curriculum');
    expect(stored.badgeKind).toBe('dot');
    expect(stored.notificationClass).toBe('attention');
  });

  it('leaves an ordinary action item shouting as it did before', () => {
    const stored = Object.values(
      storeWith([
        serverItem({
          source: { type: 'run', id: 'session-1' },
          artifactRef: 'gene:coilkeeper',
        }),
      ])
    )[0];
    expect(stored.badgeKind).toBe('exclamation');
  });

  it('holds no browser copy of any of it', () => {
    storeWith([serverItem()]);
    // The store is memory-only by construction; this asserts the feature adds
    // no persistence of its own. `verify:constitution`'s local-progress gate
    // enforces the same rule at build time.
    expect(
      Object.keys(globalThis.localStorage ?? {}).filter((key) =>
        /curriculum|attention/i.test(key)
      )
    ).toEqual([]);
  });
});

'use client';

import { create } from 'zustand';
import { progressionArtifactHref } from '@/shared/progression/destinations';
import { CLAN_REVEAL_SOURCE_TYPE } from '@/shared/game/clanReveal';
import { CURRICULUM_SOURCE_TYPE } from '@/shared/game/curriculum';

/**
 * Attention is an unresolved action. Recognition is an unseen earned moment.
 * Only attention reaches the global bell; recognition is a quiet destination
 * dot. Neither is persisted in browser storage. Authenticated state is loaded
 * from `/api/progression/attention`; signed-out state is memory-only.
 */
export type NotificationBadgeKind =
  | 'hidden'
  | 'dot'
  | 'exclamation'
  | 'numeric';
export type NotificationClass = 'attention' | 'recognition';
export type NotificationAttentionReason =
  | 'action-required'
  | 'reward-available'
  | 'progression-opportunity';
export type NotificationAction =
  | 'open-save-progress';
export type NotificationDestination =
  | 'global'
  | 'home'
  | 'lab'
  | 'account'
  | 'identity'
  | 'chronicle'
  | 'mastery'
  | 'records'
  | 'codex'
  | 'signal'
  | 'clan'
  | 'lineage';
export type NotificationTransition = 'seen' | 'resolved' | 'dismissed';

interface NotificationTarget {
  destination: NotificationDestination;
  href: string;
  action?: NotificationAction;
}

export const NOTIFICATION_TARGETS = {
  saveProgress: {
    destination: 'account',
    href: '/#save-progress',
    action: 'open-save-progress',
  },
  lab: { destination: 'lab', href: '/lab' },
  identity: { destination: 'identity', href: '/profile' },
  chronicle: { destination: 'chronicle', href: '/profile' },
  mastery: { destination: 'mastery', href: '/profile#mastery' },
  records: { destination: 'records', href: '/profile#records' },
  codex: { destination: 'codex', href: '/codex' },
  signal: { destination: 'signal', href: '/#signal' },
  clan: { destination: 'clan', href: '/clan' },
  lineage: { destination: 'lineage', href: '/lab#lineage' },
} as const satisfies Record<string, NotificationTarget>;

const NOTIFICATION_ACTION_EVENT = 'supasnake:notification-action';
export const ATTENTION_REFRESH_EVENT = 'supasnake:attention-refresh';

export function notificationActionForHref(href: string): NotificationAction | undefined {
  const target = Object.values(NOTIFICATION_TARGETS).find(
    (candidate) => candidate.href === href
  );
  return target && 'action' in target ? target.action : undefined;
}

export function dispatchNotificationAction(action: NotificationAction): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(NOTIFICATION_ACTION_EVENT, { detail: { action } })
  );
}

export function requestAttentionRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ATTENTION_REFRESH_EVENT));
}

export function subscribeNotificationAction(
  action: NotificationAction,
  listener: () => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handleAction = (event: Event) => {
    if (
      event instanceof CustomEvent &&
      (event.detail as { action?: NotificationAction } | null)?.action === action
    ) {
      listener();
    }
  };
  window.addEventListener(NOTIFICATION_ACTION_EVENT, handleAction);
  return () => window.removeEventListener(NOTIFICATION_ACTION_EVENT, handleAction);
}

interface NotificationBase {
  id: string;
  title: string;
  description: string;
  destination: NotificationDestination;
}

export interface GameNotification extends NotificationBase {
  notificationClass: NotificationClass;
  badgeKind: Exclude<NotificationBadgeKind, 'hidden'>;
  attentionReason: NotificationAttentionReason;
  count?: number;
  href: string;
  action?: NotificationAction;
  actionLabel?: string;
  createdAt: number;
  updatedAt: number;
  /** True when the API, rather than this tab, owns the item lifecycle. */
  serverManaged: boolean;
  serverStatus?: 'unseen' | 'seen';
  /** Exact server-owned artifact that must be rendered before recognition clears. */
  artifactRef?: string;
  /**
   * The server row's `source_type`, kept so a surface can recognise the item
   * it owns without re-fetching. `'curriculum'` is WP-D's guided-reveal
   * invitation; everything else is `'run'` or `'clan_battle'`.
   */
  sourceType?: string;
}

export type NotificationInput =
  | (NotificationBase & { badgeKind: 'hidden' })
  | (Omit<
      GameNotification,
      'createdAt' | 'updatedAt' | 'notificationClass' | 'serverManaged'
    > & {
      createdAt?: number;
      notificationClass?: NotificationClass;
      serverManaged?: boolean;
    });

export interface ServerAttentionItem {
  id: string;
  kind: 'action' | 'recognition';
  status: 'unseen' | 'seen' | 'resolved' | 'dismissed';
  destination: string;
  headline: string;
  detail?: string;
  momentId?: string;
  artifactRef?: string;
  source: { type: string; id: string };
  createdAt: string;
  seenAt?: string;
  resolvedAt?: string;
}

interface NotificationState {
  notifications: Record<string, GameNotification>;
  /** Compatibility name: now means the server/memory inbox is ready. */
  hasHydrated: boolean;
  publish: (notification: NotificationInput) => void;
  clear: (id: string) => void;
  resolve: (id: string) => void;
  clearAll: () => void;
  setHasHydrated: (value: boolean) => void;
  replaceServerItems: (items: ServerAttentionItem[]) => void;
  applyServerItem: (item: ServerAttentionItem) => void;
}

function normalizeCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value ?? 0));
}

function notificationClassForInput(
  input: Exclude<NotificationInput, NotificationBase & { badgeKind: 'hidden' }>
): NotificationClass {
  if (input.notificationClass) return input.notificationClass;
  return input.attentionReason === 'progression-opportunity'
    ? 'recognition'
    : 'attention';
}

function destinationTarget(destination: string): NotificationTarget | null {
  const target = Object.values(NOTIFICATION_TARGETS).find(
    (candidate) => candidate.destination === destination
  );
  return target ?? null;
}

export function parseServerAttentionItem(value: unknown): ServerAttentionItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== 'string' ||
    (item.kind !== 'action' && item.kind !== 'recognition') ||
    !['unseen', 'seen', 'resolved', 'dismissed'].includes(String(item.status)) ||
    typeof item.destination !== 'string' ||
    typeof item.headline !== 'string' ||
    typeof item.createdAt !== 'string' ||
    !item.source ||
    typeof item.source !== 'object' ||
    Array.isArray(item.source)
  ) {
    return null;
  }
  const source = item.source as Record<string, unknown>;
  if (typeof source.type !== 'string' || typeof source.id !== 'string') return null;
  if (
    item.artifactRef !== undefined &&
    (typeof item.artifactRef !== 'string' || item.artifactRef.trim().length === 0)
  ) return null;
  if (
    item.kind === 'recognition' &&
    (typeof item.momentId !== 'string' ||
      item.momentId.trim().length === 0 ||
      typeof item.artifactRef !== 'string' ||
      item.artifactRef.trim().length === 0)
  ) return null;
  return item as unknown as ServerAttentionItem;
}

function notificationFromServerItem(item: ServerAttentionItem): GameNotification | null {
  if (
    item.status === 'resolved' ||
    item.status === 'dismissed' ||
    (item.kind === 'recognition' && item.status === 'seen')
  ) {
    return null;
  }
  const target = destinationTarget(item.destination);
  if (!target) return null;
  const createdAt = Date.parse(item.createdAt);
  const href = item.artifactRef && [
    'chronicle',
    'mastery',
    'records',
    'codex',
    'signal',
    'clan',
    'lab',
    'lineage',
  ].includes(target.destination)
    ? progressionArtifactHref(
        target.destination as Parameters<typeof progressionArtifactHref>[0],
        item.artifactRef
      )
    : target.href;
  return {
    id: item.id,
    title: item.headline,
    description: item.detail ?? (item.kind === 'action' ? 'Action available.' : 'New milestone.'),
    destination: target.destination,
    href,
    ...('action' in target && target.action ? { action: target.action } : {}),
    notificationClass: item.kind === 'action' ? 'attention' : 'recognition',
    // Optional learning gets a destination DOT, never a pulsing exclamation
    // (PEO §5, presentation constraints). It is an `action` row because only
    // an action can carry the terminal states a **Not now** needs — the badge
    // is a presentation choice, not a change to what the row is.
    //
    // The eight-bank clan reveal joins it for the same reason and one more:
    // §6 promises a player who declines "a quiet clan destination marker", and
    // an exclamation on Compete is not quiet. It is also the only badge a
    // player at eight banks has not asked for, so it is the last one that
    // should shout.
    badgeKind:
      item.kind !== 'action'
        ? 'dot'
        : item.source.type === CURRICULUM_SOURCE_TYPE ||
            item.source.type === CLAN_REVEAL_SOURCE_TYPE
          ? 'dot'
          : 'exclamation',
    sourceType: item.source.type,
    attentionReason:
      item.kind === 'action' ? 'action-required' : 'progression-opportunity',
    serverManaged: true,
    serverStatus: item.status === 'seen' ? 'seen' : 'unseen',
    ...(item.artifactRef ? { artifactRef: item.artifactRef } : {}),
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
  };
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: {},
  hasHydrated: false,
  publish: (input) =>
    set((state) => {
      if (input.badgeKind === 'hidden') {
        const { [input.id]: _removed, ...remaining } = state.notifications;
        return { notifications: remaining };
      }
      const count = normalizeCount(input.count);
      if (
        (input.badgeKind === 'numeric' && count === 0) ||
        typeof input.href !== 'string' ||
        input.href.trim().length === 0
      ) {
        const { [input.id]: _removed, ...remaining } = state.notifications;
        return { notifications: remaining };
      }
      const now = Date.now();
      const existing = state.notifications[input.id];
      const notificationClass = notificationClassForInput(input);
      const notification: GameNotification = {
        ...input,
        notificationClass,
        badgeKind:
          notificationClass === 'recognition' ? 'dot' : input.badgeKind,
        ...(input.badgeKind === 'numeric' && notificationClass === 'attention'
          ? { count }
          : { count: undefined }),
        serverManaged: input.serverManaged ?? false,
        createdAt: existing?.createdAt ?? input.createdAt ?? now,
        updatedAt: now,
      };
      return {
        notifications: { ...state.notifications, [input.id]: notification },
      };
    }),
  clear: (id) =>
    set((state) => {
      // Server-owned state is transitioned through PATCH, never erased by a
      // route mount or optimistic client assumption.
      if (state.notifications[id]?.serverManaged) return state;
      const { [id]: _removed, ...remaining } = state.notifications;
      return { notifications: remaining };
    }),
  resolve: (id) =>
    set((state) => {
      const { [id]: _removed, ...remaining } = state.notifications;
      return { notifications: remaining };
    }),
  clearAll: () =>
    set((state) => ({
      notifications: Object.fromEntries(
        Object.entries(state.notifications).filter(([, item]) => item.serverManaged)
      ),
    })),
  setHasHydrated: (value) => set({ hasHydrated: value }),
  replaceServerItems: (items) =>
    set((state) => {
      const localEntries = Object.entries(state.notifications).filter(
        ([, item]) => !item.serverManaged
      );
      const serverEntries = items.flatMap((item) => {
        const notification = notificationFromServerItem(item);
        return notification ? [[notification.id, notification] as const] : [];
      });
      return {
        notifications: Object.fromEntries([...localEntries, ...serverEntries]),
        hasHydrated: true,
      };
    }),
  applyServerItem: (item) =>
    set((state) => {
      const notification = notificationFromServerItem(item);
      if (!notification) {
        const { [item.id]: _removed, ...remaining } = state.notifications;
        return { notifications: remaining };
      }
      return {
        notifications: {
          ...state.notifications,
          [notification.id]: notification,
        },
      };
    }),
}));

export function notificationList(
  notifications: Record<string, GameNotification>,
  notificationClass?: NotificationClass
): GameNotification[] {
  return Object.values(notifications)
    .filter(
      (notification) =>
        (!notificationClass || notification.notificationClass === notificationClass) &&
        typeof notification.href === 'string' &&
        notification.href.trim().length > 0
    )
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}

export function attentionBadge(
  notifications: Record<string, GameNotification>,
  destination?: NotificationDestination
): { kind: NotificationBadgeKind; count?: number } {
  const matching = notificationList(notifications, 'attention').filter(
    (notification) =>
      destination === undefined || destinationMatches(notification.destination, destination)
  );
  if (matching.length === 0) return { kind: 'hidden' };
  const numericCount = matching.reduce(
    (sum, notification) =>
      sum + (notification.badgeKind === 'numeric' ? normalizeCount(notification.count) : 0),
    0
  );
  if (numericCount > 0) {
    const exclamationCount = matching.filter(
      (notification) => notification.badgeKind === 'exclamation'
    ).length;
    return { kind: 'numeric', count: numericCount + exclamationCount };
  }
  // An `action` row that asked to be quiet stays quiet on the rail as well as
  // in the bell (PEO §5: "no pulsing global badge for optional learning; one
  // destination dot is enough"). Until now `badgeKind: 'dot'` was honoured
  // only by the notification list, so the curriculum invitation and the clan
  // reveal — the two rows the constraint was written for — still put an
  // exclamation on a nav node. One loud item among quiet ones still shouts:
  // the badge is only a dot when nothing under it is asking for more.
  return matching.every((notification) => notification.badgeKind === 'dot')
    ? { kind: 'dot' }
    : { kind: 'exclamation' };
}

export function destinationBadge(
  notifications: Record<string, GameNotification>,
  destination: NotificationDestination
): { kind: NotificationBadgeKind; count?: number } {
  const attention = attentionBadge(notifications, destination);
  if (attention.kind !== 'hidden') return attention;
  return notificationList(notifications, 'recognition').some(
    (notification) => destinationMatches(notification.destination, destination)
  )
    ? { kind: 'dot' }
    : { kind: 'hidden' };
}

/** Newest exact recognition target for a rail/surface destination family. */
export function recognitionHref(
  notifications: Record<string, GameNotification>,
  destination: NotificationDestination
): string | null {
  return notificationList(notifications, 'recognition').find(
    (notification) => destinationMatches(notification.destination, destination)
  )?.href ?? null;
}

/**
 * Where a quietly marked rail destination should actually go (WP-E, G9).
 *
 * A DOT MEANS "THE THING IS OVER HERE", AND IT HAS TO BE TRUE.
 *
 * The Compete node carries `notificationDestination: 'clan'` but links to
 * `/leaderboard` (`Navigation.tsx`), because a clan family and a leaderboard
 * share one nav slot. Before this, only RECOGNITION dots redirected the node
 * at what they marked; a quiet `action` dot — which is what the clan reveal
 * and the curriculum invitation are — left the node pointing at its default,
 * so following a clan mark opened a leaderboard. PEO §6 step 2 rules that out
 * by name, and §6 promises a declining player "a quiet clan destination
 * marker", which is only a marker if it leads to the destination.
 *
 * Attention wins over recognition because an action is something the player
 * still has to answer; both are newest-first, and the fallback is the node's
 * own href, so a destination with nothing open is unchanged.
 */
export function markedDestinationHref(
  notifications: Record<string, GameNotification>,
  destination: NotificationDestination
): string | null {
  const marked =
    notificationList(notifications, 'attention').find((notification) =>
      destinationMatches(notification.destination, destination)
    ) ?? null;
  return marked?.href ?? recognitionHref(notifications, destination);
}

function destinationMatches(
  itemDestination: NotificationDestination,
  surfaceDestination: NotificationDestination
): boolean {
  if (itemDestination === surfaceDestination) return true;
  const families: Partial<Record<NotificationDestination, NotificationDestination[]>> = {
    lab: ['lab', 'lineage', 'codex'],
    identity: ['identity', 'chronicle', 'mastery', 'records'],
    chronicle: ['identity', 'chronicle', 'mastery', 'records'],
    home: ['home', 'signal'],
  };
  return families[surfaceDestination]?.includes(itemDestination) ?? false;
}

export async function transitionServerNotification(
  id: string,
  transition: NotificationTransition,
  token: string,
  fetchFn: typeof fetch = fetch
): Promise<ServerAttentionItem> {
  const response = await fetchFn('/api/progression/attention', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id, transition }),
  });
  if (!response.ok) {
    throw new Error(`Attention transition failed (${response.status})`);
  }
  const body = await response.json();
  const item = parseServerAttentionItem(body?.item);
  if (!item) throw new Error('Attention transition returned an invalid item');
  useNotificationStore.getState().applyServerItem(item);
  return item;
}

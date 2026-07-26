/**
 * The install offer — OFFERED, NEVER NAGGED (Constitution §11.4, Rule 1, Rule 5).
 *
 * An installable web game has one classic failure mode, and it is not a
 * technical one: the interstitial that covers the page on the first visit,
 * before the visitor knows what the product is, and again on the second visit
 * because the dismissal was only remembered for a session. §11.4's whole point
 * is that the web removes friction; an install nag puts it back.
 *
 * So the offer is expressed here as a predicate with five independent gates,
 * every one of which must pass. There is no "show anyway" branch, no timer
 * that re-arms a dismissal, and no counter that resets.
 *
 *   1. RULE 1 — RUN SANCTITY. Two locks, deliberately redundant.
 *      `runActive` is the live game store; `isCalmSurface` is a route
 *      ALLOWLIST. A surface that is not named calm cannot show the offer even
 *      if the store is somehow wrong, and `/game` and `/training` are not on
 *      the list and can never be added — `installPrompt.test.ts` asserts their
 *      absence by name. A run is never interrupted by a card about a shortcut.
 *
 *   2. THE PLAYER HAS ACTUALLY PLAYED. The offer needs somebody with a reason
 *      to want it, so it waits for a completed run. A stranger who bounces off
 *      the landing page is never asked to install anything.
 *
 *   3. THE BROWSER SAYS IT IS INSTALLABLE. `beforeinstallprompt` must have
 *      fired and been captured. Nothing is invented: browsers that do not
 *      support installation (every current iOS Safari, notably) simply never
 *      see the card, rather than being shown manual instructions they did not
 *      ask for.
 *
 *   4. NOT ALREADY INSTALLED. `display-mode: standalone` means the player is
 *      reading this INSIDE the installed app.
 *
 *   5. A DISMISSAL IS FOREVER. `dismissedAt` is written on the first "Not
 *      now" and is never cleared by this module — there is no code path that
 *      sets it back to null. Beyond that, a player who neither dismisses nor
 *      installs sees the card at most `MAX_LIFETIME_OFFERS` times, ever, and
 *      at most once per page session.
 *
 * RULE 5 — the copy that surrounds this predicate must not imply that
 * declining costs anything, because it costs exactly nothing: the installed
 * app and the browser tab are the same game against the same server state.
 *
 * WHERE THE RECORD LIVES
 *
 *   `localStorage`, and that is not a violation of the "no game progress in
 *   localStorage" rule. Nothing here is progress: it is a UI preference about
 *   this browser, on the device the shortcut would be installed onto, and it
 *   is worthless on any other device. Losing it costs a player nothing; moving
 *   it to the server would mean writing a row for every anonymous visitor.
 *
 *   Every read is defensive. A corrupt, hand-edited or half-written value
 *   degrades to "already dismissed" — the quiet direction — never to "show it
 *   again".
 */

export interface InstallRecord {
  /** Runs finished in this browser. Gate 2 needs at least one. */
  runsCompleted: number;
  /** Times the card has been shown, ever. Capped by MAX_LIFETIME_OFFERS. */
  offers: number;
  /** ISO timestamp of the first dismissal. Once set, never cleared. */
  dismissedAt: string | null;
  /** ISO timestamp of an accepted install. Also permanently silencing. */
  installedAt: string | null;
}

export const INSTALL_RECORD_KEY = 'supasnake.pwa.install.v1';

/** The offer waits for evidence that the player plays. */
export const MIN_RUNS_BEFORE_OFFER = 1;

/**
 * The hard ceiling on how many times a player who simply ignores the card can
 * ever see it. Three, across the entire lifetime of the browser profile — not
 * three per week, not three per month.
 */
export const MAX_LIFETIME_OFFERS = 3;

export const EMPTY_INSTALL_RECORD: InstallRecord = {
  runsCompleted: 0,
  offers: 0,
  dismissedAt: null,
  installedAt: null,
};

/**
 * The surfaces where an offer may appear, as an ALLOWLIST of path prefixes.
 *
 * `/game` and `/training` are absent and must stay absent (Rule 1). So is
 * `/shop` — Rule 7 keeps commerce in its own district, and an install card
 * next to a price is exactly the association Rule 7 exists to prevent.
 */
export const CALM_SURFACES: readonly string[] = [
  '/',
  '/lab',
  '/leaderboard',
  '/serpent',
  '/clan',
  '/codex',
  '/stats',
  '/profile',
  '/settings',
];

/** Surfaces a run can be live on. Named so a test can assert they are excluded. */
export const RUN_SURFACES: readonly string[] = ['/game', '/training'];

/**
 * Allowlist membership by exact match or path segment prefix, so `/lab/breed`
 * is calm and `/labyrinth` — were it ever to exist — is not.
 */
export function isCalmSurface(pathname: string): boolean {
  if (!pathname) return false;
  const path = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
  return CALM_SURFACES.some(
    (surface) =>
      surface === '/' ? path === '/' : path === surface || path.startsWith(`${surface}/`)
  );
}

export interface InstallEligibility {
  /** `PWA_V1_ENABLED`. Off means no offer, whatever else is true. */
  flagEnabled: boolean;
  pathname: string;
  /** The live game store: a run is in progress (playing, paused or dying). */
  runActive: boolean;
  /** A `beforeinstallprompt` event has been captured and not yet consumed. */
  promptAvailable: boolean;
  /** `matchMedia('(display-mode: standalone)')` — already installed. */
  displayStandalone: boolean;
  record: InstallRecord;
  /** Times the card has already been shown in THIS page session. */
  offersThisSession: number;
}

/**
 * The single question the UI asks. Every gate is an AND; the order is chosen
 * so the cheapest and most important checks (flag, then Rule 1) come first.
 */
export function canOfferInstall(input: InstallEligibility): boolean {
  if (!input.flagEnabled) return false;

  // Rule 1, both locks.
  if (input.runActive) return false;
  if (!isCalmSurface(input.pathname)) return false;

  if (!input.promptAvailable) return false;
  if (input.displayStandalone) return false;

  const { record } = input;
  if (record.installedAt) return false;
  if (record.dismissedAt) return false;
  if (record.runsCompleted < MIN_RUNS_BEFORE_OFFER) return false;
  if (record.offers >= MAX_LIFETIME_OFFERS) return false;
  if (input.offersThisSession > 0) return false;

  return true;
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/** The subset of the Storage API this module uses; keeps tests honest. */
export interface RecordStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function coerceCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function coerceTimestamp(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Read the record, degrading to "already dismissed" on anything unreadable.
 *
 * That default is deliberate and is the opposite of what a naive `catch`
 * would do. If storage is unavailable or the value is corrupt we cannot know
 * whether this player already said no, and the only answer that can never
 * annoy somebody is to assume they did.
 */
export function readInstallRecord(storage: RecordStorage | null | undefined): InstallRecord {
  if (!storage) return { ...EMPTY_INSTALL_RECORD, dismissedAt: 'unavailable' };

  let raw: string | null;
  try {
    raw = storage.getItem(INSTALL_RECORD_KEY);
  } catch {
    return { ...EMPTY_INSTALL_RECORD, dismissedAt: 'unavailable' };
  }

  if (raw === null) return { ...EMPTY_INSTALL_RECORD };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return { ...EMPTY_INSTALL_RECORD, dismissedAt: 'unreadable' };
    }
    return {
      runsCompleted: coerceCount(parsed.runsCompleted),
      offers: coerceCount(parsed.offers),
      dismissedAt: coerceTimestamp(parsed.dismissedAt),
      installedAt: coerceTimestamp(parsed.installedAt),
    };
  } catch {
    return { ...EMPTY_INSTALL_RECORD, dismissedAt: 'unreadable' };
  }
}

/** Persist, swallowing quota/privacy-mode failures — never throw at a player. */
export function writeInstallRecord(
  storage: RecordStorage | null | undefined,
  record: InstallRecord
): void {
  if (!storage) return;
  try {
    storage.setItem(INSTALL_RECORD_KEY, JSON.stringify(record));
  } catch {
    /* Private mode or a full quota. The offer degrades to silence. */
  }
}

function mutate(
  storage: RecordStorage | null | undefined,
  change: (record: InstallRecord) => InstallRecord
): InstallRecord {
  const next = change(readInstallRecord(storage));
  writeInstallRecord(storage, next);
  return next;
}

export function recordRunCompleted(storage: RecordStorage | null | undefined): InstallRecord {
  return mutate(storage, (record) => ({ ...record, runsCompleted: record.runsCompleted + 1 }));
}

export function recordOfferShown(storage: RecordStorage | null | undefined): InstallRecord {
  return mutate(storage, (record) => ({ ...record, offers: record.offers + 1 }));
}

/**
 * "Not now", permanently. There is no companion function that clears
 * `dismissedAt`, and adding one would defeat the only promise this module
 * makes.
 */
export function recordDismissal(
  storage: RecordStorage | null | undefined,
  now: Date = new Date()
): InstallRecord {
  return mutate(storage, (record) => ({
    ...record,
    dismissedAt: record.dismissedAt ?? now.toISOString(),
  }));
}

export function recordInstalled(
  storage: RecordStorage | null | undefined,
  now: Date = new Date()
): InstallRecord {
  return mutate(storage, (record) => ({
    ...record,
    installedAt: record.installedAt ?? now.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * The card's words, exported so the Rule 5 / Rule 7 sweeps in
 * `installPrompt.test.ts` read exactly what a player reads.
 *
 * The framing is a convenience, stated plainly, with the cost of declining
 * given explicitly ("nothing changes"). No urgency, no scarcity, no
 * suggestion that the browser version is lesser.
 */
export const INSTALL_COPY = {
  title: 'Add SupaSnake to your home screen',
  body: 'Opens in its own window, straight to the arena. Same account, same runs — nothing changes if you skip it.',
  accept: 'Add it',
  dismiss: 'Not now',
} as const;

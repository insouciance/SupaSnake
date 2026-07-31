/**
 * UTM + referrer capture (Constitution §11.4, §11.5).
 *
 * "Attribution before the first campus, or campus results can't be read."
 * This module answers exactly one question — which channel did this visitor
 * arrive from — and it answers it under four self-imposed limits:
 *
 * 1. **Consent first.** The cookie banner already offers a `marketing`
 *    category, described to the player as "Track where players come from to
 *    improve our advertising". Persisting attribution IS that processing, so
 *    nothing is written unless `marketing` consent is granted. Without it the
 *    funnel simply reports `direct`, and no storage entry is created.
 * 2. **Session-scoped storage.** sessionStorage, not localStorage or a
 *    cookie: it survives the auth round-trip (OAuth redirect and back in the
 *    same tab, which is the case that matters) and expires with the tab.
 *    A confirmation link opened in a *new* tab loses attribution — accepted,
 *    because the alternative is a long-lived cross-session identifier.
 * 3. **First touch wins.** The first channel of the session is the one
 *    credited; later internal navigations never overwrite it.
 * 4. **No new personal data.** Campaign labels and the referrer's *host*
 *    only — never the full referring URL, never a query string, never an IP.
 *    Values are length-clamped and stripped of control characters.
 */

/** sessionStorage slot. Listed in the cookie policy inventory. */
export const ATTRIBUTION_STORAGE_KEY = 'supasnake-attribution';

/** Shared with ConsentBanner / AnalyticsProvider (same duplication precedent). */
const CONSENT_KEY = 'cookie-consent';

/** Longest value we keep for any single attribution field. */
const MAX_VALUE_LENGTH = 96;

export interface Attribution {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  /** Host only, e.g. `news.ycombinator.com`. Never the full URL. */
  referrerHost: string | null;
  /** Path the visitor landed on, without query or hash. */
  landingPath: string;
  capturedAt: string;
}

/** Whether the visitor granted the banner's `marketing` category. */
export function marketingConsentGranted(
  read: () => string | null = defaultConsentReader
): boolean {
  let raw: string | null = null;
  try {
    raw = read();
  } catch {
    return false;
  }
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { marketing?: unknown };
    return parsed?.marketing === true;
  } catch {
    return false;
  }
}

function defaultConsentReader(): string | null {
  if (typeof window === 'undefined') return null;
  // constitution-allow: local-progress  legal marketing consent contains no gameplay or progression fact
  return window.localStorage.getItem(CONSENT_KEY);
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const stripped = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!stripped) return null;
  return stripped.slice(0, MAX_VALUE_LENGTH);
}

function referrerHostOf(referrer: string | null | undefined, selfHost: string): string | null {
  const value = clean(referrer ?? null);
  if (!value) return null;
  try {
    const host = new URL(value).host.toLowerCase();
    // An internal navigation is not a channel.
    if (!host || host === selfHost.toLowerCase()) return null;
    return host.slice(0, MAX_VALUE_LENGTH);
  } catch {
    return null;
  }
}

/**
 * Derive an Attribution from a landing URL and a document referrer.
 * Returns null when the visit carries no channel signal at all — a direct
 * arrival needs no stored row.
 */
export function parseAttribution(
  landingUrl: string,
  referrer: string | null | undefined,
  now: Date = new Date()
): Attribution | null {
  let url: URL;
  try {
    url = new URL(landingUrl);
  } catch {
    return null;
  }

  const params = url.searchParams;
  const source = clean(params.get('utm_source'));
  const medium = clean(params.get('utm_medium'));
  const campaign = clean(params.get('utm_campaign'));
  const content = clean(params.get('utm_content'));
  const term = clean(params.get('utm_term'));
  const referrerHost = referrerHostOf(referrer, url.host);

  if (!source && !medium && !campaign && !content && !term && !referrerHost) {
    return null;
  }

  return {
    source,
    medium,
    campaign,
    content,
    term,
    referrerHost,
    landingPath: url.pathname || '/',
    capturedAt: now.toISOString(),
  };
}

function sessionStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    // constitution-allow: local-progress  acquisition labels contain campaign data only, never player progress
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Read the session's stored attribution, if any. */
export function readAttribution(): Attribution | null {
  const store = sessionStore();
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Attribution;
    if (!parsed || typeof parsed.landingPath !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Remove the stored attribution (consent withdrawal, or after account attach). */
export function clearAttribution(): void {
  const store = sessionStore();
  if (!store) return;
  try {
    store.removeItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    // A browser that refuses the write also refuses the read.
  }
}

/**
 * Capture the current landing context. No-op without marketing consent;
 * first touch wins for the rest of the session.
 *
 * Returns the attribution now in force (stored or pre-existing), or null.
 */
export function captureAttribution(options?: {
  landingUrl?: string;
  referrer?: string | null;
  now?: Date;
}): Attribution | null {
  if (typeof window === 'undefined') return null;
  if (!marketingConsentGranted()) return null;

  const existing = readAttribution();
  if (existing) return existing;

  const attribution = parseAttribution(
    options?.landingUrl ?? window.location.href,
    options?.referrer ?? document.referrer,
    options?.now ?? new Date()
  );
  if (!attribution) return null;

  const store = sessionStore();
  if (store) {
    try {
      store.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
    } catch {
      // Storage-restricted browsers still report the channel on this page.
    }
  }
  return attribution;
}

/**
 * Flatten attribution into analytics properties. Always returns a `channel`
 * so every funnel event is groupable, including unattributed direct visits.
 */
export function attributionProperties(
  attribution: Attribution | null
): Record<string, string> {
  const properties: Record<string, string> = {
    channel: channelOf(attribution),
  };
  if (!attribution) return properties;
  if (attribution.source) properties.utm_source = attribution.source;
  if (attribution.medium) properties.utm_medium = attribution.medium;
  if (attribution.campaign) properties.utm_campaign = attribution.campaign;
  if (attribution.content) properties.utm_content = attribution.content;
  if (attribution.term) properties.utm_term = attribution.term;
  if (attribution.referrerHost) properties.referrer_host = attribution.referrerHost;
  properties.landing_path = attribution.landingPath;
  return properties;
}

/**
 * The single label the weekly funnel review reads (§11.8): the campaign
 * source when one was tagged, else the referring host, else `direct`.
 */
export function channelOf(attribution: Attribution | null): string {
  if (!attribution) return 'direct';
  return attribution.source ?? attribution.referrerHost ?? 'direct';
}

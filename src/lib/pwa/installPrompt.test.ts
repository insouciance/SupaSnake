/**
 * The install offer is offered, never nagged — and a dismissal is forever
 * (Constitution §11.4, Rule 1, Rule 5).
 */

import {
  CALM_SURFACES,
  EMPTY_INSTALL_RECORD,
  INSTALL_COPY,
  INSTALL_RECORD_KEY,
  MAX_LIFETIME_OFFERS,
  RUN_SURFACES,
  canOfferInstall,
  isCalmSurface,
  readInstallRecord,
  recordDismissal,
  recordInstalled,
  recordOfferShown,
  recordRunCompleted,
  type InstallEligibility,
  type InstallRecord,
  type RecordStorage,
} from '@/lib/pwa/installPrompt';
import { sweepMessage } from '@/lib/growth/commercialLanguage';
import { sweepForLoss } from '@/lib/growth/lossLanguage';

function memoryStorage(initial: Record<string, string> = {}): RecordStorage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

/** A player who has earned the offer: played, never dismissed, on the home page. */
function eligible(overrides: Partial<InstallEligibility> = {}): InstallEligibility {
  return {
    flagEnabled: true,
    pathname: '/',
    runActive: false,
    promptAvailable: true,
    displayStandalone: false,
    record: { ...EMPTY_INSTALL_RECORD, runsCompleted: 3 },
    offersThisSession: 0,
    ...overrides,
  };
}

describe('canOfferInstall', () => {
  it('offers to a player who has played, on a calm surface', () => {
    expect(canOfferInstall(eligible())).toBe(true);
  });

  describe('Rule 1 — run sanctity', () => {
    it('never offers while a run is live', () => {
      expect(canOfferInstall(eligible({ runActive: true }))).toBe(false);
    });

    it('never offers on a run surface, even if the store says no run is live', () => {
      for (const surface of RUN_SURFACES) {
        expect(canOfferInstall(eligible({ pathname: surface, runActive: false }))).toBe(false);
        expect(canOfferInstall(eligible({ pathname: `${surface}/anything`, runActive: false }))).toBe(
          false
        );
      }
    });

    it('the calm allowlist contains no run surface — asserted by name', () => {
      for (const surface of RUN_SURFACES) {
        expect(CALM_SURFACES).not.toContain(surface);
        expect(CALM_SURFACES.some((calm) => surface.startsWith(calm) && calm !== '/')).toBe(false);
      }
      expect(CALM_SURFACES).not.toContain('/game');
      expect(CALM_SURFACES).not.toContain('/training');
    });

    it('an unknown surface is not calm — the list is an allowlist, not a blocklist', () => {
      expect(isCalmSurface('/some/route/invented/next/year')).toBe(false);
      expect(canOfferInstall(eligible({ pathname: '/shop' }))).toBe(false);
    });

    it('matches whole path segments only', () => {
      expect(isCalmSurface('/lab')).toBe(true);
      expect(isCalmSurface('/lab/breed')).toBe(true);
      expect(isCalmSurface('/labyrinth')).toBe(false);
      expect(isCalmSurface('/')).toBe(true);
      expect(isCalmSurface('/settings/')).toBe(true);
      expect(isCalmSurface('')).toBe(false);
    });
  });

  describe('the other gates', () => {
    it('is silent when the flag is off', () => {
      expect(canOfferInstall(eligible({ flagEnabled: false }))).toBe(false);
    });

    it('waits for a completed run — a bouncing stranger is never asked', () => {
      expect(
        canOfferInstall(eligible({ record: { ...EMPTY_INSTALL_RECORD, runsCompleted: 0 } }))
      ).toBe(false);
    });

    it('needs the browser to say it is installable', () => {
      expect(canOfferInstall(eligible({ promptAvailable: false }))).toBe(false);
    });

    it('never offers inside the installed app', () => {
      expect(canOfferInstall(eligible({ displayStandalone: true }))).toBe(false);
    });

    it('shows at most once per page session', () => {
      expect(canOfferInstall(eligible({ offersThisSession: 1 }))).toBe(false);
    });

    it('stops forever after MAX_LIFETIME_OFFERS, even without a dismissal', () => {
      const record = { ...EMPTY_INSTALL_RECORD, runsCompleted: 50, offers: MAX_LIFETIME_OFFERS };
      expect(canOfferInstall(eligible({ record }))).toBe(false);
      expect(MAX_LIFETIME_OFFERS).toBeLessThanOrEqual(3);
    });

    it('never offers again once installed', () => {
      const record: InstallRecord = {
        ...EMPTY_INSTALL_RECORD,
        runsCompleted: 5,
        installedAt: '2026-07-25T00:00:00.000Z',
      };
      expect(canOfferInstall(eligible({ record }))).toBe(false);
    });
  });
});

describe('a dismissal stays dismissed', () => {
  it('is refused immediately after the dismissal is recorded', () => {
    const storage = memoryStorage();
    recordRunCompleted(storage);
    expect(canOfferInstall(eligible({ record: readInstallRecord(storage) }))).toBe(true);

    recordDismissal(storage);
    expect(canOfferInstall(eligible({ record: readInstallRecord(storage) }))).toBe(false);
  });

  it('survives reload, more runs, and every calm surface', () => {
    const storage = memoryStorage();
    recordRunCompleted(storage);
    recordOfferShown(storage);
    recordDismissal(storage, new Date('2026-07-25T10:00:00.000Z'));

    // "Reload": a brand-new reader over the same persisted bytes.
    for (let i = 0; i < 25; i += 1) recordRunCompleted(storage);

    const record = readInstallRecord(storage);
    expect(record.dismissedAt).toBe('2026-07-25T10:00:00.000Z');
    expect(record.runsCompleted).toBe(26);

    for (const surface of CALM_SURFACES) {
      expect(canOfferInstall(eligible({ pathname: surface, record, offersThisSession: 0 }))).toBe(
        false
      );
    }
  });

  it('a later dismissal never overwrites the first timestamp', () => {
    const storage = memoryStorage();
    recordDismissal(storage, new Date('2026-01-01T00:00:00.000Z'));
    recordDismissal(storage, new Date('2026-06-01T00:00:00.000Z'));
    expect(readInstallRecord(storage).dismissedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('no exported function can clear a dismissal', () => {
    const storage = memoryStorage();
    recordDismissal(storage);
    recordRunCompleted(storage);
    recordOfferShown(storage);
    recordInstalled(storage);
    expect(readInstallRecord(storage).dismissedAt).not.toBeNull();
  });
});

describe('reading the record', () => {
  it('starts empty when nothing is stored', () => {
    expect(readInstallRecord(memoryStorage())).toEqual(EMPTY_INSTALL_RECORD);
  });

  it('degrades to "dismissed" — the quiet direction — when storage is absent', () => {
    expect(readInstallRecord(null).dismissedAt).not.toBeNull();
    expect(canOfferInstall(eligible({ record: readInstallRecord(null) }))).toBe(false);
  });

  it('degrades to "dismissed" on corrupt JSON rather than re-offering', () => {
    const record = readInstallRecord(memoryStorage({ [INSTALL_RECORD_KEY]: '{not json' }));
    expect(record.dismissedAt).not.toBeNull();
  });

  it('degrades to "dismissed" when getItem throws', () => {
    const hostile: RecordStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
    };
    expect(readInstallRecord(hostile).dismissedAt).not.toBeNull();
  });

  it('sanitises hand-edited values instead of trusting them', () => {
    const record = readInstallRecord(
      memoryStorage({
        [INSTALL_RECORD_KEY]: JSON.stringify({
          runsCompleted: -5,
          offers: 'lots',
          dismissedAt: 0,
          installedAt: {},
        }),
      })
    );
    expect(record).toEqual(EMPTY_INSTALL_RECORD);
  });

  it('a write that throws never reaches the player', () => {
    const hostile: RecordStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => recordDismissal(hostile)).not.toThrow();
  });
});

describe('the copy', () => {
  const prose = { title: INSTALL_COPY.title, body: INSTALL_COPY.body };

  it('sells nothing — Rule 7', () => {
    expect(sweepMessage(prose)).toEqual([]);
  });

  it('guilts nobody and implies no decay — Rule 5', () => {
    expect(sweepForLoss(prose)).toEqual([]);
  });

  it('states plainly that declining costs nothing', () => {
    expect(INSTALL_COPY.body.toLowerCase()).toContain('nothing changes');
  });

  it('gives the dismissal a real, named control', () => {
    expect(INSTALL_COPY.dismiss.trim().length).toBeGreaterThan(0);
    expect(INSTALL_COPY.dismiss.toLowerCase()).not.toContain('maybe later');
  });
});

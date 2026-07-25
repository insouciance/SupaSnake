import {
  CONFIRMATION_COOLDOWN_MS,
  CONFIRMATION_TTL_MS,
  confirmationExpiry,
  createToken,
  decideConfirm,
  decideSubscribe,
  hashToken,
  isMailable,
  isWellFormedToken,
  normalizeEmail,
  type WaitlistRow,
} from './dispatchWaitlist';

const NOW = new Date('2026-07-25T12:00:00.000Z');

function row(overrides: Partial<WaitlistRow> = {}): WaitlistRow {
  return {
    id: 'row-1',
    email: 'player@example.com',
    status: 'pending',
    confirmationSentAt: NOW.toISOString(),
    confirmationExpiresAt: new Date(NOW.getTime() + CONFIRMATION_TTL_MS).toISOString(),
    confirmedAt: null,
    unsubscribedAt: null,
    ...overrides,
  };
}

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Player@Example.COM ')).toBe('player@example.com');
  });

  it('rejects non-strings, empties and malformed addresses', () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('nope')).toBeNull();
    expect(normalizeEmail('no@domain')).toBeNull();
    expect(normalizeEmail('two@@example.com')).toBeNull();
    expect(normalizeEmail('spa ce@example.com')).toBeNull();
  });

  it('rejects addresses beyond the storage bound', () => {
    expect(normalizeEmail(`${'a'.repeat(250)}@example.com`)).toBeNull();
  });
});

describe('tokens', () => {
  it('mints distinct URL-safe tokens', () => {
    const a = createToken();
    const b = createToken();
    expect(a).not.toBe(b);
    expect(isWellFormedToken(a)).toBe(true);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashes to a stable 64-character hex digest', () => {
    const digest = hashToken('token');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('token')).toBe(digest);
    expect(hashToken('token ')).not.toBe(digest);
  });

  it('rejects junk that must never reach a query', () => {
    expect(isWellFormedToken('')).toBe(false);
    expect(isWellFormedToken('short')).toBe(false);
    expect(isWellFormedToken(null)).toBe(false);
    expect(isWellFormedToken(`${'a'.repeat(20)}'; DROP TABLE--`)).toBe(false);
  });
});

describe('decideSubscribe', () => {
  it('creates a row for an unknown address', () => {
    expect(decideSubscribe(null, NOW)).toBe('create');
  });

  it('changes nothing for an address that is already confirmed', () => {
    expect(
      decideSubscribe(
        row({ status: 'confirmed', confirmedAt: NOW.toISOString() }),
        NOW
      )
    ).toBe('already-confirmed');
  });

  it('throttles a second request inside the cooldown', () => {
    const justSent = row({ confirmationSentAt: NOW.toISOString() });
    const soon = new Date(NOW.getTime() + CONFIRMATION_COOLDOWN_MS - 1);
    expect(decideSubscribe(justSent, soon)).toBe('throttled');
  });

  it('re-issues once the cooldown has passed', () => {
    const justSent = row({ confirmationSentAt: NOW.toISOString() });
    const later = new Date(NOW.getTime() + CONFIRMATION_COOLDOWN_MS + 1);
    expect(decideSubscribe(justSent, later)).toBe('reissue');
  });

  it('re-issues for an unsubscribed address — consent must be given again', () => {
    const gone = row({
      status: 'unsubscribed',
      unsubscribedAt: NOW.toISOString(),
      confirmationSentAt: null,
      confirmationExpiresAt: null,
    });
    expect(decideSubscribe(gone, NOW)).toBe('reissue');
  });

  it('re-issues when the send timestamp is missing or unparseable', () => {
    expect(decideSubscribe(row({ confirmationSentAt: null }), NOW)).toBe('reissue');
    expect(decideSubscribe(row({ confirmationSentAt: 'nonsense' }), NOW)).toBe(
      'reissue'
    );
  });
});

describe('decideConfirm', () => {
  it('confirms a pending row with an unexpired token', () => {
    expect(decideConfirm(row(), NOW)).toBe('confirmed');
  });

  it('reports an expired token rather than confirming it', () => {
    const expired = row({
      confirmationExpiresAt: new Date(NOW.getTime() - 1).toISOString(),
    });
    expect(decideConfirm(expired, NOW)).toBe('expired');
  });

  it('treats a missing row as invalid', () => {
    expect(decideConfirm(null, NOW)).toBe('invalid');
  });

  it('never promotes an unsubscribed row', () => {
    const gone = row({
      status: 'unsubscribed',
      unsubscribedAt: NOW.toISOString(),
      confirmationExpiresAt: null,
    });
    expect(decideConfirm(gone, NOW)).toBe('invalid');
  });

  it('is idempotent for an already-confirmed row', () => {
    expect(
      decideConfirm(row({ status: 'confirmed', confirmedAt: NOW.toISOString() }), NOW)
    ).toBe('already-confirmed');
  });

  it('refuses a pending row with no expiry recorded', () => {
    expect(decideConfirm(row({ confirmationExpiresAt: null }), NOW)).toBe('invalid');
  });
});

describe('isMailable — the double-opt-in gate', () => {
  it('is false for a pending row, whatever else it carries', () => {
    expect(isMailable(row())).toBe(false);
    expect(isMailable(row({ confirmedAt: NOW.toISOString() }))).toBe(false);
  });

  it('is false for a confirmed status with no confirmation timestamp', () => {
    // A half-written row must never be treated as confirmed.
    expect(isMailable(row({ status: 'confirmed', confirmedAt: null }))).toBe(false);
  });

  it('is false for an unsubscribed row', () => {
    expect(
      isMailable(
        row({ status: 'unsubscribed', unsubscribedAt: NOW.toISOString() })
      )
    ).toBe(false);
  });

  it('is false for nothing at all', () => {
    expect(isMailable(null)).toBe(false);
    expect(isMailable(undefined)).toBe(false);
  });

  it('is true only for a confirmed row with its timestamp', () => {
    expect(
      isMailable(row({ status: 'confirmed', confirmedAt: NOW.toISOString() }))
    ).toBe(true);
  });
});

describe('confirmationExpiry', () => {
  it('is the configured TTL after now', () => {
    expect(confirmationExpiry(NOW)).toBe(
      new Date(NOW.getTime() + CONFIRMATION_TTL_MS).toISOString()
    );
  });
});

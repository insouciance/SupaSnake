/**
 * Central legal/company configuration — single source of truth for every
 * legal page, consent surface, and disclosure in the app.
 *
 * Nullable statutory disclosures render a visible "to be completed" marker,
 * so any future missing register data cannot ship silently.
 */

export const LEGAL_ENTITY = {
  /** Registered company name incl. legal form suffix */
  name: 'Insoucience Technologies GmbH',
  legalForm: 'Gesellschaft mit beschränkter Haftung (GmbH)',
  street: 'Modecenterstraße 20/1/410',
  postalCode: '1030',
  city: 'Vienna',
  cityDe: 'Wien',
  country: 'Austria',
  countryDe: 'Österreich',
  /** Corporate seat per Firmenbuch */
  seat: 'Vienna, Austria',
  /** FN + court — mandatory under §14 UGB / §5 ECG */
  commercialRegisterNumber: 'FN 672280y' as string | null,
  commercialRegisterCourt: 'Handelsgericht Wien',
  /** UID — mandatory in the Impressum if the company holds one (§5 ECG) */
  vatId: 'ATU82996527' as string | null,
  /** §25 MedienG requires disclosing management for a "große Website" */
  managingDirectors: 'Josef Willy Pepe Bell' as string | null,
  /** WKO membership is mandatory for Austrian GmbHs; verify Fachgruppe */
  chamberMembership:
    'Wirtschaftskammer Wien (Austrian Economic Chamber, Vienna)',
  supervisoryAuthority:
    'Magistratisches Bezirksamt für den 3. Bezirk, Vienna (trade authority)',
  businessPurpose:
    'Development and operation of software and online games (IT services)',
} as const;

export const LEGAL_CONTACT = {
  /**
   * Electronic contact address required by §5 ECG — must be a real,
   * monitored mailbox and must be published (a contact form alone does
   * not satisfy §5 ECG). Every page reads this constant.
   */
  email: 'support@supasnake.com',
  /** Data protection contact (named Datenschutzbeauftragter) */
  dataProtectionOfficer: 'Josef Bell',
  dataProtectionEmail: 'support@supasnake.com',
  contactFormPath: '/contact',
} as const;

export const PRODUCT = {
  name: 'SupaSnake',
  url: 'https://supasnake.com',
  operator: LEGAL_ENTITY.name,
} as const;

/**
 * Austrian data protection authority — GDPR Art. 77 complaint venue,
 * disclosed in the privacy policy.
 */
export const DATA_PROTECTION_AUTHORITY = {
  name: 'Österreichische Datenschutzbehörde (Austrian Data Protection Authority)',
  street: 'Barichgasse 40–42',
  postalCode: '1030',
  city: 'Vienna',
  country: 'Austria',
  url: 'https://www.dsb.gv.at',
} as const;

/**
 * Minimum age: Austria set the GDPR Art. 8 digital consent age to 14
 * (§4 Abs 4 DSG). Terms eligibility and the age gate both use this.
 */
export const MINIMUM_AGE = 14;

/**
 * SupaSnake Premium subscription (migration 028) — legal parameters.
 *
 * The subscription is a recurring DIGITAL SERVICE (not one-off digital
 * content): checkout collects the §10 FAGG service-start consent
 * (withdrawal then owes pro-rata per §16 FAGG) plus an 18+
 * self-declaration (recurring billing is adults-only; MINIMUM_AGE governs
 * the game itself, not subscriptions).
 *
 * OPEN ITEMS for human legal review before launch:
 * - final 18+/parental-consent wording in terms §4a
 * - §312k BGB "Kündigungsbutton" if actively marketing to Germany
 *   (the Settings cancel button + Stripe portal are the current surface)
 */
export const SUBSCRIPTION = {
  minimumAge: 18,
  cancellationPath: '/settings',
  /** Withdrawal: §§10, 16 FAGG (digital service, pro-rata refund) */
  withdrawalRegime: 'digital_service_pro_rata',
} as const;

/**
 * Document versions (ISO dates). Bump when a document materially changes;
 * TERMS_VERSION is recorded with each account's acceptance.
 */
export const LEGAL_VERSIONS = {
  terms: '2026-07-22',
  // 2026-07-25: attribution (§3.6a) and the Dispatch list (§3.9) disclosed.
  privacy: '2026-07-25',
  cookies: '2026-07-25',
  impressum: '2026-07-22',
  withdrawal: '2026-07-22',
  accessibility: '2026-07-22',
} as const;

/** Formatted single-line postal address (English) */
export function formatAddress(): string {
  return `${LEGAL_ENTITY.street}, ${LEGAL_ENTITY.postalCode} ${LEGAL_ENTITY.city}, ${LEGAL_ENTITY.country}`;
}

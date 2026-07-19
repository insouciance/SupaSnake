/**
 * Central legal/company configuration — single source of truth for every
 * legal page, consent surface, and disclosure in the app.
 *
 * Fields typed `string | null` are statutory disclosures (ECG §5, UGB §14,
 * MedienG §25) whose values were not available at implementation time.
 * They MUST be filled in before public launch; pages render a visible
 * "to be completed" marker while they are null so the gap cannot ship
 * silently.
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
  commercialRegisterNumber: null as string | null,
  commercialRegisterCourt: 'Handelsgericht Wien',
  /** UID — mandatory in the Impressum if the company holds one (§5 ECG) */
  vatId: null as string | null,
  /** §25 MedienG requires disclosing management for a "große Website" */
  managingDirectors: null as string | null,
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
   * not satisfy §5 ECG). Swap for a role mailbox (e.g. contact@…) once
   * one exists; every page reads this constant.
   */
  email: 'bllj@proton.me',
  /** Data protection contact (named Datenschutzbeauftragter) */
  dataProtectionOfficer: 'Josef Bell',
  dataProtectionEmail: 'bllj@proton.me',
  contactFormPath: '/contact',
} as const;

export const PRODUCT = {
  name: 'SupaSnake',
  url: 'https://supasnake.vercel.app',
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
 * Document versions (ISO dates). Bump when a document materially changes;
 * TERMS_VERSION is recorded with each account's acceptance.
 */
export const LEGAL_VERSIONS = {
  terms: '2026-07-19',
  privacy: '2026-07-19',
  cookies: '2026-07-19',
  impressum: '2026-07-19',
  withdrawal: '2026-07-19',
  accessibility: '2026-07-19',
} as const;

/** Formatted single-line postal address (English) */
export function formatAddress(): string {
  return `${LEGAL_ENTITY.street}, ${LEGAL_ENTITY.postalCode} ${LEGAL_ENTITY.city}, ${LEGAL_ENTITY.country}`;
}

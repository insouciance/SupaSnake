import Link from 'next/link';
import {
  LEGAL_ENTITY,
  LEGAL_CONTACT,
  LEGAL_VERSIONS,
  PRODUCT,
} from '@/shared/config/legal';
import { LegalPageFooter } from '@/components/legal/LegalPageFooter';

export const metadata = {
  title: 'Impressum / Legal Notice | SupaSnake',
  description:
    'Impressum and statutory disclosures of Insoucience Technologies GmbH pursuant to §5 ECG, §14 UGB and §25 MedienG.',
};

/**
 * Row for a statutory disclosure. When `value` is null the value was not
 * available at implementation time — render an unmissable marker instead
 * of silently omitting a mandatory disclosure (§5 ECG / §14 UGB).
 */
function DisclosureRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4 py-2 border-b border-scale-blue-light/40 last:border-b-0">
      <dt className="sm:w-64 shrink-0 text-beige">{label}</dt>
      <dd>
        {value ?? (
          <span className="text-strike-red font-semibold">
            [To be completed before launch]
          </span>
        )}
      </dd>
    </div>
  );
}

export default function ImpressumPage() {
  return (
    <main className="min-h-screen bg-scale-blue-dark text-bone-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link
            href="/"
            className="text-beige hover:text-bone-white transition-colors font-body text-sm"
          >
            &larr; Back to Home
          </Link>
          <h1 className="text-4xl font-display uppercase tracking-arcade text-venom-orange mt-4">
            Impressum / Legal Notice
          </h1>
          <p className="text-beige font-body mt-2">
            Information pursuant to §5 E-Commerce-Gesetz (ECG), §14
            Unternehmensgesetzbuch (UGB) and §§24, 25 Mediengesetz (MedienG).
            Last updated: {LEGAL_VERSIONS.impressum}
          </p>
        </div>

        <div className="space-y-8 font-body text-bone-white/90">
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Service Provider / Diensteanbieter
            </h2>
            <dl>
              <DisclosureRow label="Company / Firma" value={LEGAL_ENTITY.name} />
              <DisclosureRow
                label="Legal form / Rechtsform"
                value={LEGAL_ENTITY.legalForm}
              />
              <DisclosureRow
                label="Registered seat / Sitz"
                value={`${LEGAL_ENTITY.cityDe}, ${LEGAL_ENTITY.countryDe}`}
              />
              <DisclosureRow
                label="Business address / Anschrift"
                value={`${LEGAL_ENTITY.street}, ${LEGAL_ENTITY.postalCode} ${LEGAL_ENTITY.cityDe}, ${LEGAL_ENTITY.countryDe}`}
              />
              <DisclosureRow
                label="Commercial register no. / Firmenbuchnummer"
                value={LEGAL_ENTITY.commercialRegisterNumber}
              />
              <DisclosureRow
                label="Register court / Firmenbuchgericht"
                value={LEGAL_ENTITY.commercialRegisterCourt}
              />
              <DisclosureRow label="VAT ID / UID-Nummer" value={LEGAL_ENTITY.vatId} />
              <DisclosureRow
                label="Managing director(s) / Geschäftsführung"
                value={LEGAL_ENTITY.managingDirectors}
              />
              <DisclosureRow
                label="Business purpose / Unternehmensgegenstand"
                value={LEGAL_ENTITY.businessPurpose}
              />
              <DisclosureRow
                label="Chamber membership / Kammerzugehörigkeit"
                value={LEGAL_ENTITY.chamberMembership}
              />
              <DisclosureRow
                label="Trade authority / Gewerbebehörde"
                value={LEGAL_ENTITY.supervisoryAuthority}
              />
              <DisclosureRow
                label="Applicable regulations / Anwendbare Vorschriften"
                value="Gewerbeordnung (GewO), E-Commerce-Gesetz (ECG), Mediengesetz (MedienG) — available at www.ris.bka.gv.at"
              />
            </dl>
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Contact / Kontakt
            </h2>
            <p className="mb-4">
              E-mail:{' '}
              <a
                href={`mailto:${LEGAL_CONTACT.email}`}
                className="text-venom-orange hover:underline"
              >
                {LEGAL_CONTACT.email}
              </a>
            </p>
            <p>
              You can also reach us via our{' '}
              <Link
                href={LEGAL_CONTACT.contactFormPath}
                className="text-venom-orange hover:underline"
              >
                contact form
              </Link>
              . We reply in English and German.
            </p>
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Disclosure pursuant to §25 MedienG / Offenlegung
            </h2>
            <p className="mb-4">
              Media owner (Medieninhaber): {LEGAL_ENTITY.name},{' '}
              {LEGAL_ENTITY.street}, {LEGAL_ENTITY.postalCode}{' '}
              {LEGAL_ENTITY.cityDe}, {LEGAL_ENTITY.countryDe}.
            </p>
            <p className="mb-4">
              Editorial direction (Blattlinie / grundlegende Richtung): this
              website provides information about, and access to, the online game{' '}
              {PRODUCT.name}, including account, community and shop features
              related to the game.
            </p>
            <p>
              Information on the ownership structure of the media owner is
              available from the commercial register (Firmenbuch) at the
              register court stated above.
            </p>
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Data protection contact / Datenschutz
            </h2>
            <p>
              Data protection contact (Datenschutzbeauftragter):{' '}
              {LEGAL_CONTACT.dataProtectionOfficer},{' '}
              <a
                href={`mailto:${LEGAL_CONTACT.dataProtectionEmail}`}
                className="text-venom-orange hover:underline"
              >
                {LEGAL_CONTACT.dataProtectionEmail}
              </a>
              . For details on how we process personal data, see our{' '}
              <Link href="/legal/privacy" className="text-venom-orange hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Point of contact under the Digital Services Act
            </h2>
            <p className="mb-4">
              Pursuant to Articles 11 and 12 of Regulation (EU) 2022/2065
              (Digital Services Act), our single point of contact for member
              state authorities, the European Commission, the European Board for
              Digital Services, and for recipients of the service is:
            </p>
            <p className="mb-4">
              E-mail:{' '}
              <a
                href={`mailto:${LEGAL_CONTACT.email}`}
                className="text-venom-orange hover:underline"
              >
                {LEGAL_CONTACT.email}
              </a>{' '}
              — or our{' '}
              <Link
                href={LEGAL_CONTACT.contactFormPath}
                className="text-venom-orange hover:underline"
              >
                contact form
              </Link>{' '}
              (category &quot;Report content&quot; for illegal-content notices).
            </p>
            <p>
              Communication is possible in German and English. This contact
              point is not limited to automated tools; messages are handled by a
              person.
            </p>
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Consumer dispute resolution / Verbraucherstreitbeilegung
            </h2>
            <p className="mb-4">
              We are not obliged and not willing to participate in dispute
              resolution proceedings before a consumer arbitration board
              (Verbraucherschlichtungsstelle) within the meaning of the
              Alternative-Streitbeilegung-Gesetz (AStG).
            </p>
            <p>
              The European Commission&apos;s online dispute resolution (ODR)
              platform was discontinued on 20 July 2025 and is no longer
              available. Please address complaints directly to us using the
              contact details above — we take every complaint seriously and aim
              to resolve issues directly.
            </p>
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Liability and copyright notice
            </h2>
            <p className="mb-4">
              Despite careful control of content, we assume no liability for the
              content of external links; the operators of linked pages are
              solely responsible for their content. If we become aware of
              unlawful content on linked external pages, we will remove the
              affected links without delay.
            </p>
            <p>
              All content of this website (graphics, audio, text, code, and the{' '}
              {PRODUCT.name} name and logo) is protected by copyright and other
              intellectual property rights of {LEGAL_ENTITY.name} or its
              licensors. Any use beyond the limits of copyright law requires our
              prior written consent.
            </p>
          </section>
        </div>

        <LegalPageFooter />
      </div>
    </main>
  );
}

import Link from 'next/link';
import {
  LEGAL_ENTITY,
  LEGAL_CONTACT,
  LEGAL_VERSIONS,
} from '@/shared/config/legal';
import { LegalPageFooter } from '@/components/legal/LegalPageFooter';

export const metadata = {
  title: 'Right of Withdrawal | SupaSnake',
  description:
    'Withdrawal notice (Widerrufsbelehrung) and model withdrawal form pursuant to the Austrian FAGG for purchases in SupaSnake.',
};

export default function WithdrawalPage() {
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
            Right of Withdrawal
          </h1>
          <p className="text-beige font-body mt-2">
            Widerrufsbelehrung pursuant to the Fern- und
            Auswärtsgeschäfte-Gesetz (FAGG) · Last updated:{' '}
            {LEGAL_VERSIONS.withdrawal}
          </p>
        </div>

        <div className="space-y-8 font-body text-bone-white/90">
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              1. Your right of withdrawal
            </h2>
            <p className="mb-4">
              If you are a consumer, you have the right to withdraw from a
              distance contract within 14 days without giving any reason. The
              withdrawal period is 14 days from the day the contract is
              concluded (for purchases of virtual items: the day you complete
              checkout).
            </p>
            <p className="mb-4">
              To exercise the right, inform us —{' '}
              {LEGAL_ENTITY.name}, {LEGAL_ENTITY.street},{' '}
              {LEGAL_ENTITY.postalCode} {LEGAL_ENTITY.city},{' '}
              {LEGAL_ENTITY.country}, e-mail:{' '}
              <a
                href={`mailto:${LEGAL_CONTACT.email}`}
                className="text-venom-orange hover:underline"
              >
                {LEGAL_CONTACT.email}
              </a>{' '}
              — of your decision by an unequivocal statement (e.g. e-mail or
              the{' '}
              <Link href="/contact" className="text-venom-orange hover:underline">
                contact form
              </Link>
              ). You may use the model form below, but it is not obligatory.
              Sending the notice before the period expires is sufficient.
            </p>
            <p>
              If you withdraw, we will reimburse all payments received from you
              for the contract concerned without undue delay and at the latest
              within 14 days of receiving your notice, using the same means of
              payment you used, at no cost to you.
            </p>
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              2. Early expiry for digital content
            </h2>
            <p className="mb-4">
              Purchases in SupaSnake are digital content delivered immediately
              (virtual items are credited to your account right after
              checkout). Under §18(1)(11) FAGG, the right of withdrawal
              expires early if, before the end of the withdrawal period:
            </p>
            <ul className="list-disc list-inside space-y-2 text-beige mb-4">
              <li>
                you expressly consented to delivery beginning immediately, and
              </li>
              <li>
                you acknowledged that you thereby lose your right of
                withdrawal, and
              </li>
              <li>we provided you a confirmation of the contract.</li>
            </ul>
            <p>
              That is why checkout asks for this consent before you pay. If you
              prefer to keep your full 14-day withdrawal right, do not tick the
              consent box — in that case we deliver the content only after the
              withdrawal period ends.
            </p>
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              3. Subscriptions (SupaSnake Premium)
            </h2>
            <p className="mb-4">
              SupaSnake Premium is a recurring <em>digital service</em>, not
              one-off digital content. Different rules therefore apply
              (§§ 10, 16 FAGG):
            </p>
            <ul className="list-disc list-inside space-y-2 text-beige mb-4">
              <li>
                At checkout you expressly request that the service starts
                immediately, during the 14-day withdrawal period.
              </li>
              <li>
                You may still withdraw within 14 days of subscribing. In that
                case you pay only a proportionate amount for the period in
                which the service was already provided; the rest is refunded
                without undue delay and at the latest within 14 days.
              </li>
              <li>
                The withdrawal right expires only once the service has been
                fully performed for the agreed period.
              </li>
            </ul>
            <p>
              Independently of the withdrawal right, you can cancel the
              subscription at any time — effective at the end of the paid
              billing period — via <em>Settings → Subscription → Manage /
              cancel subscription</em> (Stripe customer portal). No reasons,
              no fees. Perks already granted (cosmetics, claimed season
              rewards) are never taken away.
            </p>
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              4. Statutory warranty is unaffected
            </h2>
            <p>
              The expiry of the withdrawal right never affects your statutory
              warranty rights: if purchased digital content is defective, not
              provided, or materially degraded, you retain all remedies under
              the Verbrauchergewährleistungsgesetz (VGG). See section 4 of the{' '}
              <Link
                href="/legal/terms"
                className="text-venom-orange hover:underline"
              >
                Terms of Service
              </Link>
              .
            </p>
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              5. Model withdrawal form
            </h2>
            <p className="mb-4 text-beige">
              (Complete and return this form only if you wish to withdraw from
              the contract.)
            </p>
            <div className="bg-scale-blue-dark border border-scale-blue-light rounded-arcade p-4 font-mono text-sm text-beige whitespace-pre-line">
              {`To: ${LEGAL_ENTITY.name}, ${LEGAL_ENTITY.street}, ${LEGAL_ENTITY.postalCode} ${LEGAL_ENTITY.city}, ${LEGAL_ENTITY.country}
E-mail: ${LEGAL_CONTACT.email}

I/we (*) hereby give notice that I/we (*) withdraw from my/our (*)
contract for the provision of the following service/digital content:

— Ordered on (*): ____________
— Order/receipt reference: ____________
— Name of the consumer(s): ____________
— Address of the consumer(s): ____________
— Account handle or e-mail used in the Game: ____________

Signature of the consumer(s) (only if this form is notified on paper)
Date: ____________

(*) Delete as appropriate.`}
            </div>
          </section>
        </div>

        <LegalPageFooter currentPath="/legal/withdrawal" />
      </div>
    </main>
  );
}

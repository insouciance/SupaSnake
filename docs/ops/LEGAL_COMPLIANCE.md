# Legal & Compliance — Status and Runbook

Operator: **Insoucience Technologies GmbH**, Modecenterstraße 20/1/410,
1030 Wien, Austria. The central source of truth is
`src/shared/config/legal.ts`; legal pages must not duplicate company data.

This is an engineering compliance inventory, not legal advice. Final launch
approval remains a human/legal decision.

## Implemented

| Surface | Route / artifact | Control |
|---|---|---|
| Impressum, disclosure, DSA contact and ADR statement | `/legal/impressum` | ECG / UGB / MedienG / DSA disclosures |
| Privacy and cookie notices | `/legal/privacy`, `/legal/cookies` | Activity, processor, storage and consent inventory |
| Terms, withdrawal, accessibility | `/legal/terms`, `/legal/withdrawal`, `/legal/accessibility` | Consumer/digital-service disclosures |
| Contact and data-subject intake | `/contact`, migration 027 | RLS-protected request records |
| Terms evidence | signup and guest upgrade | Accepted version and timestamp in Auth metadata |
| Austrian age threshold | age gate and `/api/age-verify` | 14+, opaque random receipt; DOB is not stored or hashed |
| Consent-gated analytics | consent and analytics providers | PostHog remains off before opt-in |
| Immediate-delivery consent | shop and `/api/checkout` | Server-enforced, stored in Stripe metadata |
| Data portability | `/settings/privacy`, `/api/user/export-data` | RLS-scoped export; no arbitrary-user SECURITY DEFINER RPC |
| Account erasure | `/settings/privacy`, migration 035, daily worker | 30-day registered grace; immediate explicit guest erasure; recoverable worker |

Migration 035 removes public access to age-verification records. Its deletion
state machine uses service-only functions, row-lock serialization, server-side
re-login detection, a 15-minute stale lease, post-Auth purchase anonymization,
and recovery when a worker stops between Auth erasure and audit completion.

## Verified company disclosures (2026-07-22)

- Austrian JustizOnline reports active `Insoucience Technologies GmbH`,
  `FN 672280y`, Wien; register court is Handelsgericht Wien.
- European Commission VIES validates `ATU82996527` for the same entity/address.
- Management disclosure is `Josef Willy Pepe Bell`.
- The canonical legal, privacy and support contact is
  `support@supasnake.com`; the domain owner is responsible for routing and
  monitoring it.
- The Impressum version was bumped after these fields were populated.

## Commercial-launch gates

These items do not block an operator-only production-environment deployment,
but must be closed before marketing or opening the product commercially.

1. Verify delivery and operational monitoring for `support@supasnake.com`.
2. Confirm the exact WKO Fachgruppe and supervisory-authority wording.
3. Confirm signed/click-through DPAs and transfer mechanisms for Supabase,
   Vercel, PostHog, Sentry, Stripe, Resend and OpenAI.
4. Keep the deployed 001–037 migration history aligned and assign an operator
   for `contact_messages` and `gdpr_requests` deadlines.
5. Complete counsel review of the Premium subscription, Germany cancellation
   surface, Terms, withdrawal flow, and final legal copy.
6. Establish the internal Article 30 processing record and Article 33
   72-hour breach-response owner/path.

## Operational rules

- Data-subject requests receive an owner and due date immediately; the GDPR
  response deadline is not delegated to an unattended database row.
- Do not manually delete an Auth user before migration 035 and the worker are
  live; use the application flow so retained accounting rows are anonymized.
- Stripe remains the authoritative payment/tax record. The application retains
  non-identifying product totals after erasure, not provider lookup IDs.
- Failed Auth erasure returns the request to pending. Post-Auth finalization
  failures remain processing and are automatically recovered after the lease.
- Vercel does not retry cron calls. Alert on non-2xx worker responses and inspect
  the daily report counts.
- When adding a processor, OAuth provider, AI feature, or new data category,
  update the processor/activity inventory and bump the applicable document
  version before release.

## Follow-up improvements

- Decide whether the unused server-side consent audit table should be wired or
  removed for data minimization.
- Remove the unused legacy `analytics_events` table in a separately reviewed
  migration.
- Configure Resend and verify `noreply@supasnake.com` before advertising weekly
  digest e-mail as available.

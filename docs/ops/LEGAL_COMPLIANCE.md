# Legal & Compliance — Status and Runbook

Operator: **Insoucience Technologies GmbH**, Modecenterstraße 20/1/410, 1030 Vienna, Austria.
Data protection contact: Josef Bell.

Single source of truth for company data, contact addresses, minimum age and
document versions: `src/shared/config/legal.ts`. Every legal surface reads
from it — update it there, never inline in pages.

## Implemented (2026-07-19)

| Surface | Route / file | Legal basis |
|---|---|---|
| Impressum + Offenlegung + DSA contact point + ADR statement | `/legal/impressum` | §5 ECG, §14 UGB, §§24–25 MedienG, Art. 11–12 DSA, AStG |
| Privacy policy (per-activity legal bases, processor table, DSB complaint info) | `/legal/privacy` | Art. 13/14 GDPR, §165(3) TKG |
| Cookie policy (actual cookies + localStorage inventory) | `/legal/cookies` | §165(3) TKG |
| Terms of Service (consumer-law compliant, DSA moderation, virtual items) | `/legal/terms` | KSchG, FAGG, VGG, DSA |
| Withdrawal notice + model form | `/legal/withdrawal` | §§4, 11, 18 FAGG |
| Accessibility statement | `/legal/accessibility` | BaFG / EAA |
| Contact form (privacy requests, DSA content reports) | `/contact` → `/api/contact` → `contact_messages` table (migration 027) | Art. 12 GDPR, Art. 12/16 DSA |
| Global footer with all legal links | `src/components/ui/Footer.tsx` in root layout | — |
| Terms acceptance at signup + guest upgrade (version recorded in auth metadata) | `LoginForm.tsx`, `AccountUpgrade.tsx`, `AuthProvider.tsx` | accountability |
| Age gate raised 13 → 14 | `AgeGate.tsx`, `/api/age-verify` | Art. 8 GDPR + §4(4) DSG |
| §18 FAGG immediate-delivery consent before checkout (server-enforced, stored in Stripe metadata) | shop page + `/api/checkout` | §18(1)(11) FAGG |
| Cookie consent banner (pre-existing, opt-in, gates PostHog) | `ConsentBanner.tsx`, `AnalyticsProvider.tsx` | §165(3) TKG |
| Data export + 30-day-grace deletion self-service (pre-existing) | `/settings/privacy` | Art. 17/20 GDPR |

Deliberately **not** included: link to the EU ODR platform (discontinued
20 July 2025 by Regulation (EU) 2024/3228 — linking it is now a defect, not
a duty).

## Launch blockers — must be completed before go-live

1. **Firmenbuchnummer + UID + managing director(s)** — fill in
   `src/shared/config/legal.ts` (`commercialRegisterNumber`, `vatId`,
   `managingDirectors`). The Impressum renders a red "[To be completed
   before launch]" marker until set. Required by §5 ECG / §14 UGB.
2. **Role mailbox** — `bllj@proton.me` is currently published (an e-mail
   address in the Impressum is mandatory under §5 ECG; a contact form alone
   is not enough). Set up e.g. `contact@insoucience.at` and swap
   `LEGAL_CONTACT.email` / `dataProtectionEmail` in one place.
3. **Apply migration 027** (`contact_messages`) to the production Supabase
   project, and decide who monitors the inbox (`status='new'` rows) —
   GDPR requests have a one-month statutory deadline.
4. **Verify the Supabase project region is EU** — the privacy policy states
   EU hosting.
5. **DPAs / transfer safeguards** — confirm signed DPAs (all standard
   click-through) with: Supabase, Vercel, PostHog (EU), Sentry, Stripe,
   Resend, OpenAI. Confirm current EU–U.S. DPF certification for the US
   providers; the policy claims DPF/SCCs.
6. **WKO Fachgruppe** — confirm the actual chamber section (likely UBIT
   Wien) and tighten the `chamberMembership` string.

## Recommended (not blocking)

- **Server-side consent audit trail**: migration 008 created
  `user_consents` (with ip/user-agent columns) but nothing writes to it;
  consent lives in localStorage only. Either wire the ConsentBanner to
  record consent server-side for signed-in users, or drop the unused
  columns (data-minimisation).
- **`analytics_events` legacy table** (migration 008) is unused — drop it.
- **Middleware CORS** allowlists `ogsnake.com` domains the company may not
  own (`src/middleware.ts`) — remove them (squats could gain credentialed
  CORS access) and update `middleware.test.ts`.
- **Records of processing activities (Art. 30 GDPR)**: keep an internal
  RoPA; the privacy policy's section 3 is a ready-made skeleton.
- **Guest-play age gate**: the age gate currently runs only at signup;
  anonymous play has no gate. Analytics is consent-gated so risk is low,
  but consider gating first launch too.
- **Stripe Tax**: enable automatic tax in Stripe Checkout so "prices incl.
  VAT" holds in every jurisdiction, and configure OSS registration once
  EU B2C sales start.
- **Breach response**: document the 72-hour Art. 33 GDPR notification path
  (who calls the DSB, dsb.gv.at).
- When new processors/features ship (new AI providers, new OAuth,
  tournaments), extend privacy policy section 3 + the processor table, bump
  `LEGAL_VERSIONS.privacy`, and announce material changes in-game.

## How to change legal documents

1. Edit the page under `src/app/legal/*`.
2. Bump the matching date in `LEGAL_VERSIONS` (`src/shared/config/legal.ts`).
3. For Terms changes: material changes need 30 days' advance notice
   (Terms §10) — announce in-game/by e-mail before the version takes
   effect; the accepted version is recorded per account at signup.
